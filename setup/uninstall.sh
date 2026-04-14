#!/usr/bin/env bash
# =============================================================================
#  SSPR — Script de désinstallation
#  Usage : bash setup/uninstall.sh
#  Supprime l'application, la configuration Nginx et le processus PM2.
#  Demande si la base de données doit être conservée ou supprimée.
# =============================================================================
set -euo pipefail

# ─── Chemins ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$SCRIPT_DIR/config.sh"

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

ok()      { echo -e "${GREEN}  ✓${RESET} $*"; }
info()    { echo -e "${BLUE}  →${RESET} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${RESET} $*"; }
skipped() { echo -e "  ${YELLOW}↷${RESET} $* (ignoré)"; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}"; }

# ─── Bannière ────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SSPR — Désinstallation                 ║"
echo "  ║   Self-Service Password Reset            ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

warn "Ce script va supprimer l'application SSPR de ce serveur."
echo ""

# =============================================================================
# CONFIRMATION
# =============================================================================
echo -e "${RED}${BOLD}  Êtes-vous sûr de vouloir désinstaller SSPR ? [oui/non]${RESET}"
read -rp "  > " CONFIRM
if [[ "$CONFIRM" != "oui" ]]; then
  echo ""
  info "Désinstallation annulée."
  exit 0
fi

# =============================================================================
# BASE DE DONNÉES
# =============================================================================
section "Base de données"

DB_PATH="$PROJECT_DIR/prisma/dev.db"
DB_BACKUP_DIR="$HOME/sspr-db-backup-$(date +%Y-%m-%d_%H-%M)"

echo ""
echo -e "  La base de données SQLite contient l'historique des demandes de réinitialisation."
echo -e "  Fichier : ${BOLD}$DB_PATH${RESET}"
echo ""
echo -e "${YELLOW}${BOLD}  Que souhaitez-vous faire avec la base de données ?${RESET}"
echo "    1) Supprimer définitivement (aucune récupération possible)"
echo "    2) Conserver une sauvegarde dans $HOME/"
echo "    3) Laisser en place dans le dossier du projet"
echo ""
read -rp "  Votre choix [1/2/3] : " DB_CHOICE

case "$DB_CHOICE" in
  1)
    KEEP_DB="delete"
    warn "La base de données sera supprimée définitivement."
    ;;
  2)
    KEEP_DB="backup"
    info "La base de données sera sauvegardée dans : $DB_BACKUP_DIR"
    ;;
  3)
    KEEP_DB="keep"
    info "La base de données sera conservée dans : $DB_PATH"
    ;;
  *)
    warn "Choix invalide — la base de données sera conservée par défaut."
    KEEP_DB="keep"
    ;;
esac

echo ""

# =============================================================================
# ÉTAPE 1 — Arrêter et supprimer le processus PM2
# =============================================================================
section "Arrêt de l'application (PM2)"

if command -v pm2 &>/dev/null; then
  if pm2 describe sspr-app &>/dev/null 2>&1; then
    pm2 stop sspr-app 2>/dev/null || true
    pm2 delete sspr-app 2>/dev/null || true
    pm2 save --force >/dev/null 2>&1 || true
    ok "Processus PM2 'sspr-app' supprimé"
  else
    skipped "Aucun processus PM2 'sspr-app' trouvé"
  fi
else
  skipped "PM2 non installé"
fi

# =============================================================================
# ÉTAPE 2 — Charger la config pour connaître le hostname Nginx
# =============================================================================
APP_HOSTNAME=""
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE" 2>/dev/null || true
  APP_HOSTNAME="${APP_HOSTNAME:-}"
fi

# =============================================================================
# ÉTAPE 3 — Supprimer la configuration Nginx
# =============================================================================
section "Suppression de la configuration Nginx"

REMOVED_NGINX=false

# Chercher le fichier de config par hostname ou par pattern sspr
for CANDIDATE in \
  "/etc/nginx/sites-enabled/${APP_HOSTNAME}" \
  "/etc/nginx/sites-available/${APP_HOSTNAME}" \
  "/etc/nginx/sites-enabled/sspr" \
  "/etc/nginx/sites-available/sspr"; do
  if [ -f "$CANDIDATE" ] || [ -L "$CANDIDATE" ]; then
    sudo rm -f "$CANDIDATE" && ok "Supprimé : $CANDIDATE"
    REMOVED_NGINX=true
  fi
done

if [ "$REMOVED_NGINX" = true ]; then
  # Réactiver le vhost default si disponible
  if [ -f /etc/nginx/sites-available/default ] && [ ! -L /etc/nginx/sites-enabled/default ]; then
    sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
    info "Vhost Nginx 'default' réactivé"
  fi
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx 2>/dev/null || true
    ok "Nginx rechargé"
  else
    warn "La configuration Nginx contient des erreurs — vérifiez manuellement : sudo nginx -t"
  fi
else
  skipped "Aucune configuration Nginx SSPR trouvée"
fi

# =============================================================================
# ÉTAPE 4 — Supprimer l'entrée /etc/hosts
# =============================================================================
section "Nettoyage de /etc/hosts"

AD_DC_HOSTNAME="${AD_DC_HOSTNAME:-}"
if [ -n "$AD_DC_HOSTNAME" ] && grep -qF "$AD_DC_HOSTNAME" /etc/hosts 2>/dev/null; then
  sudo sed -i "/$AD_DC_HOSTNAME/d" /etc/hosts
  ok "Entrée '$AD_DC_HOSTNAME' supprimée de /etc/hosts"
else
  skipped "Aucune entrée à supprimer dans /etc/hosts"
fi

# =============================================================================
# ÉTAPE 5 — Traitement de la base de données
# =============================================================================
section "Traitement de la base de données"

if [ -f "$DB_PATH" ]; then
  case "$KEEP_DB" in
    delete)
      rm -f "$DB_PATH" && ok "Base de données supprimée définitivement"
      ;;
    backup)
      mkdir -p "$DB_BACKUP_DIR"
      cp "$DB_PATH" "$DB_BACKUP_DIR/dev.db"
      ok "Base de données sauvegardée dans : $DB_BACKUP_DIR/dev.db"
      rm -f "$DB_PATH"
      info "Fichier original supprimé du projet"
      ;;
    keep)
      ok "Base de données conservée dans : $DB_PATH"
      ;;
  esac
else
  skipped "Aucune base de données trouvée à $DB_PATH"
fi

# =============================================================================
# ÉTAPE 6 — Supprimer le dossier du projet
# =============================================================================
section "Suppression du dossier projet"

echo ""
echo -e "${YELLOW}${BOLD}  Supprimer le dossier complet du projet ?${RESET}"
echo -e "  ${BOLD}$PROJECT_DIR${RESET}"
echo -e "  ${RED}Cette action est irréversible.${RESET} [oui/non]"
read -rp "  > " DELETE_PROJECT

if [[ "$DELETE_PROJECT" == "oui" ]]; then
  # Se déplacer hors du dossier avant de le supprimer
  cd "$HOME"
  rm -rf "$PROJECT_DIR"
  ok "Dossier projet supprimé : $PROJECT_DIR"
else
  skipped "Dossier projet conservé : $PROJECT_DIR"
fi

# =============================================================================
# RÉSUMÉ
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}  ══ Désinstallation terminée ══${RESET}"
echo ""
echo -e "  Ce qui a été supprimé :"
echo -e "    ${GREEN}✓${RESET} Processus PM2 sspr-app"
[ "$REMOVED_NGINX" = true ] && echo -e "    ${GREEN}✓${RESET} Configuration Nginx"
[ "$KEEP_DB" = "delete" ] && echo -e "    ${GREEN}✓${RESET} Base de données"
[ "$KEEP_DB" = "backup" ] && echo -e "    ${GREEN}✓${RESET} Base de données sauvegardée dans $DB_BACKUP_DIR"
[[ "$DELETE_PROJECT" == "oui" ]] && echo -e "    ${GREEN}✓${RESET} Dossier projet"
echo ""
echo -e "  Ce qui a été conservé :"
[ "$KEEP_DB" = "keep" ] && echo -e "    ${YELLOW}→${RESET} Base de données : $DB_PATH"
[[ "${DELETE_PROJECT:-}" != "oui" ]] && echo -e "    ${YELLOW}→${RESET} Dossier projet : $PROJECT_DIR"
echo -e "    ${YELLOW}→${RESET} Node.js, npm, PM2 (désinstallez manuellement si souhaité)"
echo ""
info "Pour réinstaller SSPR à l'avenir : bash setup/install.sh"
echo ""
