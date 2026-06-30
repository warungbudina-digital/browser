# ── Stage 1: install npm deps + download Chromium ─────────────────────────────
FROM node:22.16-bookworm AS builder

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN npx patchright install --with-deps chromium

# ── Stage 2: lean runtime ──────────────────────────────────────────────────────
FROM node:22.16-bookworm-slim AS runtime

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV BROWSER_PROFILE_DIR=/data/profiles/openclaw
ENV BROWSER_ARTIFACT_DIR=/data/artifacts
ENV BROWSER_HEADLESS=true

WORKDIR /app

# Chromium system libs + curl untuk HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libfreetype6 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /ms-playwright /ms-playwright
COPY --from=builder /app/node_modules ./node_modules

COPY src ./src
COPY db ./db
COPY examples ./examples
COPY README.md ./README.md

RUN mkdir -p /data/profiles /data/artifacts

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:8080/health || exit 1

CMD ["node", "./src/index.js"]
