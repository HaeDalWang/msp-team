import io
import json
import os
import unittest
import zipfile
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from webapp.server import app
from webapp.validation import owner_key, Report
from webapp import renderer


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'DIGEST_LOCAL_TOKEN': 'test-only-token', 'DATA_BUCKET': 'test-bucket', 'BEDROCK_MODEL_ID': 'server-model'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(app)
        self.headers = {'x-digest-local-token': 'test-only-token', 'x-msp-user-id': 'alice', 'x-msp-user-name': 'Alice'}

    def test_private_auth_and_local_default_fail_closed(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.get('/api/config').status_code, 403)
        self.assertEqual(self.client.get('/api/config', headers=self.headers).status_code, 200)
        with patch.dict(os.environ, {'DIGEST_LOCAL_TOKEN': ''}):
            self.assertEqual(self.client.get('/api/config', headers=self.headers).status_code, 403)

    def test_upload_post_policy_enforces_size_and_scopes_key(self):
        with patch('webapp.server.s3') as client:
            client.return_value.generate_presigned_post.return_value = {'url': 'https://test-bucket.s3.ap-northeast-2.amazonaws.com', 'fields': {}}
            response = self.client.post('/api/upload-url', headers=self.headers, json={'files': [{'name': 'report.pdf', 'size': 200}]})
            self.assertEqual(response.status_code, 200)
            args = client.return_value.generate_presigned_post.call_args.kwargs
            self.assertIn(['content-length-range', 1, 200], args['Conditions'])
            self.assertTrue(args['Key'].startswith('uploads/' + owner_key('alice') + '/'))
            self.assertEqual(args['ExpiresIn'], 900)

    def test_other_user_keys_fail_before_s3_or_bedrock(self):
        with patch('webapp.server.s3') as client:
            response = self.client.post('/api/analyze', headers=self.headers, json={'session_id': 'a' * 32, 'keys': ['uploads/bob/file.pdf']})
            self.assertEqual(response.status_code, 400)
            client.assert_not_called()

    def test_analysis_stream_uses_server_model_and_preserves_evidence(self):
        called = []
        async def model(text, model_id):
            called.append(model_id)
            yield {'type': 'progress', 'completed': 1}
            yield {'type': 'result', 'data': {'customer': {}, 'sales': [{'title': 'AWS update', 'source_quote': 'Original evidence'}]}}
        with patch('webapp.server.read_pdfs', return_value='source text'), patch('webapp.server.llm_parser.parse_with_llm_stream', model), patch('webapp.server.s3'):
            response = self.client.post('/api/analyze', headers=self.headers, json={'session_id': 'a' * 32, 'keys': ['uploads/' + owner_key('alice') + '/' + 'a' * 32 + '/' + 'b' * 32 + '.pdf'], 'model_id': 'attacker-model'})
            events = [json.loads(line) for line in response.text.splitlines()]
            self.assertEqual(called, ['server-model'])
            self.assertTrue(events[-1]['success'])
            self.assertEqual(events[-1]['data']['sales'][0]['source_quote'], 'Original evidence')

    def test_invalid_pdf_stream_has_error_not_fake_success(self):
        with patch('webapp.server.read_pdfs', side_effect=ValueError('bad PDF')):
            response = self.client.post('/api/analyze', headers=self.headers, json={'session_id': 'a' * 32, 'keys': ['uploads/' + owner_key('alice') + '/' + 'a' * 32 + '/' + 'b' * 32 + '.pdf']})
            events = [json.loads(line) for line in response.text.splitlines()]
            self.assertIn('error', events[-1])
            self.assertNotIn('success', events[-1])

    def test_preview_validates_kind_and_escapes_imported_markup(self):
        payload = {'state': {'meta': {'title': '<script>bad()</script>'}, 'sales': [], 'customer': {}}, 'kind': 'customer'}
        response = self.client.post('/api/preview', headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('<script>', response.text)
        payload['kind'] = '../../etc/passwd'
        self.assertEqual(self.client.post('/api/preview', headers=self.headers, json=payload).status_code, 422)

    def test_zip_has_seven_artifacts(self):
        with patch('webapp.renderer.html_to_pdf_bytes', return_value=b'%PDF-test'):
            result = renderer.zip_report(Report().model_dump())
        with zipfile.ZipFile(io.BytesIO(result)) as archive:
            self.assertEqual(len(archive.namelist()), 7)
            self.assertEqual(archive.read('고객용_리포트.pdf'), b'%PDF-test')

    def test_slack_uses_authenticated_name_and_fixed_channel(self):
        secret = MagicMock()
        secret.get_secret_value.return_value = {'SecretString': json.dumps({'SLACK_BOT_TOKEN': 'test-token', 'SLACK_CHANNEL_ID': 'TEAM'})}
        with patch.dict(os.environ, {'SLACK_SECRET_ARN': 'secret-arn'}), patch('webapp.server.boto3.client', return_value=secret), patch('slack_sdk.WebClient') as slack:
            response = self.client.post('/api/slack-notify', headers=self.headers, json={'state': {}, 'selected_files': ['full_json'], 'reviewer': 'fake-admin', 'channel': 'ATTACKER'})
            self.assertEqual(response.status_code, 200)
            args = slack.return_value.files_upload_v2.call_args.kwargs
            self.assertEqual(args['channel'], 'TEAM')
            self.assertIn('Alice', args['initial_comment'])
            self.assertNotIn('fake-admin', args['initial_comment'])

    def test_slack_missing_setup_and_invalid_selection(self):
        with patch.dict(os.environ, {'SLACK_SECRET_ARN': ''}):
            self.assertEqual(self.client.post('/api/slack-notify', headers=self.headers, json={'state': {}, 'selected_files': ['full_json']}).status_code, 503)
        self.assertEqual(self.client.post('/api/slack-notify', headers=self.headers, json={'state': {}, 'selected_files': ['unknown']}).status_code, 400)


class PdfSmokeTests(unittest.TestCase):
    def test_actual_chromium_pdf_and_text_extraction(self):
        from webapp.pdf_parser import extract_text_from_pdfs
        report = Report.model_validate({'meta': {'title': 'AWS Monthly Report 월간 리포트'}, 'sales': [{'title': 'Amazon EC2 update', 'body': 'Review this update.'}]})
        pdf = renderer.html_to_pdf_bytes(renderer.render_html(report.model_dump(), 'sales'))
        self.assertTrue(pdf.startswith(b'%PDF-'))
        text = extract_text_from_pdfs([{'content': pdf}])
        self.assertIn('Amazon EC2 update', text)
        self.assertIn('월간', text)


if __name__ == '__main__':
    unittest.main()
