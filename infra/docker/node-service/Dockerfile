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
COPY packages/runtime packages/runtime
COPY packages/db packages/db
COPY services services
ARG SERVICE
RUN npm run build --workspace @kinetiq/contracts \
    && npm run build --workspace @kinetiq/runtime \
    && npm run build --workspace @kinetiq/db \
    && npm run build --workspace @kinetiq/${SERVICE}

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /app
ARG SERVICE
ENV NODE_ENV=production SERVICE=${SERVICE}
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/packages/contracts/package.json packages/contracts/package.json
COPY --from=build /app/packages/runtime/package.json packages/runtime/package.json
COPY --from=build /app/packages/db/package.json packages/db/package.json
COPY --from=build /app/packages/pipeline-tests/package.json packages/pipeline-tests/package.json
COPY --from=build /app/services/simulator/package.json services/simulator/package.json
COPY --from=build /app/services/local-bridge/package.json services/local-bridge/package.json
COPY --from=build /app/services/ingest/package.json services/ingest/package.json
COPY --from=build /app/services/api/package.json services/api/package.json
RUN npm ci --omit=dev --workspace @kinetiq/${SERVICE} --include-workspace-root=false --ignore-scripts \
    && npm cache clean --force
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/runtime/dist packages/runtime/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/migrations packages/db/migrations
COPY --from=build /app/services/${SERVICE}/dist services/${SERVICE}/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health/live', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "exec node services/$SERVICE/dist/main.js"]
