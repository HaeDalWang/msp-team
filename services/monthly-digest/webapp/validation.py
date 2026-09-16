"""Bounded input shared by AI output, JSON imports and report rendering."""
import re
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Text = Annotated[str, StringConstraints(max_length=12000)]


class Record(BaseModel):
    model_config = ConfigDict(extra='ignore')


class Meta(Record):
    title: Text = 'AWS 월간 리포트'
    written: Text = ''
    customer_intro: Text = ''
    sales_intro: Text = ''


class Update(Record):
    source_quote: Text = ''
    title: Text = ''
    badge: Text = ''
    date: Text = ''
    body: Text = ''
    url: Text = ''

    @field_validator('url')
    @classmethod
    def safe_url(cls, value):
        try:
            parsed = urlsplit(value)
            return value if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username else ''
        except ValueError:
            return ''


class Eol(Record):
    source_quote: Text = ''
    service: Text = ''
    target: Text = ''
    date: Text = ''
    badge: Text = ''
    action: Text = ''


class Customer(Record):
    eol_eos: list[Eol] = Field(default_factory=list, max_length=150)
    whats_new: list[Update] = Field(default_factory=list, max_length=150)


class Script(Record):
    outline: Annotated[str, StringConstraints(max_length=100000)] = ''
    speech: Annotated[str, StringConstraints(max_length=100000)] = ''


class Report(Record):
    meta: Meta = Field(default_factory=Meta)
    customer: Customer = Field(default_factory=Customer)
    sales: list[Update] = Field(default_factory=list, max_length=150)
    script: Script = Field(default_factory=Script)
    diagnostics: dict = Field(default_factory=dict)


class UploadFile(Record):
    name: Annotated[str, StringConstraints(min_length=1, max_length=180)]
    size: int = Field(gt=0, le=20 * 1024 * 1024, strict=True)

    @field_validator('name')
    @classmethod
    def pdf_name(cls, value):
        if not value.lower().endswith('.pdf') or any(c in value for c in ('/', '\\')) or any(ord(c) < 32 for c in value):
            raise ValueError('PDF 파일명만 허용됩니다.')
        return value


class UploadRequest(Record):
    files: list[UploadFile] = Field(min_length=1, max_length=3)


def owner_key(user_id):
    # Site IDs are not necessarily Slack IDs. Encode instead of using raw IDs as S3 paths.
    import hashlib
    return hashlib.sha256(user_id.encode()).hexdigest()[:32]


def validate_keys(user_id, session_id, keys):
    if not re.fullmatch(r'[a-f0-9]{32}', session_id) or not 1 <= len(keys) <= 3 or len(keys) != len(set(keys)):
        raise ValueError('업로드 세션이 올바르지 않습니다.')
    prefix = f'uploads/{owner_key(user_id)}/{session_id}/'
    for key in keys:
        if not isinstance(key, str) or not key.startswith(prefix) or not re.fullmatch(r'[a-f0-9]{32}\.pdf', key[len(prefix):]):
            raise ValueError('본인이 업로드한 PDF만 분석할 수 있습니다.')
    return prefix
