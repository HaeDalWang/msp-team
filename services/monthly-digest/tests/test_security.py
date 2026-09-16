import unittest
from webapp.validation import Report, UploadRequest, validate_keys
from webapp.renderer import render_html


class SecurityTests(unittest.TestCase):
    def test_upload_rejects_traversal_non_pdf_and_oversize(self):
        for name, size in [('a.exe', 10), ('../a.pdf', 10), ('a.pdf', 21 * 1024 * 1024)]:
            with self.assertRaises(ValueError):
                UploadRequest(files=[{'name': name, 'size': size}])

    def test_keys_are_scoped_to_user_and_session(self):
        with self.assertRaises(ValueError):
            validate_keys('alice', 'a' * 32, ['uploads/bob/' + 'a' * 32 + '/a.pdf'])

    def test_template_escapes_text_and_rejects_script_urls(self):
        report = Report.model_validate({'meta': {'title': '<script>alert(1)</script>'}, 'sales': [{'title': '<img src=x onerror=alert(1)>', 'body': '- <script>alert(2)</script>', 'url': 'javascript:alert(1)'}]})
        html = render_html(report.model_dump(), 'sales')
        self.assertNotIn('<script', html)
        self.assertNotIn('<img src=x', html)
        self.assertNotIn('href="javascript:', html)
        self.assertIn('&lt;script&gt;', html)


if __name__ == '__main__':
    unittest.main()
