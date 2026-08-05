# One image, one service: the Fastify server serves both the API and the built
# frontend, so there is a single URL and no CORS or base-URL setting anywhere.
#
# Debian-based rather than Alpine on purpose — sharp ships prebuilt binaries for
# glibc, and on musl it falls back to compiling from source, which turns a
# one-minute build into a long and fragile one.
FROM node:22-slim AS build

WORKDIR /app

# Install with the lockfile first so a dependency change is the only thing that
# invalidates this layer, not every edit to the source.
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build

# Drop the build-only dependencies from what ships.
RUN npm prune --omit=dev


FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Only what runs: the compiled server, the built frontend, and the modules they
# need. The TypeScript sources and the design handoff stay out of the image.
#
# One node_modules, at the root. This is an npm workspaces repo, so
# dependencies hoist there and server/node_modules is never created — copying
# it fails the build outright. Node resolves upward from server/dist anyway.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# server/package.json is not optional decoration: it carries "type": "module",
# and without it Node reads the compiled .js as CommonJS and the import
# statements throw on startup.
COPY --from=build /app/server/package.json ./server/package.json

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# The host tells us which port to listen on; 3001 is only the local default.
EXPOSE 3001

CMD ["node", "server/dist/index.js"]
