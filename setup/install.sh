#!/usr/bin/env bash
# =============================================================================
#  SSPR — Script d'installation automatique
#  Usage : bash setup/install.sh
#  Prérequis : Debian/Ubuntu, connexion internet, sudo disponible
# =============================================================================
set -euo pipefail

# ─── Chemins ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$SCRIPT_DIR/config.sh"

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
info() { echo -e "${BLUE}  →${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
fail() { echo -e "${RED}  ✗ ERREUR :${RESET} $*"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}"; }

# ─── Bannière ────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SSPR — Installation automatique        ║"
echo "  ║   Self-Service Password Reset            ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# =============================================================================
# ÉTAPE 0 — Charger et valider la configuration
# =============================================================================
section "Vérification de la configuration"

if [ ! -f "$CONFIG_FILE" ]; then
  warn "Fichier de configuration introuvable : setup/config.sh"
  info "Création à partir du modèle..."
  cp "$SCRIPT_DIR/config.example.sh" "$CONFIG_FILE"
  echo ""
  echo -e "${YELLOW}  Veuillez remplir le fichier ${BOLD}setup/config.sh${RESET}${YELLOW} puis relancer ce script.${RESET}"
  echo ""
  exit 1
fi

# Charger la config
# shellcheck source=/dev/null
source "$CONFIG_FILE"

# Vérifier les champs obligatoires
ERRORS=0
check_required() {
  local var_name="$1"
  local var_value="${!var_name:-}"
  local placeholder="${2:-}"

  if [ -z "$var_value" ]; then
    warn "Variable manquante : $var_name"
    ERRORS=$((ERRORS+1))
  elif [ -n "$placeholder" ] && [[ "$var_value" == *"$placeholder"* ]]; then
    warn "Valeur non modifiée : $var_name (contient encore '$placeholder')"
    ERRORS=$((ERRORS+1))
  fi
}

check_required "APP_NAME"         "NOM_DE"
check_required "SERVER_IP"        "192.168.X"
check_required "APP_HOSTNAME"     "DOMAINE"
check_required "AD_DC_HOSTNAME"   "DOMAINE"
check_required "AD_DC_IP"         "192.168.X"
check_required "AD_BASE_DN"       "DOMAINE"
check_required "AD_BIND_DN"       "DOMAINE"
check_required "AD_BIND_PASSWORD" "MOT_DE_PASSE"
check_required "SMTP_USER"        "votrecompte"
check_required "SMTP_PASS"        "xxxx"

if [ $ERRORS -gt 0 ]; then
  echo ""
  fail "$ERRORS valeur(s) à corriger dans setup/config.sh avant de continuer."
fi

ok "Configuration chargée"
echo ""
echo -e "  Organisation   : ${BOLD}$APP_NAME${RESET}"
echo -e "  Serveur        : ${BOLD}$SERVER_IP${RESET} → ${BOLD}$APP_HOSTNAME${RESET}"
echo -e "  Contrôleur AD  : ${BOLD}$AD_DC_HOSTNAME${RESET} ($AD_DC_IP)"
echo -e "  SMTP           : ${BOLD}$SMTP_USER${RESET}"
if [ -n "${TLS_CERT_PATH:-}" ] && [ -f "$TLS_CERT_PATH" ]; then
  echo -e "  HTTPS          : ${GREEN}activé${RESET} ($TLS_CERT_PATH)"
else
  echo -e "  HTTPS          : ${YELLOW}HTTP seulement${RESET} (pas de certificat TLS fourni)"
fi

echo ""
read -r -p "  Ces informations sont-elles correctes ? [o/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[oO]$ ]]; then
  echo "  Installation annulée."
  exit 0
fi

# =============================================================================
# ÉTAPE 1 — Node.js
# =============================================================================
section "Node.js"

NODE_MAJOR=20
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  ok "Node.js déjà installé : $NODE_VER"
else
  info "Installation de Node.js $NODE_MAJOR..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash - >/dev/null 2>&1
  sudo apt-get install -y nodejs >/dev/null 2>&1
  ok "Node.js $(node --version) installé"
fi

if ! command -v npm &>/dev/null; then
  fail "npm introuvable après installation de Node.js"
fi

# =============================================================================
# ÉTAPE 2 — PM2
# =============================================================================
section "PM2 (gestionnaire de process)"

if command -v pm2 &>/dev/null; then
  ok "PM2 déjà installé : $(pm2 --version)"
else
  info "Installation de PM2..."
  sudo npm i -g pm2 >/dev/null 2>&1
  ok "PM2 $(pm2 --version) installé"
fi

# =============================================================================
# ÉTAPE 3 — /etc/hosts (résolution DNS du DC)
# =============================================================================
section "/etc/hosts — Résolution du contrôleur de domaine"

HOSTS_LINE="$AD_DC_IP  $AD_DC_HOSTNAME  $(echo "$AD_DC_HOSTNAME" | cut -d. -f1)"

if grep -qF "$AD_DC_HOSTNAME" /etc/hosts 2>/dev/null; then
  ok "Entrée déjà présente dans /etc/hosts"
else
  echo "$HOSTS_LINE" | sudo tee -a /etc/hosts >/dev/null
  ok "Entrée ajoutée : $HOSTS_LINE"
fi

# =============================================================================
# ÉTAPE 4 — Génération des secrets
# =============================================================================
section "Génération des secrets cryptographiques"

OTP_SECRET_GEN=$(openssl rand -base64 32)
NEXTAUTH_SECRET_GEN=$(openssl rand -base64 32)
ok "OTP_SECRET généré (HMAC-SHA256, 256 bits)"
ok "NEXTAUTH_SECRET généré (256 bits)"

# =============================================================================
# ÉTAPE 5 — Écriture du fichier .env.local
# =============================================================================
section "Création du fichier .env.local"

DB_PATH="$PROJECT_DIR/prisma/dev.db"

# TLS LDAP
if [ -n "${AD_CA_CERT_PATH:-}" ] && [ -f "$AD_CA_CERT_PATH" ]; then
  TLS_REJECT="true"
  TLS_CA_LINE="AD_TLS_CA_CERT_PATH=$AD_CA_CERT_PATH"
  ok "Validation TLS LDAP activée avec : $AD_CA_CERT_PATH"
else
  TLS_REJECT="false"
  TLS_CA_LINE="# AD_TLS_CA_CERT_PATH= (non configuré — TLS non validé)"
  warn "Certificat CA non fourni — validation TLS LDAP désactivée (AD_TLS_REJECT_UNAUTHORIZED=false)"
  warn "Pour activer : renseignez AD_CA_CERT_PATH dans config.sh et relancez install.sh"
fi

# URL de base
if [ -n "${TLS_CERT_PATH:-}" ] && [ -f "$TLS_CERT_PATH" ] 2>/dev/null; then
  APP_BASE_URL="https://$APP_HOSTNAME"
else
  APP_BASE_URL="http://$SERVER_IP:3000"
fi

cat > "$PROJECT_DIR/.env.local" <<EOF
DATABASE_URL=file:${DB_PATH}

AD_URL=ldaps://${AD_DC_HOSTNAME}:636
AD_BASE_DN=${AD_BASE_DN}
AD_BIND_DN=${AD_BIND_DN}
AD_BIND_PASSWORD=${AD_BIND_PASSWORD}
AD_TLS_REJECT_UNAUTHORIZED=${TLS_REJECT}
${TLS_CA_LINE}

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_USER}

OTP_SECRET=${OTP_SECRET_GEN}

APP_BASE_URL=${APP_BASE_URL}
NEXTAUTH_URL=${APP_BASE_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET_GEN}

APP_NAME=${APP_NAME}
EOF

ok ".env.local créé dans $PROJECT_DIR"

# =============================================================================
# ÉTAPE 6 — Installation des dépendances
# =============================================================================
section "Installation des dépendances Node.js (npm install)"

cd "$PROJECT_DIR"
info "Cette étape peut prendre quelques minutes..."
npm install --silent 2>&1 | tail -5
ok "Dépendances installées"

# =============================================================================
# ÉTAPE 7 — Base de données (migrations Prisma)
# =============================================================================
section "Base de données SQLite (migrations Prisma)"

info "Application des migrations..."
npx prisma migrate deploy 2>&1 | grep -E "(Applied|already|Migration)" || true
ok "Base de données initialisée : $DB_PATH"

# =============================================================================
# ÉTAPE 8 — Build Next.js
# =============================================================================
section "Build de l'application (npm run build)"

info "Compilation en cours..."
npm run build 2>&1 | grep -E "(✓|✗|error|Error|warning|Route)" || true
ok "Build terminé"

# =============================================================================
# ÉTAPE 9 — PM2 : démarrage de l'application
# =============================================================================
section "Démarrage avec PM2"

if pm2 describe sspr-app &>/dev/null; then
  info "Redémarrage de l'instance PM2 existante..."
  pm2 restart sspr-app --update-env
  ok "Application redémarrée"
else
  info "Création de l'instance PM2..."
  pm2 start npm --name "sspr-app" -- start
  ok "Application démarrée"
fi

pm2 save >/dev/null
ok "Liste PM2 sauvegardée"

# =============================================================================
# ÉTAPE 10 — PM2 startup (démarrage automatique au boot)
# =============================================================================
section "Démarrage automatique au boot"

info "Configuration du démarrage automatique..."
STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo env" || true)
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" >/dev/null 2>&1 && ok "Démarrage automatique configuré" \
    || warn "Échec sudo — exécutez manuellement : $STARTUP_CMD"
else
  ok "Démarrage automatique déjà configuré"
fi

# =============================================================================
# ÉTAPE 11 — Nginx (si installé)
# =============================================================================
if command -v nginx &>/dev/null; then
  section "Nginx (reverse proxy)"

  NGINX_CONF="/etc/nginx/sites-available/$APP_HOSTNAME"
  NGINX_LINK="/etc/nginx/sites-enabled/$APP_HOSTNAME"

  if [ -n "${TLS_CERT_PATH:-}" ] && [ -n "${TLS_KEY_PATH:-}" ] \
     && [ -f "$TLS_CERT_PATH" ] && [ -f "$TLS_KEY_PATH" ]; then

    info "Génération de la configuration Nginx HTTPS..."
    sudo tee "$NGINX_CONF" >/dev/null <<NGINXEOF
# SSPR — Configuration Nginx générée par install.sh
server {
    listen 80;
    server_name ${APP_HOSTNAME};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${APP_HOSTNAME};

    ssl_certificate     ${TLS_CERT_PATH};
    ssl_certificate_key ${TLS_KEY_PATH};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF
    ok "Configuration HTTPS créée : $NGINX_CONF"

  else
    info "Génération de la configuration Nginx HTTP..."
    sudo tee "$NGINX_CONF" >/dev/null <<NGINXEOF
# SSPR — Configuration Nginx générée par install.sh (HTTP seulement)
# Pour passer en HTTPS : renseignez TLS_CERT_PATH et TLS_KEY_PATH dans config.sh et relancez install.sh
server {
    listen 80;
    server_name ${APP_HOSTNAME} ${SERVER_IP};

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    ok "Configuration HTTP créée : $NGINX_CONF"
    warn "Pas de certificat TLS — accès uniquement en HTTP"
  fi

  # Activer le site
  if [ ! -L "$NGINX_LINK" ]; then
    sudo ln -s "$NGINX_CONF" "$NGINX_LINK"
    ok "Site Nginx activé"
  else
    ok "Site Nginx déjà activé"
  fi

  # Tester et recharger
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    ok "Nginx rechargé"
  else
    warn "Erreur de configuration Nginx — vérifiez avec : sudo nginx -t"
  fi
else
  warn "Nginx non installé — l'application tourne sur le port 3000 directement"
  info "Pour installer Nginx : sudo apt-get install -y nginx"
fi

# =============================================================================
# ÉTAPE 12 — Vérification finale
# =============================================================================
section "Vérification finale"

sleep 2  # Laisser le temps à l'app de démarrer

PM2_STATUS=$(pm2 list 2>/dev/null | grep "sspr-app" | awk '{print $18}' || echo "inconnu")
if pm2 list 2>/dev/null | grep -q "online"; then
  ok "Application PM2 : online"
else
  warn "Statut PM2 incertain — vérifiez avec : pm2 logs sspr-app --lines 20"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "Réponse HTTP locale : 200 ✓"
else
  warn "Réponse HTTP locale : $HTTP_CODE — consultez : pm2 logs sspr-app --lines 30"
fi

# =============================================================================
# RÉSUMÉ
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Installation terminée !${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Application     : ${BOLD}$APP_NAME${RESET}"
echo -e "  Accès           : ${BOLD}${APP_BASE_URL}${RESET}"
echo -e "  Base de données : ${BOLD}$DB_PATH${RESET}"
echo -e "  Logs PM2        : ${BOLD}pm2 logs sspr-app${RESET}"
echo ""
echo -e "${BOLD}  Commandes utiles :${RESET}"
echo "    pm2 list                          → statut"
echo "    pm2 logs sspr-app --lines 50      → logs"
echo "    pm2 restart sspr-app --update-env → redémarrer"
echo ""

if [ "${TLS_REJECT}" = "false" ]; then
  echo -e "${YELLOW}  ⚠ Pour activer la validation TLS LDAP :${RESET}"
  echo "    1. Exportez le certificat CA de votre AD en .crt"
  echo "    2. Renseignez AD_CA_CERT_PATH dans setup/config.sh"
  echo "    3. Relancez : bash setup/install.sh"
  echo ""
fi

if [ -n "${TLS_CERT_PATH:-}" ] && [ -f "$TLS_CERT_PATH" ] 2>/dev/null; then
  echo -e "${YELLOW}  → N'oubliez pas de créer l'enregistrement DNS :${RESET}"
  echo "    $APP_HOSTNAME → $SERVER_IP (enregistrement A sur votre DC)"
fi
echo ""
