FROM node:20-slim

# openssl requis par Prisma et ldapjs
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier uniquement les fichiers de dépendances d'abord (cache Docker)
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --prefer-offline

# Générer le client Prisma
RUN npx prisma generate

# Copier le reste du code
COPY . .

# Appliquer les migrations et compiler
RUN npx prisma migrate deploy
RUN npm run build

EXPOSE 3000

# Healthcheck intégré
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["npm", "start"]
