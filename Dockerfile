FROM node:22-slim AS web

WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=export \
    NEXT_PUBLIC_SPHEREX_DATA=auto \
    NEXT_PUBLIC_SPHEREX_API=
COPY package.json package-lock.json patch-node24.js next.config.mjs next-env.d.ts tsconfig.json tailwind.config.ts postcss.config.js ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY resources/gaia/targets.json ./resources/gaia/targets.json
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GAIA_CACHE_DIR=/app/.cache/gaia \
    SPHEREX_CACHE_DIR=/app/.cache/spherex \
    WEB_DIR=/app/web

WORKDIR /app
COPY astro_engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin spherex \
    && mkdir -p /app/.cache/gaia /app/.cache/spherex \
    && chown -R spherex:spherex /app/.cache

COPY astro_engine ./astro_engine
COPY resources/gaia/targets.json ./resources/gaia/targets.json
COPY resources/gaia/samples/barnards_star.json ./resources/gaia/samples/barnards_star.json
COPY resources/spherex/samples ./resources/spherex/samples
COPY --from=web /web/out ./web

USER spherex
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD ["python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()"]
CMD ["python", "-m", "uvicorn", "main:app", "--app-dir", "astro_engine", "--host", "0.0.0.0", "--port", "8000"]
