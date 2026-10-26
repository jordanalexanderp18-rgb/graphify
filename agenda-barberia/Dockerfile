# Imagen de producción: Node 22, sin dependencias de npm.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY db ./db
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/app.db TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Corre como root a propósito: los volúmenes de Fly/Render se montan como root
# y la base de datos tiene que poder escribirse ahí.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
