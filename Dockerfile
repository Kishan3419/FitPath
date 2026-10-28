FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data NODE_OPTIONS=--max-old-space-size=160
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node static ./static
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
