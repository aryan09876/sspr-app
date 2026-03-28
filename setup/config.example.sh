#!/usr/bin/env bash
# =============================================================================
#  SSPR — Fichier de configuration pour l'installation automatique
#
#  C'est le SEUL fichier que vous devez modifier avant de lancer l'installation.
#
#  INSTRUCTIONS :
#    1. Copiez ce fichier : cp setup/config.example.sh setup/config.sh
#    2. Remplissez TOUTES les valeurs ci-dessous (remplacez les textes en MAJUSCULES)
#    3. Lancez : bash setup/install.sh
#
#  Le script install.sh va :
#    - Installer Node.js et les dépendances
#    - Générer automatiquement les secrets cryptographiques
#    - Créer le fichier .env.local
#    - Compiler et démarrer l'application
#    - Configurer Nginx si installé
# =============================================================================

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  VOTRE ORGANISATION                                                        │
# └─────────────────────────────────────────────────────────────────────────────┘
# Ce nom apparaît dans l'interface web et dans les emails envoyés aux utilisateurs
APP_NAME="NOM_DE_VOTRE_ORGANISATION"

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  SERVEUR (la VM Linux où vous installez cette application)                 │
# └─────────────────────────────────────────────────────────────────────────────┘
SERVER_IP="192.168.X.X"           # IP de cette VM (ex: 192.168.1.10)
APP_HOSTNAME="mdp.DOMAINE.local"  # Nom DNS que vous allez créer sur le DC
                                   # → Les utilisateurs taperont cette adresse dans leur navigateur

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  ACTIVE DIRECTORY                                                          │
# └─────────────────────────────────────────────────────────────────────────────┘
# FQDN du contrôleur de domaine (le serveur qui héberge votre AD)
AD_DC_HOSTNAME="DC-NOM.DOMAINE.local"   # ex: DC-SRV01.entreprise.local

# IP du contrôleur de domaine (ajoutée dans /etc/hosts de la VM pour la résolution DNS)
AD_DC_IP="192.168.X.X"                  # ex: 192.168.1.100

# Base DN = racine de votre domaine Active Directory
AD_BASE_DN="DC=DOMAINE,DC=local"        # ex: DC=entreprise,DC=local

# DN complet du compte de service créé pour cette application
# Ce compte doit avoir la délégation "Réinitialiser le mot de passe" sur les OUs concernées
# Pour trouver le DN : Get-ADUser SVC-PwdReset | Select DistinguishedName
AD_BIND_DN="CN=SVC-PwdReset,OU=...,DC=DOMAINE,DC=local"
# Exemple : CN=SVC-PwdReset,OU=Comptes de service,DC=entreprise,DC=local

# Mot de passe du compte de service
AD_BIND_PASSWORD="MOT_DE_PASSE_DU_COMPTE_SERVICE"

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  CERTIFICAT CA POUR LDAPS (recommandé en production)                       │
# └─────────────────────────────────────────────────────────────────────────────┘
# Chemin vers le certificat de votre autorité de certification interne (AD CS)
# Ce fichier permet de valider le certificat TLS du DC lors de la connexion LDAPS (port 636)
#
# Comment l'obtenir :
#   1. Depuis un navigateur dans le domaine → http://VOTRE-DC/certsrv
#   2. Cliquer "Télécharger un certificat d'autorité de certification"
#   3. Choisir le format "Base 64" → enregistrer le fichier .crt
#   4. Copier le fichier sur cette VM Linux
#
# Laissez vide ("") pour désactiver la validation TLS (déconseillé en production)
AD_CA_CERT_PATH="/chemin/vers/CA-votre-domaine.crt"

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  SMTP — ENVOI DES EMAILS (codes OTP)                                      │
# └─────────────────────────────────────────────────────────────────────────────┘
# Utilisez un compte Gmail dédié (ne pas utiliser un compte personnel)
SMTP_USER="votrecompte@gmail.com"

# Mot de passe d'APPLICATION Google (ce n'est PAS le mot de passe du compte Gmail)
# Format : 16 caractères en 4 groupes de 4 (ex: abcd efgh ijkl mnop)
#
# Comment le générer :
#   1. Connectez-vous au compte Gmail → https://myaccount.google.com/apppasswords
#   2. Sélectionnez "Autre" → donnez un nom (ex: "SSPR")
#   3. Copiez le mot de passe généré ci-dessous
SMTP_PASS="xxxx xxxx xxxx xxxx"

# ┌─────────────────────────────────────────────────────────────────────────────┐
# │  HTTPS / NGINX (optionnel)                                                 │
# └─────────────────────────────────────────────────────────────────────────────┘
# Si vous avez un certificat TLS signé par votre AC (AD CS), renseignez les chemins.
# Laissez vide pour une installation HTTP simple (accès direct sur le port 3000).
#
# Voir la section "Configuration HTTPS et certificats TLS" du README.md
# pour la procédure complète de création du certificat.
TLS_CERT_PATH=""    # ex: /etc/nginx/ssl/mdp/mdp-fullchain.crt
TLS_KEY_PATH=""     # ex: /etc/nginx/ssl/mdp/mdp.key
