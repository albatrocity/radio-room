FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/typescript-config ./packages/typescript-config
COPY apps/dev-radio-station ./apps/dev-radio-station

# typescript-config is required for workspace resolution; runtime only needs redis + tsx.
RUN npm ci --workspace=dev-radio-station --include-workspace-root --omit=dev

WORKDIR /app/apps/dev-radio-station

ENV PORT=8010
ENV HOST=0.0.0.0
EXPOSE 8010

CMD ["npx", "tsx", "src/index.ts"]
