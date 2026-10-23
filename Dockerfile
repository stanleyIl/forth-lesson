FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec \
    && mkdir -p /var/lib/campusclaw/materials /var/lib/campusclaw/skills \
    && chown -R node:node /var/lib/campusclaw
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "chown -R node:node /var/lib/campusclaw/materials /var/lib/campusclaw/skills && exec su-exec node sh -c 'node dist/db/migrate.js && exec node dist/server.js'"]
