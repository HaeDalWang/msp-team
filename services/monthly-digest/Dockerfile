FROM public.ecr.aws/lambda/python:3.12@sha256:7ff4d0d3415ebe892b2b021a75b8750b8321969b1858cba37966fbdf2b12012f
ARG AMAZON_LINUX_RELEASE=2023.12.20260914
RUN dnf --releasever=${AMAZON_LINUX_RELEASE} upgrade -y \
    && dnf --releasever=${AMAZON_LINUX_RELEASE} install -y nss atk cups-libs libXcomposite libXcursor libXdamage libXext libXi libXtst pango at-spi2-atk libXt alsa-lib gtk3 libXrandr google-noto-sans-cjk-fonts \
    && dnf clean all
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4@sha256:e2653f741cd15851ba4f13f3cc47d29f2d14377c7d11737bfa272baa1b569007 /lambda-adapter /opt/extensions/lambda-adapter
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright AWS_LWA_INVOKE_MODE=response_stream AWS_LWA_READINESS_CHECK_PATH=/health PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && playwright install chromium && chmod -R 755 /ms-playwright
COPY webapp ${LAMBDA_TASK_ROOT}/webapp
COPY templates ${LAMBDA_TASK_ROOT}/templates
ENTRYPOINT ["python", "-m", "uvicorn", "webapp.server:app", "--host", "0.0.0.0", "--port", "8080"]
