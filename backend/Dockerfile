FROM python:3.12-slim AS builder
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
RUN python -m venv "${VIRTUAL_ENV}" && pip install --no-cache-dir uv
WORKDIR /build
COPY pyproject.toml ./
COPY app ./app
RUN uv pip install --python "${VIRTUAL_ENV}/bin/python" .

FROM python:3.12-slim AS production
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin fikaai
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=fikaai:fikaai app ./app
COPY --chown=fikaai:fikaai migrations ./migrations
COPY --chown=fikaai:fikaai scripts ./scripts
COPY --chown=fikaai:fikaai alembic.ini pyproject.toml start.sh ./
RUN chmod +x /app/start.sh && mkdir -p /app/models_data && chown -R fikaai:fikaai /app
USER fikaai
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/health', timeout=3)" || exit 1
CMD ["/app/start.sh"]
