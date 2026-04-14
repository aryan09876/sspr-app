#!/usr/bin/env bash
# =============================================================================
#  SSPR — Script de vérification des connexions
#  Usage : bash setup/check.sh
#  Vérifie : configuration, base de données, LDAP/S, SMTP, Nginx, PM2
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

ok()      { echo -e "  ${GREEN}✓${RESET}  $*"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${RESET}  $*"; FAIL=$((FAIL+1)); }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; WARN=$((WARN+1)); }
info()    { echo -e "  ${BLUE}→${RESET}  $*"; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}"; }

PASS=0; FAIL=0; WARN=0

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SSPR — Vérification des connexions     ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# =============================================================================
# 1 — Fichier .env.local
# =============================================================================
section "Configuration (.env.local)"

ENV_FILE="$PROJECT_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  fail ".env.local introuvable — lancez d'abord : bash setup/install.sh"
  echo ""
  echo -e "${RED}  Impossible de continuer sans .env.local.${RESET}"
  exit 1
fi
ok ".env.local présent"

# Extraire les variables sans sourcer le fichier entier
get_env() { grep "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'; }

DATABASE_URL=$(get_env DATABASE_URL)
AD_URL=$(get_env AD_URL)
AD_BASE_DN=$(get_env AD_BASE_DN)
AD_BIND_DN=$(get_env AD_BIND_DN)
AD_BIND_PASSWORD=$(get_env AD_BIND_PASSWORD)
AD_TLS_REJECT=$(get_env AD_TLS_REJECT_UNAUTHORIZED)
AD_TLS_CA=$(get_env AD_TLS_CA_CERT_PATH)
SMTP_HOST=$(get_env SMTP_HOST)
SMTP_PORT=$(get_env SMTP_PORT)
SMTP_USER=$(get_env SMTP_USER)
SMTP_PASS=$(get_env SMTP_PASS)
OTP_SECRET=$(get_env OTP_SECRET)
APP_BASE_URL=$(get_env APP_BASE_URL)

VARS_OK=true
for var in DATABASE_URL AD_URL AD_BASE_DN AD_BIND_DN AD_BIND_PASSWORD SMTP_HOST SMTP_USER SMTP_PASS OTP_SECRET APP_BASE_URL; do
  val=$(get_env "$var")
  if [ -z "$val" ]; then
    fail "Variable manquante ou vide : $var"
    VARS_OK=false
  fi
done
[ "$VARS_OK" = "true" ] && ok "Toutes les variables obligatoires sont définies"

info "AD_URL       : $AD_URL"
info "AD_BASE_DN   : $AD_BASE_DN"
info "SMTP         : $SMTP_HOST:${SMTP_PORT:-587} ($SMTP_USER)"
info "APP_BASE_URL : $APP_BASE_URL"
[ "$AD_TLS_REJECT" = "false" ] && warn "AD_TLS_REJECT_UNAUTHORIZED=false — validation TLS désactivée (déconseillé en prod)"

# =============================================================================
# 2 — Base de données SQLite
# =============================================================================
section "Base de données SQLite"

DB_PATH="${DATABASE_URL#file:}"
if [ -z "$DB_PATH" ]; then
  fail "DATABASE_URL vide ou mal formé"
else
  if [ ! -f "$DB_PATH" ]; then
    fail "Fichier DB introuvable : $DB_PATH"
    info "Lancez : bash setup/update.sh --force"
  else
    ok "Fichier DB présent : $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"

    # Vérifier que la table existe
    TABLE_EXISTS=$(cd "$PROJECT_DIR" && export DATABASE_URL && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.passwordResetToken.count()
  .then(c => { console.log('OK:' + c); p.\$disconnect(); })
  .catch(e => { console.log('ERR:' + e.message); p.\$disconnect(); });
" 2>/dev/null || echo "ERR:node failed")

    if echo "$TABLE_EXISTS" | grep -q "^OK:"; then
      COUNT=$(echo "$TABLE_EXISTS" | sed 's/OK://')
      ok "Table PasswordResetToken accessible ($COUNT entrée(s))"
    else
      MSG=$(echo "$TABLE_EXISTS" | sed 's/ERR://')
      fail "Table PasswordResetToken inaccessible : $MSG"
      info "Correction : bash setup/update.sh --force"
    fi
  fi
fi

# =============================================================================
# 3 — Résolution DNS du contrôleur de domaine
# =============================================================================
section "Résolution DNS / Active Directory"

DC_HOST=$(echo "$AD_URL" | sed 's|ldaps://||;s|:.*||')
info "Contrôleur de domaine : $DC_HOST"

if getent hosts "$DC_HOST" &>/dev/null; then
  DC_IP=$(getent hosts "$DC_HOST" | awk '{print $1}' | head -1)
  ok "DNS résolu : $DC_HOST → $DC_IP"
else
  fail "Impossible de résoudre $DC_HOST"
  info "Vérifiez /etc/hosts ou le DNS. Exemple :"
  info "  echo '192.168.X.X  $DC_HOST' | sudo tee -a /etc/hosts"
fi

# Tester la connexion TCP sur le port LDAPS (636)
DC_PORT=$(echo "$AD_URL" | grep -oP ':\d+$' | tr -d ':')
DC_PORT="${DC_PORT:-636}"
if timeout 5 bash -c "echo >/dev/tcp/$DC_HOST/$DC_PORT" 2>/dev/null; then
  ok "Port LDAPS $DC_PORT accessible sur $DC_HOST"
else
  fail "Port $DC_PORT inaccessible sur $DC_HOST"
  info "Vérifiez le pare-feu ou que LDAPS est actif sur le DC"
fi

# =============================================================================
# 4 — Connexion LDAP (bind du compte de service)
# =============================================================================
section "Connexion LDAPS (compte de service)"

LDAP_RESULT=$(cd "$PROJECT_DIR" && export DATABASE_URL && node -e "
process.env.AD_URL = '$AD_URL';
process.env.AD_BASE_DN = '$AD_BASE_DN';
process.env.AD_BIND_DN = '$AD_BIND_DN';
process.env.AD_BIND_PASSWORD = '$AD_BIND_PASSWORD';
process.env.AD_TLS_REJECT_UNAUTHORIZED = '$AD_TLS_REJECT';
const { testLdapConnection } = require('./.next/server/chunks/$(ls "$PROJECT_DIR/.next/server/chunks/" 2>/dev/null | grep -i ldap | head -1 || echo "NOCHUNK")');
" 2>/dev/null || echo "SKIP")

# Utiliser directement node avec le fichier compilé si disponible
LDAP_TEST_RESULT=$(cd "$PROJECT_DIR" && node -e "
const ldap = require('ldapjs');
const fs = require('fs');
const tlsOptions = { rejectUnauthorized: '$AD_TLS_REJECT' !== 'false' };
// Charger le certificat CA interne si disponible (même logique que l'application)
const caPath = '$AD_TLS_CA';
if (caPath && fs.existsSync(caPath)) { tlsOptions.ca = [fs.readFileSync(caPath)]; }
const client = ldap.createClient({ url: '$AD_URL', tlsOptions, connectTimeout: 8000, timeout: 10000 });
let done = false;
const timeout = setTimeout(() => { if (!done) { done=true; console.log('TIMEOUT'); client.destroy(); } }, 10000);
client.on('error', (e) => { if (!done) { done=true; clearTimeout(timeout); console.log('ERR:' + e.message); client.destroy(); }});
client.bind('$AD_BIND_DN', '$AD_BIND_PASSWORD', (err) => {
  clearTimeout(timeout);
  if (!done) { done=true;
    if (err) { console.log('ERR:' + err.message); } else { console.log('OK'); }
    try { client.unbind(); } catch(e) {}
    client.destroy();
  }
});
" 2>/dev/null || echo "ERR:node failed")

if [ "$LDAP_TEST_RESULT" = "OK" ]; then
  ok "Bind LDAPS réussi avec le compte de service"
  info "DN : $AD_BIND_DN"
elif [ "$LDAP_TEST_RESULT" = "TIMEOUT" ]; then
  fail "Timeout LDAPS — DC injoignable ou pare-feu bloquant"
else
  MSG=$(echo "$LDAP_TEST_RESULT" | sed 's/ERR://')
  fail "Échec LDAPS : $MSG"
  if echo "$MSG" | grep -qi "invalid credentials\|credential"; then
    info "Mot de passe du compte de service incorrect dans .env.local"
  elif echo "$MSG" | grep -qi "certificate\|tls\|ssl"; then
    info "Problème de certificat TLS — essayez AD_TLS_REJECT_UNAUTHORIZED=false"
  fi
fi

# =============================================================================
# 5 — Connexion SMTP
# =============================================================================
section "Connexion SMTP"

info "Serveur : $SMTP_HOST:${SMTP_PORT:-587} (utilisateur : $SMTP_USER)"

SMTP_RESULT=$(cd "$PROJECT_DIR" && timeout 20 node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: '$SMTP_HOST',
  port: ${SMTP_PORT:-587},
  secure: false,
  auth: { user: '$SMTP_USER', pass: '$SMTP_PASS' },
  connectionTimeout: 12000,
  greetingTimeout: 12000,
  socketTimeout: 15000
});
t.verify().then(() => { console.log('OK'); process.exit(0); })
  .catch(e => { console.log('ERR:' + e.message); process.exit(1); });
" 2>/dev/null || echo "ERR:Timeout dépassé — port ${SMTP_PORT:-587} bloqué ou réseau inaccessible")

if [ "$SMTP_RESULT" = "OK" ]; then
  ok "Connexion SMTP réussie"
else
  MSG=$(echo "$SMTP_RESULT" | sed 's/ERR://')
  fail "Échec SMTP : $MSG"
  if echo "$MSG" | grep -qi "invalid login\|535\|authentication\|Username and Password"; then
    info "Identifiants Gmail incorrects — vérifiez SMTP_PASS (mot de passe d'application)"
    info "Générez-en un sur : https://myaccount.google.com/apppasswords"
    info "Vérifiez que la validation en 2 étapes est activée sur le compte Gmail"
  elif echo "$MSG" | grep -qi "ECONNREFUSED\|ENOTFOUND"; then
    info "Serveur SMTP inaccessible — vérifiez SMTP_HOST et la connectivité internet"
  elif echo "$MSG" | grep -qi "Timeout\|timeout\|ETIMEDOUT"; then
    info "Le port ${SMTP_PORT:-587} est probablement bloqué par le pare-feu de la VM ou du réseau"
    info "Testez : timeout 5 bash -c 'echo >/dev/tcp/$SMTP_HOST/${SMTP_PORT:-587}' && echo 'Port OK' || echo 'Port BLOQUÉ'"
  fi
fi

# =============================================================================
# 6 — PM2 et application
# =============================================================================
section "Application (PM2 + HTTP)"

if command -v pm2 &>/dev/null; then
  if pm2 describe sspr-app &>/dev/null 2>&1; then
    STATUS=$(pm2 jlist 2>/dev/null | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
try { const a=JSON.parse(d); const app=a.find(x=>x.name==='sspr-app'); console.log(app?app.pm2_env.status:'unknown'); } catch(e){ console.log('unknown'); }
" 2>/dev/null || pm2 list | grep sspr-app | awk '{print $10}' | head -1)
    if [ "$STATUS" = "online" ]; then
      ok "PM2 sspr-app : online"
    else
      fail "PM2 sspr-app : $STATUS"
      info "Relancez : pm2 restart sspr-app --update-env"
    fi
  else
    fail "PM2 : processus sspr-app introuvable"
    info "Lancez : bash setup/install.sh"
  fi
else
  warn "PM2 non installé"
fi

# Test HTTP local
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "301" ]; then
  ok "Application HTTP : $HTTP_CODE sur http://127.0.0.1:3000"
else
  fail "Application HTTP : $HTTP_CODE (attendu 200/301)"
  info "Vérifiez les logs : pm2 logs sspr-app --lines 30"
fi

# Nginx
if command -v nginx &>/dev/null || [ -x /usr/sbin/nginx ]; then
  if systemctl is-active nginx &>/dev/null; then
    ok "Nginx : actif"
  else
    fail "Nginx : arrêté"
    info "Relancez : sudo systemctl start nginx"
  fi
else
  warn "Nginx non installé (accès direct sur le port 3000)"
fi

# =============================================================================
# Résumé
# =============================================================================
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
TOTAL=$((PASS+FAIL+WARN))
if [ $FAIL -eq 0 ]; then
  echo -e "${BOLD}${GREEN}  Résultat : $PASS/$TOTAL vérifications OK${RESET}"
else
  echo -e "${BOLD}${RED}  Résultat : $FAIL erreur(s) — $PASS/$TOTAL OK${RESET}"
fi
[ $WARN -gt 0 ] && echo -e "${YELLOW}  $WARN avertissement(s)${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════${RESET}"
echo ""

[ $FAIL -gt 0 ] && exit 1 || exit 0
