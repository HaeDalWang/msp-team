"""Render the original customer/sales layouts with escaped values and isolated PDF IO."""
import io
import json
import zipfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent.parent


def format_bullets(text):
    return Markup('').join(Markup('<div>{}</div>').format(escape(line)) for line in str(text).splitlines())


env = Environment(loader=FileSystemLoader(ROOT / 'templates'), autoescape=True)
env.filters['format_bullets'] = format_bullets


def render_html(report, kind):
    import base64
    if kind not in ('sales', 'customer'):
        raise ValueError('리포트 종류를 확인하세요.')
    logo = ROOT / 'webapp' / 'assets' / 'logo.png'
    logo_src = 'data:image/png;base64,' + base64.b64encode(logo.read_bytes()).decode() if logo.exists() else ''
    customer = report.get('customer', {})
    return env.get_template(f'{kind}.html.j2').render(
        meta=report.get('meta', {}), logo_src=logo_src,
        whats_new=report.get('sales', []) if kind == 'sales' else customer.get('whats_new', []),
        eol_eos=customer.get('eol_eos', []),
    )


def html_to_pdf_bytes(html):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--single-process', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'])
        try:
            context = browser.new_context(java_script_enabled=False, service_workers='block')
            # Reports contain text, CSS and an embedded logo only. Never fetch user URLs.
            context.route('**/*', lambda route: route.abort())
            page = context.new_page()
            page.set_content(html, wait_until='load', timeout=30000)
            page.emulate_media(media='print')
            return page.pdf(format='A4', print_background=True, prefer_css_page_size=True)
        finally:
            browser.close()


ARTIFACTS = {
    'sales_pdf': '영업용_리포트.pdf', 'customer_pdf': '고객용_리포트.pdf',
    'sales_json': '영업용_데이터.json', 'customer_json': '고객용_데이터.json',
    'outline': '발표_아웃라인.md', 'speech': '발표_대본.txt', 'full_json': '전체_백업_데이터.json',
}


def artifacts(report, selected=None):
    result = {}
    for key in selected or ARTIFACTS:
        if key not in ARTIFACTS:
            raise ValueError('산출물 종류를 확인하세요.')
        if key.endswith('_pdf'):
            body = html_to_pdf_bytes(render_html(report, key.split('_')[0]))
        elif key in ('outline', 'speech'):
            body = report.get('script', {}).get(key, '').encode()
        else:
            value = report if key == 'full_json' else report.get(key.split('_')[0], {})
            body = json.dumps(value, ensure_ascii=False, indent=2).encode()
        result[ARTIFACTS[key]] = body
    return result


def zip_report(report):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, body in artifacts(report).items():
            archive.writestr(name, body)
    return output.getvalue()
