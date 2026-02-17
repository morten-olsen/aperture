# Stage 1: Prune the monorepo to only the server package and its dependencies
FROM node:24-slim AS pruner
RUN corepack enable && corepack prepare pnpm@10.6.0 --activate
WORKDIR /app
COPY . .
RUN npx turbo@2.8.8 prune @morten-olsen/agentic-server --docker

# Stage 2: Install all dependencies and build
FROM node:24-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.6.0 --activate
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm build
RUN pnpm prune --prod

# Stage 3: Minimal runtime image
FROM node:24-slim AS runner
WORKDIR /app

RUN groupadd --gid 1001 glados && \
  useradd --uid 1001 --gid glados --create-home glados

COPY --from=builder --chown=glados:glados /app .

RUN mkdir -p /data && chown glados:glados /data
VOLUME /data
ENV DATABASE_LOCATION=/data/db.sqlite

USER glados

CMD ["node", "packages/server/dist/server/server.start.js"]
