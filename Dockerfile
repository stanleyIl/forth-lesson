FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec \
    && mkdir -p /var/lib/campusclaw/materials \
    && chown -R node:node /var/lib/campusclaw
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "chown -R node:node /var/lib/campusclaw/materials && exec su-exec node sh -c 'node dist/db/migrate.js && exec node dist/server.js'"]
