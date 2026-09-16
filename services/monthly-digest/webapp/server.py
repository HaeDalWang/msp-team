"""Private Lambda service. Only the authenticated MSP server invokes this function.

No Function URL or public HTTP gateway is provisioned. Local HTTP requires an
explicit token; never use this local transport on a public interface.
"""
import asyncio
import hmac
import json
import logging
import os
import uuid
from urllib.parse import unquote

import boto3
from botocore.config import Config
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from . import llm_parser, renderer
from .pdf_parser import extract_text_from_pdfs
from .validation import Report, UploadRequest, owner_key, validate_keys

log = logging.getLogger('monthly-digest')
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def identity(request: Request, call_next):
    if request.url.path == '/health':
        return await call_next(request)
    if not os.getenv('AWS_LAMBDA_FUNCTION_NAME'):
        token = os.getenv('DIGEST_LOCAL_TOKEN', '')
        if not token or not hmac.compare_digest(token, request.headers.get('x-digest-local-token', '')):
            return JSONResponse({'error': '인증이 필요합니다.'}, status_code=403)
    # In Lambda, access is controlled by lambda:InvokeFunction IAM permissions.
    user = request.headers.get('x-msp-user-id', '')
    if not user or len(user) > 100:
        return JSONResponse({'error': '사용자 정보가 없습니다.'}, status_code=403)
    request.state.user = user
    request.state.name = unquote(request.headers.get('x-msp-user-name', ''))[:100]
    return await call_next(request)


@app.exception_handler(HTTPException)
async def http_error(_request, error):
    return JSONResponse({'error': error.detail}, status_code=error.status_code)


@app.get('/health')
def health():
    return {'ok': True}


def s3():
    region = os.getenv('AWS_REGION', 'ap-northeast-2')
    return boto3.client('s3', region_name=region, endpoint_url=f'https://s3.{region}.amazonaws.com',
                        config=Config(signature_version='s3v4', s3={'addressing_style': 'virtual'}, retries={'max_attempts': 1}))


def bucket():
    value = os.getenv('DATA_BUCKET')
    if not value:
        raise HTTPException(503, '리포트 저장소가 설정되지 않았습니다.')
    return value


@app.get('/api/config')
def config():
    return {'enabled': True, 'model': os.environ.get('BEDROCK_MODEL_ID', llm_parser.DEFAULT_MODEL_ID),
            'maxFiles': 3, 'maxFileBytes': 20 * 1024 * 1024, 'maxPages': 150,
            'slackEnabled': bool(os.getenv('SLACK_SECRET_ARN'))}


@app.post('/api/upload-url')
def upload(payload: UploadRequest, request: Request):
    session = uuid.uuid4().hex
    client = s3()
    uploads = []
    for file in payload.files:
        key = f'uploads/{owner_key(request.state.user)}/{session}/{uuid.uuid4().hex}.pdf'
        signed = client.generate_presigned_post(
            Bucket=bucket(), Key=key, Fields={'Content-Type': 'application/pdf'},
            Conditions=[{'Content-Type': 'application/pdf'}, ['content-length-range', 1, file.size]], ExpiresIn=900)
        uploads.append({'name': file.name, 'key': key, **signed})
    return {'session_id': session, 'uploads': uploads}


class Analyze(BaseModel):
    session_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    keys: list[str] = Field(min_length=1, max_length=3)


def read_pdfs(user, payload):
    validate_keys(user, payload.session_id, payload.keys)
    client = s3()
    files = []
    for key in payload.keys:
        response = client.get_object(Bucket=bucket(), Key=key)
        stream = response['Body']
        try:
            if not 0 < response['ContentLength'] <= 20 * 1024 * 1024:
                raise ValueError('PDF는 파일당 20MB까지 가능합니다.')
            body = stream.read(20 * 1024 * 1024 + 1)
            if len(body) > 20 * 1024 * 1024:
                raise ValueError('PDF가 너무 큽니다.')
            files.append({'content': body})
        finally:
            stream.close()
    return extract_text_from_pdfs(files)


@app.post('/api/analyze')
async def analyze(payload: Analyze, request: Request):
    try:
        validate_keys(request.state.user, payload.session_id, payload.keys)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error

    async def events():
        def progress(value, message):
            return json.dumps({'progress': value, 'msg': message}, ensure_ascii=False) + '\n'
        try:
            yield progress(10, 'PDF 텍스트를 읽고 있습니다.')
            task = asyncio.create_task(asyncio.to_thread(read_pdfs, request.state.user, payload))
            while not task.done():
                await asyncio.wait([task], timeout=10)
                if not task.done():
                    yield progress(15, 'PDF 텍스트를 읽고 있습니다.')
            text = task.result()
            yield progress(25, '고객용·영업용·발표 대본을 분석합니다.')
            report = None
            model = os.getenv('BEDROCK_MODEL_ID', llm_parser.DEFAULT_MODEL_ID)
            async for event in llm_parser.parse_with_llm_stream(text, model):
                if event['type'] == 'progress':
                    yield progress(25 + event['completed'] * 20, 'AI 분석 중입니다.')
                else:
                    report = Report.model_validate(event['data']).model_dump()
            if report is None:
                raise ValueError('분석 결과가 없습니다.')
            encoded = json.dumps(report, ensure_ascii=False).encode()
            if len(encoded) > 1800000:
                raise ValueError('분석 결과가 너무 큽니다. 입력 문서를 나눠 주세요.')
            yield progress(95, '분석 결과를 저장합니다.')
            key = f'archive/{owner_key(request.state.user)}/{payload.session_id}/report.json'
            await asyncio.to_thread(s3().put_object, Bucket=bucket(), Key=key, Body=encoded, ContentType='application/json')
            yield json.dumps({'success': True, 'data': report}, ensure_ascii=False) + '\n'
        except ValueError:
            log.warning('Invalid PDF or analysis output; user=%s', request.state.user)
            yield json.dumps({'error': 'PDF 또는 분석 결과를 확인하세요. 텍스트 PDF 3개·파일당 20MB·합계 150페이지까지 지원합니다.'}, ensure_ascii=False) + '\n'
        except Exception:
            log.exception('Analysis failed')
            yield json.dumps({'error': '분석에 실패했습니다. 입력 문서와 연결 상태를 확인한 뒤 다시 시도해 주세요.'}, ensure_ascii=False) + '\n'

    return StreamingResponse(events(), media_type='application/x-ndjson', headers={'Cache-Control': 'no-store, no-transform'})


class RenderRequest(BaseModel):
    state: Report
    kind: str = Field(default='customer', pattern=r'^(customer|sales)$')


@app.post('/api/preview')
def preview(payload: RenderRequest):
    return HTMLResponse(renderer.render_html(payload.state.model_dump(), payload.kind))


@app.post('/api/pdf')
def pdf(payload: RenderRequest):
    data = renderer.html_to_pdf_bytes(renderer.render_html(payload.state.model_dump(), payload.kind))
    return Response(data, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{payload.kind}.pdf"'})


@app.post('/api/download-all')
def download(payload: Report):
    return Response(renderer.zip_report(payload.model_dump()), media_type='application/zip',
                    headers={'Content-Disposition': 'attachment; filename="aws-monthly-report.zip"'})


class SlackRequest(BaseModel):
    state: Report
    selected_files: list[str] = Field(min_length=1, max_length=7)


@app.post('/api/slack-notify')
def slack_notify(payload: SlackRequest, request: Request):
    if any(key not in renderer.ARTIFACTS for key in payload.selected_files):
        raise HTTPException(400, '전송할 파일을 확인하세요.')
    arn = os.getenv('SLACK_SECRET_ARN')
    if not arn:
        raise HTTPException(503, 'Slack 전송이 설정되지 않았습니다.')
    try:
        secret = json.loads(boto3.client('secretsmanager').get_secret_value(SecretId=arn)['SecretString'])
        if not secret.get('SLACK_BOT_TOKEN') or not secret.get('SLACK_CHANNEL_ID'):
            raise HTTPException(503, 'Slack 전송 설정이 비어 있습니다.')
        from slack_sdk import WebClient
        files = renderer.artifacts(payload.state.model_dump(), list(dict.fromkeys(payload.selected_files)))
        WebClient(token=secret['SLACK_BOT_TOKEN'], timeout=60).files_upload_v2(
            channel=secret['SLACK_CHANNEL_ID'],
            initial_comment=f"{request.state.name}님의 AWS 월간 리포트입니다.",
            file_uploads=[{'file': body, 'filename': name, 'title': name} for name, body in files.items()])
        return {'success': True}
    except HTTPException:
        raise
    except Exception as error:
        log.exception('Slack delivery failed')
        raise HTTPException(502, 'Slack 전송 결과를 확인하지 못했습니다. 채널에서 수신 여부를 확인한 뒤 재시도하세요.') from error
