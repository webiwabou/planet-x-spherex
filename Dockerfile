FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GAIA_CACHE_DIR=/app/.cache/gaia \
    SPHEREX_CACHE_DIR=/app/.cache/spherex

WORKDIR /app
COPY astro_engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin spherex \
    && mkdir -p /app/.cache/gaia /app/.cache/spherex \
    && chown -R spherex:spherex /app/.cache

COPY astro_engine ./astro_engine
COPY resources/gaia/targets.json ./resources/gaia/targets.json
COPY resources/gaia/samples ./resources/gaia/samples
COPY resources/spherex/samples ./resources/spherex/samples
COPY resources/sample_data ./resources/sample_data

USER spherex
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD ["python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()"]
CMD ["python", "-m", "uvicorn", "main:app", "--app-dir", "astro_engine", "--host", "0.0.0.0", "--port", "8000"]
