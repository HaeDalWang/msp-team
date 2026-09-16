import io
import pdfplumber


def extract_text_from_pdfs(files):
    chunks = []
    pages = 0
    length = 0
    for item in files:
        if not item['content'].startswith(b'%PDF-'):
            raise ValueError('올바른 PDF 파일이 아닙니다.')
        with pdfplumber.open(io.BytesIO(item['content'])) as pdf:
            pages += len(pdf.pages)
            if pages > 150:
                raise ValueError('PDF는 합계 150페이지까지 분석할 수 있습니다.')
            for page in pdf.pages:
                text = page.extract_text() or ''
                length += len(text)
                if length > 250000:
                    raise ValueError('문서의 텍스트가 너무 많습니다. 파일을 나눠 주세요.')
                chunks.append(text)
    result = '\n'.join(chunks).strip()
    if not result:
        raise ValueError('PDF에서 텍스트를 읽지 못했습니다. 스캔 문서는 지원하지 않습니다.')
    return result
