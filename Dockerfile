# syntax=docker/dockerfile:1

FROM node:26-alpine3.24
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# Cache mount keeps the npm cache across rebuilds without adding an image layer.
# Production deps only, then drop the package manager the job never uses.
RUN --mount=type=cache,target=/root/.npm \
	npm ci --omit=dev --no-audit --no-fund \
	&& rm -rf /usr/local/lib/node_modules/npm \
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
