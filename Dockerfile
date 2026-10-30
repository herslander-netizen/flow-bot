# Flow Bot — serviço (Node 22). Constrói os pacotes e roda `flow-bot-server iniciar`.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund && npx tsc -b packages/server && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
COPY presets ./presets
USER node
EXPOSE 8080
CMD ["node", "packages/server/bin/flow-bot-server.mjs", "iniciar"]
