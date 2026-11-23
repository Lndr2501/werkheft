FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 WERKHEFT_BIND=0.0.0.0 WERKHEFT_DB=/data/werkheft.sqlite
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
USER node:node
EXPOSE 3000
CMD ["node", "server.mjs"]
