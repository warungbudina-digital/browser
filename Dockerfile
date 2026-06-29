FROM node:22-bookworm

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV BROWSER_PROFILE_DIR=/data/profiles/openclaw
ENV BROWSER_ARTIFACT_DIR=/data/artifacts
ENV BROWSER_HEADLESS=true

COPY package.json ./
RUN npm install
RUN npx patchright install --with-deps chromium

COPY src ./src
COPY examples ./examples
COPY README.md ./README.md

RUN mkdir -p /data/profiles /data/artifacts
EXPOSE 8080
CMD ["node", "./src/index.js"]
