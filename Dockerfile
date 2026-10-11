FROM node:24-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server && mkdir -p /app/server/data && chown -R node:node /app
COPY --chown=node:node server/ ./server/
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
