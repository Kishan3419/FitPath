FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=160

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.mjs ./
COPY --chown=node:node static ./static

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000

CMD ["node", "server.mjs"]