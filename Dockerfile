# syntax=docker/dockerfile:1

# Dependency stage: the full install, dev dependencies included, so the build
# stage can run tsc without an install of its own.
FROM node:26-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Cache mount keeps the npm cache across rebuilds without adding an image layer.
RUN --mount=type=cache,target=/root/.npm \
	npm ci --no-audit --no-fund

# Build stage: compile the TypeScript. `npm run build` also rewrites the @src/*
# specifiers tsc leaves behind, so the emitted JavaScript runs on plain Node
# without tsx and without the TypeScript sources.
FROM node:26-alpine3.24 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Production dependencies only. Resolved in its own stage so the compiler and
# the test tooling never reach the runtime image.
FROM node:26-alpine3.24 AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
	npm ci --omit=dev --no-audit --no-fund

FROM node:26-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
# The job never shells out to npm, so drop the package manager from the image.
RUN rm -rf /usr/local/lib/node_modules/npm \
		/usr/local/bin/npm /usr/local/bin/npx \
		/usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
		/opt/yarn*

# Compiled code only; the sources and the compiler stay in the build stage.
COPY --from=build /app/dist/src ./dist/src
# The research agents read their skills from disk at runtime.
COPY skills ./skills

# Run unprivileged. The job writes nothing to disk unless CONTEXT_DB_PATH points
# at a writable volume; /app itself is not one.
USER node

# Plain Node: the build already resolved the aliases, so no loader is needed.
CMD ["node", "dist/src/index.js"]
