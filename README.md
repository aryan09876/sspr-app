# SSPR — Self-Service Password Reset pour Active Directory

Portail web permettant aux utilisateurs de réinitialiser leur mot de passe Active Directory par vérification OTP (code à 6 chiffres) envoyé par email. Aucune interaction avec l'équipe IT requise.

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| Réinitialisation de mot de passe | Email + identifiant Windows → OTP → nouveau mot de passe |
| Trouver son identifiant Windows | Email → OTP → affiche le `sAMAccountName` |
| Vérifier un compte AD (admin) | Vérifie qu'un email + identifiant correspondent dans l'AD |

## Architecture technique

```
Navigateur → HTTPS 443 → Nginx (reverse proxy) → HTTP 127.0.0.1:3000 → Next.js 14
                                                                              ↓
                                                                    LDAPS 636 → Active Directory
                                                                    SMTP 587  → Gmail
                                                                    SQLite    → prisma/dev.db
```

**Stack :** Next.js 14 (App Router) · TypeScript · Prisma 5 + SQLite · ldapjs 3 · Nodemailer · ShadCN UI · Tailwind CSS

### Flux de réinitialisation (3 étapes)

```
1. Utilisateur soumet email + identifiant Windows (sAMAccountName)
   → Vérification dans l'AD (les deux doivent correspondre au même compte)
   → OTP généré, hashé HMAC-SHA256, stocké en base, envoyé par email

2. Utilisateur saisit le code OTP (6 chiffres, valable 15 min, 5 tentatives max)
   → Comparaison timing-safe avec le hash en base

3. Utilisateur choisit son nouveau mot de passe
   → Réinitialisation via l'attribut unicodePwd sur LDAPS (port 636)
```

### Ce qui est stocké en base

| Champ | Contenu |
|---|---|
| `email` | Adresse email de l'utilisateur |
| `adDn` | DN Active Directory du compte |
| `otpHash` | **Hash HMAC-SHA256 du code OTP** — jamais le code en clair |
| `expiresAt` | Expiration du code (15 min) |
| `attempts` | Nombre de tentatives (max 5) |
| `ipAddress` | IP de la requête |

Le mot de passe de l'utilisateur, le code OTP en clair et les credentials du compte de service ne sont **jamais** stockés.

---

## Installation rapide (script automatique)

```bash
# 1. Copier le fichier de configuration
cp setup/config.example.sh setup/config.sh

# 2. Remplir setup/config.sh avec vos informations
#    (domaine AD, compte de service, Gmail, IP serveur...)
nano setup/config.sh

# 3. Lancer l'installation
bash setup/install.sh
```

Le script installe Node.js, PM2 et Nginx si absents, génère les secrets automatiquement, crée `.env.local`, migre la base de données, compile et démarre l'application.

---

## Installation manuelle

### Prérequis

| Outil | Version |
|---|---|
| Node.js | 20.x LTS |
| npm | 10.x |
| PM2 | dernière version |
| Nginx | (recommandé pour HTTPS) |
| Debian / Ubuntu | 12 / 22.04+ |

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env.local
# Éditer .env.local avec vos valeurs réelles
```

Variables requises :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chemin absolu vers le fichier SQLite |
| `AD_URL` | `ldaps://NOM_DC.DOMAINE.local:636` |
| `AD_BASE_DN` | `DC=DOMAINE,DC=local` |
| `AD_BIND_DN` | DN complet du compte de service |
| `AD_BIND_PASSWORD` | Mot de passe du compte de service |
| `AD_TLS_REJECT_UNAUTHORIZED` | `true` en prod (avec `AD_TLS_CA_CERT_PATH`) |
| `AD_TLS_CA_CERT_PATH` | Chemin vers le certificat CA de l'AD (optionnel) |
| `SMTP_USER` / `SMTP_PASS` | Compte Gmail + mot de passe d'application |
| `OTP_SECRET` | Secret HMAC-SHA256 — générer avec `openssl rand -base64 32` |
| `APP_BASE_URL` | URL publique de l'application |
| `APP_NAME` | Nom affiché dans l'interface et les emails |

### 3. Initialiser la base de données

```bash
npx prisma migrate deploy
```

### 4. Compiler et démarrer

```bash
npm run build
pm2 start npm --name "sspr-app" -- start
pm2 save
```

---

## Configuration Active Directory

### Compte de service

Créer un compte `SVC-PwdReset` avec :
- **Mot de passe n'expire jamais**
- **Compte activé**

Déléguer le droit **Réinitialiser le mot de passe** sur les OUs concernées :

```
ADUC → Clic droit sur l'OU → Propriétés → Sécurité → Avancé → Ajouter
  Entité : SVC-PwdReset
  Appliqué à : Objets utilisateur descendants
  Permission : Réinitialiser le mot de passe ✓
```

Ou en PowerShell (à exécuter sur le DC) :

```powershell
$svc = Get-ADUser "SVC-PwdReset"
$ou  = "OU=Utilisateurs,DC=DOMAINE,DC=local"

$resetPwdGuid        = [Guid]"00299570-246d-11d0-a768-00aa006e0529"
$identity            = [System.Security.Principal.IdentityReference]$svc.SID
$adRights            = [System.DirectoryServices.ActiveDirectoryRights]::ExtendedRight
$type                = [System.Security.AccessControl.AccessControlType]::Allow
$inheritedObjectType = [Guid]"bf967aba-0de6-11d0-a285-00aa003049e2"
$ace = New-Object System.DirectoryServices.ActiveDirectoryAccessRule(
    $identity, $adRights, $type, $resetPwdGuid,
    [System.DirectoryServices.ActiveDirectorySecurityInheritance]::Descendents,
    $inheritedObjectType
)
$acl = Get-Acl "AD:\$ou"
$acl.AddAccessRule($ace)
Set-Acl "AD:\$ou" $acl
```

### Attribut `mail` des utilisateurs

Chaque utilisateur doit avoir l'attribut `mail` renseigné dans l'AD (ADUC → Général → Courrier électronique). C'est l'adresse email utilisée pour recevoir le code OTP.

```powershell
# Vérifier les comptes sans attribut mail
Get-ADUser -Filter * -Properties mail | Where-Object { -not $_.mail } | Select Name
```

### LDAPS (port 636)

- Le certificat du DC doit être émis par l'AC AD CS (CN = FQDN du DC)
- Le port 636 doit être accessible depuis le serveur hébergeant l'application
- Exporter le certificat CA en `.crt` et le renseigner dans `AD_TLS_CA_CERT_PATH`

---

## Configuration HTTPS et certificats TLS

L'application doit être servie en HTTPS via Nginx. Le certificat est signé par votre autorité de certification Active Directory (AD CS).

### Étape 1 — Créer le dossier SSL et la clé privée

```bash
sudo mkdir -p /etc/nginx/ssl/mdp
sudo openssl req -new -newkey rsa:2048 -nodes \
  -keyout /etc/nginx/ssl/mdp/mdp.DOMAINE.local.key \
  -out    /etc/nginx/ssl/mdp/mdp.DOMAINE.local.csr \
  -subj   "/CN=mdp.DOMAINE.local" \
  -addext "subjectAltName=DNS:mdp.DOMAINE.local,IP:IP_DU_SERVEUR"
sudo chmod 600 /etc/nginx/ssl/mdp/mdp.DOMAINE.local.key
```

> Remplacez `DOMAINE.local` par votre domaine et `IP_DU_SERVEUR` par l'IP de la VM.

### Étape 2 — Faire signer le CSR par AD CS

1. Depuis un navigateur dans le domaine, accédez à `http://DC/certsrv`
2. **Demander un certificat** → **Demande de certificat avancée**
3. Collez le contenu du `.csr` (ouvrir avec `cat /etc/nginx/ssl/mdp/mdp.DOMAINE.local.csr`)
4. Modèle de certificat : **Serveur Web**
5. **Soumettre** → **Télécharger le certificat** (format Base 64) → fichier `.cer`

### Étape 3 — Récupérer le certificat CA

Toujours sur `http://DC/certsrv` :
1. **Télécharger un certificat d'autorité de certification** → Format Base 64 → fichier `CA-DOMAINE.crt`
2. Copier les deux fichiers (`.cer` + CA) sur la VM Linux

### Étape 4 — Créer la chaîne complète et installer

```bash
# Copier les fichiers sur la VM
sudo cp mdp.DOMAINE.local.cer /etc/nginx/ssl/mdp/mdp.DOMAINE.local.crt
sudo cp CA-DOMAINE.crt        /etc/nginx/ssl/mdp/CA-DOMAINE.crt

# Créer la fullchain (certificat + CA)
sudo cat /etc/nginx/ssl/mdp/mdp.DOMAINE.local.crt \
         /etc/nginx/ssl/mdp/CA-DOMAINE.crt \
       > /tmp/mdp-fullchain.crt
sudo mv /tmp/mdp-fullchain.crt /etc/nginx/ssl/mdp/mdp-fullchain.crt
```

### Étape 5 — Configurer Nginx

Créer `/etc/nginx/sites-available/mdp.DOMAINE.local` :

```nginx
server {
    listen 80;
    server_name mdp.DOMAINE.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mdp.DOMAINE.local;

    ssl_certificate     /etc/nginx/ssl/mdp/mdp-fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/mdp/mdp.DOMAINE.local.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mdp.DOMAINE.local /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Étape 6 — Configurer le CA pour LDAPS

Le même fichier `CA-DOMAINE.crt` sert à valider le certificat TLS du contrôleur de domaine lors des connexions LDAPS :

```bash
# Dans .env.local
AD_TLS_REJECT_UNAUTHORIZED=true
AD_TLS_CA_CERT_PATH=/etc/nginx/ssl/mdp/CA-DOMAINE.crt
```

> Si vous ne disposez pas du certificat CA, vous pouvez mettre `AD_TLS_REJECT_UNAUTHORIZED=false` temporairement (non recommandé en production).

### Étape 7 — DNS sur le contrôleur de domaine

Créer un enregistrement A dans la zone DNS de votre domaine (sur le DC) :

| Nom | Type | Valeur |
|---|---|---|
| `mdp` | A | `IP_DU_SERVEUR` |

Vérification :
```bash
nslookup mdp.DOMAINE.local
# Doit retourner l'IP du serveur
```

### Étape 8 — Distribuer le CA aux postes clients

Pour éviter l'avertissement "Connexion non sécurisée" dans les navigateurs :

**Via GPO (recommandé)** :
```
Configuration ordinateur → Paramètres Windows → Paramètres de sécurité
  → Stratégies de clé publique → Autorités de certification racines de confiance
  → Importer → CA-DOMAINE.crt
```

**Manuellement** : double-clic sur `CA-DOMAINE.crt` → Installer → "Autorités de certification racines de confiance"

---

## Sécurité

| Mécanisme | Détail |
|---|---|
| CSRF | Validation de l'header `Origin` sur toutes les routes POST |
| Rate limiting | 3 req/h par email, 10 req/h par IP sur les routes `/request` |
| OTP | 6 chiffres, 15 min d'expiration, 5 tentatives max, usage unique |
| Stockage OTP | HMAC-SHA256 uniquement — jamais en clair |
| LDAP injection | Échappement RFC 4515 sur tous les filtres LDAP |
| TLS LDAP | Validation du certificat CA en production |
| Headers HTTP | CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options |
| Port 3000 | Lié à `127.0.0.1` uniquement — inaccessible depuis l'extérieur |

---

## Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `BIND_FAILED` | Mauvais mot de passe ou compte verrouillé | Vérifier `AD_BIND_PASSWORD`, déverrouiller le compte |
| `USER_NOT_FOUND` | Email ou identifiant incorrect, ou `mail` absent dans l'AD | Vérifier les deux champs et l'attribut `mail` |
| `DUPLICATE_EMAIL` | Plusieurs comptes AD partagent le même email | Corriger les doublons dans l'AD |
| `INSUFFICIENT_RIGHTS` | Le compte de service n'a pas la délégation | Déléguer "Réinitialiser le mot de passe" |
| `UNWILLING_TO_PERFORM` | Connexion non-LDAPS ou politique Fine-Grained | Vérifier `AD_URL=ldaps://...` et port 636 |
| `PASSWORD_POLICY` | Mot de passe trop simple | Respecter la politique AD (8 car., 3 catégories) |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Certificat CA non reconnu | Fournir `AD_TLS_CA_CERT_PATH` ou mettre `AD_TLS_REJECT_UNAUTHORIZED=false` (dev uniquement) |
| `ECONNREFUSED` sur port 636 | LDAPS inaccessible | Vérifier le pare-feu et le service LDAPS sur le DC |
| Email non reçu | Mauvaises credentials SMTP | Vérifier `SMTP_USER` et `SMTP_PASS` (mot de passe d'application Gmail) |

---

## Commandes utiles

```bash
# PM2
pm2 list                            # Statut de l'application
pm2 logs sspr-app --lines 50        # Logs récents
pm2 restart sspr-app --update-env   # Redémarrer après modification de .env.local

# Base de données
npm run db:migrate                  # Appliquer les migrations
npm run db:studio                   # Interface visuelle (Prisma Studio)

# Build
npm run build                       # Recompiler après modification du code
npm run lint                        # Vérification ESLint
```
