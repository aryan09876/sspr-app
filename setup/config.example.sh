#!/usr/bin/env bash
# =============================================================================
#  SSPR — Fichier de configuration pour l'installation
#
#  INSTRUCTIONS :
#    1. Copiez ce fichier : cp setup/config.example.sh setup/config.sh
#    2. Remplissez les valeurs ci-dessous (remplacez les MAJUSCULES)
#    3. Lancez : bash setup/install.sh
# =============================================================================

# --- Votre organisation ---
# Affiché dans l'interface et dans les emails envoyés aux utilisateurs
APP_NAME="NOM_DE_VOTRE_ORGANISATION"

# --- Serveur ---
SERVER_IP="192.168.X.X"           # IP de la VM où vous installez l'app
APP_HOSTNAME="mdp.DOMAINE.local"  # Nom DNS de l'app (enregistrement A à créer sur le DC)

# --- Active Directory ---
AD_DC_HOSTNAME="DC-NOM.DOMAINE.local"   # FQDN du contrôleur de domaine
AD_DC_IP="192.168.X.X"                   # IP du DC (pour /etc/hosts sur la VM)
AD_BASE_DN="DC=DOMAINE,DC=local"
AD_BIND_DN="CN=SVC-PwdReset,OU=...,DC=DOMAINE,DC=local"  # DN complet du compte de service
AD_BIND_PASSWORD="MOT_DE_PASSE_DU_COMPTE_SERVICE"

# --- Certificat CA pour LDAPS (recommandé) ---
# Chemin vers le fichier .crt de votre AC interne (Active Directory Certificate Services)
# Ce fichier permet de valider le certificat du DC lors de la connexion LDAPS.
# Laissez vide ("") pour désactiver la validation (déconseillé en production)
AD_CA_CERT_PATH="/chemin/vers/CA-votre-domaine.crt"

# --- SMTP Gmail ---
# Utilisez un compte Gmail dédié + un mot de passe d'application Google
# Générer sur : https://myaccount.google.com/apppasswords
SMTP_USER="votrecompte@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx"

# --- HTTPS / Nginx (optionnel) ---
# Si vous avez un certificat TLS signé, renseignez les chemins.
# Laissez vide pour une installation HTTP simple (port 3000 direct).
TLS_CERT_PATH=""    # ex: /etc/nginx/ssl/mdp/fullchain.crt
TLS_KEY_PATH=""     # ex: /etc/nginx/ssl/mdp/mdp.key
