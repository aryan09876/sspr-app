#!/usr/bin/env bash
# =============================================================================
#  SSPR — Mise à jour de l'application
#  Usage : bash setup/update.sh
#
#  Ce script met à jour le code depuis GitHub, réinstalle les dépendances,
#  recompile et redémarre l'application. La base de données et la configuration
#  (.env.local, config.sh) sont préservées.
# =============================================================================
set -euo pipefail

# ─── Chemins ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
info() { echo -e "${BLUE}  →${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
fail() { echo -e "${RED}  ✗ ERREUR :${RESET} $*"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}"; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SSPR — Mise à jour                     ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

cd "$PROJECT_DIR"

# =============================================================================
# Vérifications
# =============================================================================
section "Vérifications"

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  fail ".env.local introuvable. Lancez d'abord : bash setup/install.sh"
fi

# Extraire DATABASE_URL sans exécuter tout le fichier (évite les erreurs sur les valeurs avec espaces)
export DATABASE_URL
DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2-)

if ! command -v git &>/dev/null; then
  fail "git n'est pas installé. Lancez : sudo apt-get install -y git"
fi

if ! command -v curl &>/dev/null; then
  fail "curl n'est pas installé. Lancez : sudo apt-get install -y curl"
fi

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  fail "Ce dossier n'est pas un dépôt Git. Mise à jour impossible."
fi

ok "Configuration existante détectée"

# Vérifier s'il y a des modifications locales
if ! git diff --quiet 2>/dev/null; then
  warn "Des modifications locales ont été détectées."
  info "Elles seront conservées (git stash + pop après mise à jour)."
  git stash --quiet
  STASHED="true"
else
  STASHED="false"
fi

# =============================================================================
# Télécharger les mises à jour
# =============================================================================
section "Téléchargement des mises à jour depuis GitHub"

BEFORE=$(git rev-parse HEAD)
git pull --rebase origin main 2>&1 | tail -5
AFTER=$(git rev-parse HEAD)

# Vérifier si le build existe (.next doit contenir un build valide)
BUILD_MISSING="false"
if [ ! -d "$PROJECT_DIR/.next" ] || [ ! -f "$PROJECT_DIR/.next/BUILD_ID" ]; then
  BUILD_MISSING="true"
fi

if [ "$BEFORE" = "$AFTER" ] && [ "$BUILD_MISSING" = "false" ] && [ "${1:-}" != "--force" ]; then
  ok "Déjà à jour — aucune modification"
  if [ "$STASHED" = "true" ]; then
    git stash pop --quiet 2>/dev/null || true
  fi

  # Toujours vérifier les migrations (idempotent — ne fait rien si déjà à jour)
  # Couvre le cas où dev.db existe mais est vide/sans tables (installation incomplète)
  DB_PATH="$PROJECT_DIR/prisma/dev.db"
  info "Vérification des migrations Prisma..."
  MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
  MIGRATE_STATUS=$?
  echo "$MIGRATE_OUTPUT" | grep -E "(Applied|already|Migration|Error|error)" || true
  if [ $MIGRATE_STATUS -ne 0 ]; then
    fail "Échec de la migration Prisma. Détail :\n$MIGRATE_OUTPUT"
  fi
  ok "Base de données vérifiée : $DB_PATH"
  # Démarrer ou redémarrer PM2
  if command -v pm2 &>/dev/null; then
    if pm2 describe sspr-app &>/dev/null 2>&1; then
      if echo "$MIGRATE_OUTPUT" | grep -q "Applied\|Applying"; then
        pm2 restart sspr-app --update-env 2>/dev/null || true
        ok "Application redémarrée (migration appliquée)"
      fi
    else
      info "Processus sspr-app absent — création..."
      pm2 start npm --name "sspr-app" -- start
      pm2 save
      ok "Application démarrée (PM2) — nouvelle instance créée"
    fi
  fi

  echo ""
  echo -e "${GREEN}  Aucune mise à jour nécessaire.${RESET}"
  info "Pour forcer la recompilation : bash setup/update.sh --force"
  echo ""
  exit 0
fi

if [ "$BUILD_MISSING" = "true" ]; then
  warn "Build absent ou incomplet — recompilation nécessaire"
fi

# Afficher les changements
COMMITS=$(git log --oneline "$BEFORE".."$AFTER" | wc -l)
ok "$COMMITS nouveau(x) commit(s) téléchargé(s)"
git log --oneline "$BEFORE".."$AFTER" | head -10 | while read -r line; do
  echo -e "    ${BLUE}$line${RESET}"
done

# Restaurer les modifications locales
if [ "$STASHED" = "true" ]; then
  git stash pop --quiet 2>/dev/null && ok "Modifications locales restaurées" \
    || warn "Conflit lors de la restauration des modifications locales — vérifiez avec : git stash show"
fi

# =============================================================================
# Réinstaller les dépendances (si package.json a changé)
# =============================================================================
section "Dépendances"

if git diff --name-only "$BEFORE".."$AFTER" | grep -q "package"; then
  info "package.json modifié — réinstallation des dépendances..."
  npm install --silent 2>&1 | tail -3
  ok "Dépendances mises à jour"
else
  ok "Dépendances inchangées"
fi

# =============================================================================
# Appliquer les nouvelles migrations (si le schéma a changé)
# =============================================================================
section "Base de données"

DB_PATH="$PROJECT_DIR/prisma/dev.db"

# Toujours appliquer les migrations : couvre les nouvelles migrations ET
# le cas où la base n'a jamais été initialisée (installation incomplète)
info "Vérification et application des migrations Prisma..."
MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
MIGRATE_STATUS=$?
echo "$MIGRATE_OUTPUT" | grep -E "(Applied|already|Migration|Error|error)" || true
if [ $MIGRATE_STATUS -ne 0 ]; then
  fail "Échec de la migration Prisma. Détail :\n$MIGRATE_OUTPUT"
fi
if [ ! -f "$DB_PATH" ]; then
  fail "La base de données est introuvable ($DB_PATH). Vérifiez DATABASE_URL dans .env.local."
fi
ok "Base de données à jour : $DB_PATH"

# =============================================================================
# Recompiler l'application
# =============================================================================
section "Recompilation"

info "Build en cours..."
npm run build 2>&1 | grep -E "(✓|✗|error|Error|Route)" || true
ok "Build terminé"

# =============================================================================
# Redémarrer
# =============================================================================
section "Redémarrage"

if command -v pm2 &>/dev/null; then
  if pm2 describe sspr-app &>/dev/null 2>&1; then
    pm2 restart sspr-app --update-env
    ok "Application redémarrée (PM2)"
  else
    info "Processus sspr-app absent — création..."
    pm2 start npm --name "sspr-app" -- start
    pm2 save
    ok "Application démarrée (PM2) — nouvelle instance créée"
  fi
else
  warn "PM2 non installé — installez-le : sudo npm i -g pm2"
fi

# =============================================================================
# Vérification
# =============================================================================
section "Vérification"

sleep 2

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
  ok "Application accessible (HTTP $HTTP_CODE)"
else
  warn "Réponse HTTP : $HTTP_CODE — vérifiez les logs"
fi

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Mise à jour terminée !${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo ""
