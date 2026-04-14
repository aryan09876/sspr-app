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

# ─── Prérequis système ───────────────────────────────────────────────────────
if ! grep -qiE 'debian|ubuntu' /etc/os-release 2>/dev/null; then
  echo "ERREUR : Ce script nécessite Debian ou Ubuntu." >&2
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "  → Installation de curl..."
  sudo apt-get update -qq && sudo apt-get install -y -qq curl
  command -v curl &>/dev/null || { echo "ERREUR : impossible d'installer curl" >&2; exit 1; }
fi

if ! command -v git &>/dev/null; then
  echo "  → Installation de git..."
  sudo apt-get install -y -qq git
  command -v git &>/dev/null || { echo "ERREUR : impossible d'installer git" >&2; exit 1; }
fi

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
# ÉTAPE 2 — PM2 (optionnel)
# =============================================================================
section "Gestionnaire de process"

USE_PM2="false"
echo ""
echo -e "  PM2 est un gestionnaire de process qui redémarre automatiquement"
echo -e "  l'application en cas de crash et au démarrage du serveur."
echo -e "  ${YELLOW}Recommandé en production.${RESET} Alternatives : systemd, Docker."
echo ""
read -r -p "  Installer et utiliser PM2 ? [O/n] " PM2_CONFIRM
if [[ ! "$PM2_CONFIRM" =~ ^[nN]$ ]]; then
  USE_PM2="true"
  if command -v pm2 &>/dev/null; then
    ok "PM2 déjà installé : $(pm2 --version)"
  else
    info "Installation de PM2..."
    sudo npm i -g pm2 >/dev/null 2>&1
    ok "PM2 $(pm2 --version) installé"
  fi
else
  ok "PM2 non utilisé — l'application sera lancée avec npm start"
fi

# =============================================================================
# ÉTAPE 3 — Nginx (reverse proxy)
# =============================================================================
USE_NGINX="false"
if command -v nginx &>/dev/null || [ -x /usr/sbin/nginx ]; then
  USE_NGINX="true"
  ok "Nginx déjà installé"
else
  section "Nginx (reverse proxy)"
  echo ""
  echo -e "  Nginx est un reverse proxy qui permet d'accéder à l'application"
  echo -e "  via le port 80 (HTTP) ou 443 (HTTPS) au lieu du port 3000."
  echo -e "  ${YELLOW}Recommandé en production.${RESET}"
  echo ""
  read -r -p "  Installer Nginx maintenant ? [O/n] " NGINX_CONFIRM
  if [[ ! "$NGINX_CONFIRM" =~ ^[nN]$ ]]; then
    info "Installation de Nginx..."
    sudo apt-get install -y nginx >/dev/null 2>&1
    # Vérifier que l'installation a réussi
    if command -v nginx &>/dev/null || [ -x /usr/sbin/nginx ]; then
      USE_NGINX="true"
      ok "Nginx installé"
    else
      warn "L'installation de Nginx a échoué"
    fi
  fi
fi

# =============================================================================
# ÉTAPE 4 — /etc/hosts (résolution DNS du DC)
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
# ÉTAPE 5 — Génération des secrets (ou réutilisation des existants)
# =============================================================================
section "Secrets cryptographiques"

# Si .env.local existe déjà, réutiliser l'OTP_SECRET existant (sinon les tokens en base deviennent invalides)
EXISTING_OTP_SECRET=""
if [ -f "$PROJECT_DIR/.env.local" ]; then
  EXISTING_OTP_SECRET=$(grep -oP '^OTP_SECRET=\K.*' "$PROJECT_DIR/.env.local" 2>/dev/null || true)
fi

if [ -n "$EXISTING_OTP_SECRET" ]; then
  OTP_SECRET_GEN="$EXISTING_OTP_SECRET"
  ok "OTP_SECRET existant conservé (base de données préservée)"
else
  OTP_SECRET_GEN=$(openssl rand -base64 32)
  ok "OTP_SECRET généré (HMAC-SHA256, 256 bits)"
fi

# =============================================================================
# ÉTAPE 6 — Écriture du fichier .env.local
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
if [ "$USE_NGINX" = "true" ] && [ -n "${TLS_CERT_PATH:-}" ] && [ -f "$TLS_CERT_PATH" ] 2>/dev/null; then
  APP_BASE_URL="https://$APP_HOSTNAME"
elif [ "$USE_NGINX" = "true" ]; then
  APP_BASE_URL="http://$APP_HOSTNAME"
else
  APP_BASE_URL="http://$SERVER_IP:3000"
fi

cat > "$PROJECT_DIR/.env.local" <<EOF
DATABASE_URL=file:${DB_PATH}

AD_URL=ldaps://${AD_DC_HOSTNAME}:636
AD_BASE_DN="${AD_BASE_DN}"
AD_BIND_DN="${AD_BIND_DN}"
AD_BIND_PASSWORD="${AD_BIND_PASSWORD}"
AD_TLS_REJECT_UNAUTHORIZED=${TLS_REJECT}
${TLS_CA_LINE}

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="${SMTP_USER}"
SMTP_PASS="${SMTP_PASS}"
SMTP_FROM="${SMTP_USER}"

OTP_SECRET=${OTP_SECRET_GEN}

APP_BASE_URL="${APP_BASE_URL}"

APP_NAME="${APP_NAME}"
EOF

ok ".env.local créé dans $PROJECT_DIR"

# =============================================================================
# ÉTAPE 7 — Adapter le binding réseau
# =============================================================================
# Avec Nginx : Next.js écoute sur 127.0.0.1 (sécurisé, accès via proxy uniquement)
# Sans Nginx : Next.js écoute sur 0.0.0.0 (accessible directement depuis le réseau)
if [ "$USE_NGINX" = "true" ]; then
  # Bind localhost — accès uniquement via Nginx
  sed -i 's/"start": "next start.*"/"start": "next start -H 127.0.0.1"/' "$PROJECT_DIR/package.json"
  ok "Next.js configuré sur 127.0.0.1 (accès via Nginx)"
else
  # Bind toutes les interfaces — accès direct depuis le réseau
  sed -i 's/"start": "next start.*"/"start": "next start -H 0.0.0.0"/' "$PROJECT_DIR/package.json"
  ok "Next.js configuré sur 0.0.0.0 (accès direct port 3000)"
  warn "Sans Nginx, les mots de passe transitent en clair sur le réseau (pas de HTTPS)"
fi

# =============================================================================
# ÉTAPE 8 — Installation des dépendances
# =============================================================================
section "Installation des dépendances Node.js (npm install)"

cd "$PROJECT_DIR"
info "Cette étape peut prendre quelques minutes..."
npm install --silent 2>&1 | tail -5
ok "Dépendances installées"

# =============================================================================
# ÉTAPE 9 — Base de données (migrations Prisma)
# =============================================================================
section "Base de données SQLite (migrations Prisma)"

# Extraire DATABASE_URL sans exécuter tout le fichier (évite les erreurs sur les valeurs avec espaces)
export DATABASE_URL
DATABASE_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2-)

info "Application des migrations..."
MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
MIGRATE_STATUS=$?
echo "$MIGRATE_OUTPUT" | grep -E "(Applied|already|Migration|Error|error)" || true
if [ $MIGRATE_STATUS -ne 0 ]; then
  fail "Échec de la migration Prisma. Détail :\n$MIGRATE_OUTPUT"
fi
if [ ! -f "$DB_PATH" ]; then
  fail "La base de données n'a pas été créée ($DB_PATH introuvable). Vérifiez DATABASE_URL dans .env.local."
fi
ok "Base de données initialisée : $DB_PATH"

# =============================================================================
# ÉTAPE 10 — Build Next.js
# =============================================================================
section "Build de l'application (npm run build)"

info "Compilation en cours..."
npm run build 2>&1 | grep -E "(✓|✗|error|Error|warning|Route)" || true
ok "Build terminé"

# =============================================================================
# ÉTAPE 10b — Test de connexion Active Directory
# =============================================================================
section "Test de connexion Active Directory"

info "Vérification du bind LDAPS avec le compte de service..."

# Charger .env.local et tester le bind via un script Node.js inline
cd "$PROJECT_DIR"
LDAP_TEST_RESULT=$(node -e "
const ldap = require('ldapjs');
const fs = require('fs');
const tls = require('tls');

// Charger .env.local manuellement
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});

const tlsOptions = { rejectUnauthorized: env.AD_TLS_REJECT_UNAUTHORIZED !== 'false' ? true : false };
if (env.AD_TLS_CA_CERT_PATH && fs.existsSync(env.AD_TLS_CA_CERT_PATH)) {
  tlsOptions.ca = [fs.readFileSync(env.AD_TLS_CA_CERT_PATH)];
}

const client = ldap.createClient({ url: env.AD_URL, tlsOptions, connectTimeout: 10000 });
client.on('error', (err) => { console.log('ERREUR:' + err.message); process.exit(1); });
client.bind(env.AD_BIND_DN, env.AD_BIND_PASSWORD, (err) => {
  if (err) {
    console.log('ERREUR:' + err.message);
    client.unbind();
    process.exit(1);
  }
  console.log('OK');
  client.unbind();
  process.exit(0);
});
setTimeout(() => { console.log('ERREUR:Timeout — le DC ne répond pas sur le port 636'); process.exit(1); }, 15000);
" 2>&1 || true)

if echo "$LDAP_TEST_RESULT" | grep -q "^OK"; then
  ok "Connexion LDAPS réussie — le compte de service s'authentifie correctement"
else
  LDAP_ERR=$(echo "$LDAP_TEST_RESULT" | grep "ERREUR:" | head -1 | sed 's/ERREUR://')
  if echo "$LDAP_ERR" | grep -qi "Invalid Credentials"; then
    fail "Le mot de passe du compte de service est incorrect (AD_BIND_PASSWORD) ou le DN est erroné (AD_BIND_DN).
    Vérifiez dans setup/config.sh :
      AD_BIND_DN     = ${AD_BIND_DN}
      AD_BIND_PASSWORD = (caché)
    Pour trouver le bon DN :  Get-ADUser SVC-PwdReset | Select DistinguishedName  (PowerShell sur le DC)"
  elif echo "$LDAP_ERR" | grep -qi "Timeout\|ECONNREFUSED\|ENOTFOUND"; then
    fail "Impossible de joindre le contrôleur de domaine : ${AD_DC_HOSTNAME}:636
    Vérifiez que :
      1. LDAPS (port 636) est actif sur le DC
      2. Le pare-feu autorise le port 636
      3. /etc/hosts résout bien ${AD_DC_HOSTNAME} → ${AD_DC_IP}"
  else
    fail "Échec de connexion LDAP : $LDAP_ERR
    Vérifiez votre configuration dans setup/config.sh"
  fi
fi

# =============================================================================
# ÉTAPE 11 — Configuration Nginx (si installé)
# =============================================================================
if [ "$USE_NGINX" = "true" ]; then
  section "Configuration Nginx"

  NGINX_CONF="/etc/nginx/sites-available/$APP_HOSTNAME"
  NGINX_LINK="/etc/nginx/sites-enabled/$APP_HOSTNAME"

  # Supprimer le site par défaut s'il existe (évite le conflit sur le port 80)
  if [ -L "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
    ok "Site par défaut Nginx désactivé (évite conflit port 80)"
  fi

  if [ -n "${TLS_CERT_PATH:-}" ] && [ -n "${TLS_KEY_PATH:-}" ] \
     && [ -f "$TLS_CERT_PATH" ] && [ -f "$TLS_KEY_PATH" ]; then

    # Vérifier que le certificat est en format PEM (Nginx n'accepte pas le DER)
    if ! sudo head -1 "$TLS_CERT_PATH" 2>/dev/null | grep -q "BEGIN"; then
      info "Certificat en format DER détecté — conversion en PEM..."
      PEM_CERT="${TLS_CERT_PATH%.cer}.pem"
      sudo openssl x509 -inform DER -in "$TLS_CERT_PATH" -out "$PEM_CERT" 2>/dev/null \
        && { TLS_CERT_PATH="$PEM_CERT"; ok "Certificat converti : $PEM_CERT"; } \
        || warn "Échec de la conversion — le certificat est peut-être déjà en PEM corrompu"
    fi

    # Vérifier que la clé est en format PEM
    if [ -f "$TLS_KEY_PATH" ] && ! sudo head -1 "$TLS_KEY_PATH" 2>/dev/null | grep -q "BEGIN"; then
      info "Clé en format DER détecté — conversion en PEM..."
      PEM_KEY="${TLS_KEY_PATH%.key}.pem"
      sudo openssl rsa -inform DER -in "$TLS_KEY_PATH" -out "$PEM_KEY" 2>/dev/null \
        && { TLS_KEY_PATH="$PEM_KEY"; ok "Clé convertie : $PEM_KEY"; } \
        || warn "Échec de la conversion de la clé"
    fi

    # Demander si l'utilisateur veut aussi laisser l'accès HTTP
    echo ""
    echo -e "  HTTPS est activé. Voulez-vous aussi autoriser l'accès HTTP"
    echo -e "  (les visiteurs en HTTP seront redirigés automatiquement vers HTTPS) ?"
    read -rp "  Autoriser HTTP → HTTPS ? [O/n] " HTTP_REDIRECT
    echo ""

    if [[ "$HTTP_REDIRECT" =~ ^[nN]$ ]]; then
      # HTTPS uniquement — pas de port 80
      info "Génération de la configuration Nginx HTTPS uniquement (port 443)..."
      sudo tee "$NGINX_CONF" >/dev/null <<NGINXEOF
# SSPR — Configuration Nginx générée par install.sh (HTTPS uniquement)
server {
    listen 443 ssl;
    server_name ${APP_HOSTNAME} ${SERVER_IP};

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
      ok "Configuration HTTPS uniquement créée (port 80 fermé)"
    else
      # HTTPS + redirection HTTP → HTTPS
      info "Génération de la configuration Nginx HTTPS + redirection HTTP..."
      sudo tee "$NGINX_CONF" >/dev/null <<NGINXEOF
# SSPR — Configuration Nginx générée par install.sh
server {
    listen 80;
    server_name ${APP_HOSTNAME} ${SERVER_IP};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${APP_HOSTNAME} ${SERVER_IP};

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
      ok "Configuration HTTPS + redirection HTTP créée"
    fi

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
    warn "Pas de certificat TLS — accès en HTTP uniquement"
  fi

  # Activer le site
  if [ ! -L "$NGINX_LINK" ]; then
    sudo ln -s "$NGINX_CONF" "$NGINX_LINK"
    ok "Site Nginx activé"
  else
    ok "Site Nginx déjà activé"
  fi

  # Tester la configuration et démarrer (protégé pour ne pas bloquer le script)
  info "Test de la configuration Nginx..."
  if sudo nginx -t 2>&1; then

    # ── Libérer les ports 80 et 443 ──
    # 1) Arrêter Nginx proprement
    sudo systemctl stop nginx 2>/dev/null || true
    # 2) Tuer tous les processus nginx restants (zombies, orphelins)
    sudo killall -9 nginx 2>/dev/null || true
    # 3) Arrêter apache2 s'il tourne (conflit fréquent sur le port 80)
    if systemctl is-active --quiet apache2 2>/dev/null; then
      warn "Apache2 détecté sur le port 80 — arrêt et désactivation..."
      sudo systemctl stop apache2
      sudo systemctl disable apache2 2>/dev/null || true
    fi
    # 4) Tuer tout ce qui reste sur les ports 80 et 443
    for PORT in 80 443; do
      PIDS=$(sudo fuser "${PORT}/tcp" 2>/dev/null || true)
      if [ -n "$PIDS" ]; then
        warn "Port $PORT encore occupé (PID: $PIDS) — arrêt forcé..."
        sudo fuser -k "${PORT}/tcp" 2>/dev/null || true
      fi
    done
    sleep 1

    # ── Démarrer Nginx ──
    if sudo systemctl start nginx 2>&1; then
      ok "Nginx démarré"
    else
      warn "Échec du démarrage Nginx — vérifiez avec :"
      info "  sudo journalctl -u nginx --no-pager -n 20"
      info "  sudo nginx -t"
    fi
  else
    warn "Erreur de configuration Nginx — vérifiez les certificats et chemins"
    info "  sudo nginx -t"
  fi
fi

# =============================================================================
# ÉTAPE 12 — Démarrage de l'application
# =============================================================================
if [ "$USE_PM2" = "true" ]; then
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

  # Démarrage automatique au boot
  info "Configuration du démarrage automatique..."
  STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo env" || true)
  if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD" >/dev/null 2>&1 && ok "Démarrage automatique configuré" \
      || warn "Échec sudo — exécutez manuellement : $STARTUP_CMD"
  else
    ok "Démarrage automatique déjà configuré"
  fi
else
  section "Démarrage de l'application"
  info "Lancement avec npm start (en arrière-plan)..."
  cd "$PROJECT_DIR"
  nohup npm start > "$PROJECT_DIR/sspr.log" 2>&1 &
  APP_PID=$!
  ok "Application démarrée (PID: $APP_PID)"
  warn "L'application ne redémarrera pas automatiquement en cas de crash ou reboot."
  info "Pour un démarrage automatique, envisagez PM2 ou créez un service systemd."
fi

# =============================================================================
# ÉTAPE 13 — Vérification finale
# =============================================================================
section "Vérification finale"

sleep 3  # Laisser le temps à l'app de démarrer

if [ "$USE_PM2" = "true" ]; then
  if pm2 list 2>/dev/null | grep -q "online"; then
    ok "Application PM2 : online"
  else
    warn "Statut PM2 incertain — vérifiez avec : pm2 logs sspr-app --lines 20"
  fi
fi

# Tester l'accès
if [ "$USE_NGINX" = "true" ] && [ -n "${TLS_CERT_PATH:-}" ]; then
  # HTTPS — on ignore les erreurs de certificat auto-signé (-k)
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://$SERVER_IP" 2>/dev/null || echo "000")
elif [ "$USE_NGINX" = "true" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP" 2>/dev/null || echo "000")
else
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:3000" 2>/dev/null || echo "000")
fi

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
  ok "Réponse HTTP : $HTTP_CODE"
else
  warn "Réponse HTTP : $HTTP_CODE — l'application peut encore démarrer..."
  if [ "$USE_PM2" = "true" ]; then
    info "Consultez : pm2 logs sspr-app --lines 30"
  else
    info "Consultez : tail -50 $PROJECT_DIR/sspr.log"
  fi
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
# Afficher aussi l'accès par IP si différent de l'URL principale
if [ "$USE_NGINX" = "true" ] && [ -n "${TLS_CERT_PATH:-}" ]; then
  echo -e "  Accès par IP    : ${BOLD}https://$SERVER_IP${RESET}"
elif [ "$USE_NGINX" = "true" ]; then
  echo -e "  Accès par IP    : ${BOLD}http://$SERVER_IP${RESET}"
fi
echo -e "  Base de données : ${BOLD}$DB_PATH${RESET}"

if [ "$USE_PM2" = "true" ]; then
  echo ""
  echo -e "${BOLD}  Commandes utiles (PM2) :${RESET}"
  echo "    pm2 list                          → statut"
  echo "    pm2 logs sspr-app --lines 50      → logs"
  echo "    pm2 restart sspr-app --update-env → redémarrer"
else
  echo ""
  echo -e "${BOLD}  Commandes utiles :${RESET}"
  echo "    tail -f $PROJECT_DIR/sspr.log     → logs"
  echo "    npm start                          → redémarrer (depuis $PROJECT_DIR)"
fi
echo ""

if [ "${TLS_REJECT}" = "false" ]; then
  echo -e "${YELLOW}  ⚠ Pour activer la validation TLS LDAP :${RESET}"
  echo "    1. Exportez le certificat CA de votre AD en .crt"
  echo "    2. Renseignez AD_CA_CERT_PATH dans setup/config.sh"
  echo "    3. Relancez : bash setup/install.sh"
  echo ""
fi

if [ "$USE_NGINX" = "true" ] && [ -z "${TLS_CERT_PATH:-}" ]; then
  echo -e "${YELLOW}  ⚠ Pour passer en HTTPS :${RESET}"
  echo "    1. Générez un certificat TLS (voir README.md section HTTPS)"
  echo "    2. Renseignez TLS_CERT_PATH et TLS_KEY_PATH dans setup/config.sh"
  echo "    3. Relancez : bash setup/install.sh"
  echo ""
fi

if [ "$USE_NGINX" = "true" ]; then
  echo -e "${BLUE}  ℹ DNS (optionnel) : pour accéder via ${BOLD}$APP_HOSTNAME${RESET}${BLUE}, créez un enregistrement A :${RESET}"
  echo "    $APP_HOSTNAME → $SERVER_IP (sur votre DC)"
  echo -e "    ${BLUE}En attendant, l'application est accessible par IP : https://$SERVER_IP${RESET}"
fi
echo ""
