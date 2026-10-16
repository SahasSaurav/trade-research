# syntax=docker/dockerfile:1

# Dependency stage: installs production deps once, so the runtime stage copies
# them instead of running a package install of its own.
FROM node:26-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Cache mount keeps the npm cache across rebuilds without adding an image layer.
RUN --mount=type=cache,target=/root/.npm \
	npm ci --omit=dev --no-audit --no-fund

FROM node:26-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# The job never shells out to npm, so drop the package manager from the image.
RUN rm -rf /usr/local/lib/node_modules/npm \
		/usr/local/bin/npm /usr/local/bin/npx \
		/usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
		/opt/yarn*

COPY tsconfig.json ./
COPY src ./src

# Run unprivileged; the job writes nothing to disk.
USER node

# tsx runs the TypeScript directly and resolves the tsconfig @src/* aliases,
# so no compile step or path-rewrite tool is needed.
CMD ["node", "--import", "tsx", "src/index.ts"]
