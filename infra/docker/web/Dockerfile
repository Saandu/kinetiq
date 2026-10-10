FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/pipeline-tests/package.json packages/pipeline-tests/package.json
COPY services/simulator/package.json services/simulator/package.json
COPY services/local-bridge/package.json services/local-bridge/package.json
COPY services/ingest/package.json services/ingest/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --workspace @kinetiq/contracts
ENV VITE_TELEMETRY_SOURCE=api
RUN npm run build --workspace @kinetiq/web

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY infra/docker/web/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
