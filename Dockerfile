FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 API_ONLY=true

# The API uses only Node built-ins and the shared activity adapter.
COPY --chown=node:node package.json server.mjs LICENSE ./
COPY --chown=node:node src/activity.js ./src/activity.js

USER node
EXPOSE 4174
CMD ["node", "server.mjs"]
