# ── Stage 1: deps — npm ci + patchright Chromium download ─────────────────────
FROM node:22.16-bookworm AS deps

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN npx patchright install chromium

# ── Stage 2: browser-runner — dedicated Chromium CDP server ───────────────────
FROM node:22.16-bookworm-slim AS browser-runner

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
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

COPY --from=deps /ms-playwright /ms-playwright
COPY src/browser-server.js /app/browser-server.js

EXPOSE 9222

# Node.js CDP proxy: spawns Chrome on 127.0.0.1:9223, proxies+rewrites URLs on 0.0.0.0:9222.
# Needed because patchright's Chromium ignores --remote-debugging-address=0.0.0.0.
CMD ["node", "/app/browser-server.js"]

# ── Stage 3: runtime — slim API service (no bundled Chromium) ─────────────────
FROM node:22.16-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY src ./src
COPY db ./db
COPY examples ./examples
COPY README.md ./README.md

RUN mkdir -p /data/profiles /data/artifacts /data/state

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:8080/health || exit 1

CMD ["node", "./src/index.js"]
