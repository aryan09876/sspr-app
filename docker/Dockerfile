FROM node:20-slim

# openssl requis par Prisma, curl pour le healthcheck
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les fichiers de dépendances d'abord (cache Docker)
COPY package*.json ./
COPY prisma ./prisma/

# Installer les dépendances et générer le client Prisma
RUN npm ci --prefer-offline
RUN npx prisma generate

# Copier le reste du code source
COPY . .

# L'entrypoint fait : prisma migrate + npm run build + npm start
# (ces étapes nécessitent les variables d'environnement, disponibles uniquement au runtime)
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=8 --start-period=60s \
  CMD curl -f http://localhost:3000 || exit 1

ENTRYPOINT ["/entrypoint.sh"]
