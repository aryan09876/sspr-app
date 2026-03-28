#!/bin/sh
set -e

echo "=== SSPR — Démarrage du container ==="

# Appliquer les migrations Prisma (DATABASE_URL dispo au runtime)
echo "→ Prisma migrate..."
npx prisma migrate deploy

# Compiler l'application (APP_NAME et autres vars dispo au runtime)
echo "→ Build Next.js..."
npm run build

# Démarrer l'application
echo "→ Démarrage sur port 3000..."
exec npm start
