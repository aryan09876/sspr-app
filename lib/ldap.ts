/**
 * Module LDAP pour la recherche d'utilisateur et la réinitialisation de mot de passe AD.
 *
 * Toutes les opérations s'effectuent via LDAPS (port 636) avec le compte de service
 * SVC-PwdReset. Ce module est exclusivement serveur (jamais importé côté client).
 *
 * Prérequis AD :
 *  - Le compte SVC-PwdReset doit avoir le droit "Réinitialiser le mot de passe"
 *    sur les OUs contenant les utilisateurs.
 *  - L'attribut `mail` des utilisateurs doit correspondre à leur adresse Gmail.
 *  - LDAPS doit être actif sur le DC (port 636, certificat AD CS valide).
 */

import ldap from "ldapjs";
import fs from "fs";
import tls from "tls";

// ─────────────────────────────────────────────
// Types d'erreur métier
// ─────────────────────────────────────────────
export interface LdapAppError {
  code:
    | "USER_NOT_FOUND"
    | "DUPLICATE_EMAIL"
    | "PASSWORD_POLICY"
    | "INSUFFICIENT_RIGHTS"
    | "UNWILLING_TO_PERFORM"
    | "BIND_FAILED"
    | "PROTECTED_ACCOUNT"
    | "LDAP_ERROR";
  message: string;
}

function isLdapAppError(err: unknown): err is LdapAppError {
  return typeof err === "object" && err !== null && "code" in err;
}

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
interface LdapConfig {
  url: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  rejectUnauthorized: boolean;
  caCertPath?: string;
}

function getConfig(): LdapConfig {
  const url = process.env.AD_URL;
  const baseDn = process.env.AD_BASE_DN;
  const bindDn = process.env.AD_BIND_DN;
  const bindPassword = process.env.AD_BIND_PASSWORD;

  if (!url || !baseDn || !bindDn || !bindPassword) {
    throw {
      code: "LDAP_ERROR",
      message:
        "Variables d'environnement LDAP manquantes (AD_URL, AD_BASE_DN, AD_BIND_DN, AD_BIND_PASSWORD).",
    } satisfies LdapAppError;
  }

  return {
    url,
    baseDn,
    bindDn,
    bindPassword,
    rejectUnauthorized: process.env.AD_TLS_REJECT_UNAUTHORIZED !== "false",
    caCertPath: process.env.AD_TLS_CA_CERT_PATH,
  };
}

// ─────────────────────────────────────────────
// Création du client LDAP
// ─────────────────────────────────────────────
function createClient(config: LdapConfig): ldap.Client {
  const tlsOptions: tls.ConnectionOptions = {
    rejectUnauthorized: config.rejectUnauthorized,
  };

  // Charge le certificat racine de l'AC interne si fourni
  if (config.caCertPath && fs.existsSync(config.caCertPath)) {
    tlsOptions.ca = [fs.readFileSync(config.caCertPath)];
  }

  return ldap.createClient({
    url: config.url,
    tlsOptions,
    // Timeout de connexion : 10 s
    connectTimeout: 10000,
    // Timeout d'inactivité : 30 s
    timeout: 30000,
  });
}

// ─────────────────────────────────────────────
// Helpers Promise
// ─────────────────────────────────────────────
function bindAsync(
  client: ldap.Client,
  dn: string,
  password: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) {
        reject({
          code: "BIND_FAILED",
          message: `Échec d'authentification du compte de service : ${err.message}`,
        } satisfies LdapAppError);
      } else {
        resolve();
      }
    });
  });
}

function destroyClient(client: ldap.Client): void {
  try {
    client.unbind();
  } catch {
    /* ignore */
  }
  try {
    client.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * Échappe les caractères spéciaux d'une valeur pour un filtre LDAP.
 * RFC 4515 – https://www.rfc-editor.org/rfc/rfc4515#section-3
 */
function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\u0000]/g, (ch) => {
    switch (ch) {
      case "\\":
        return "\\5c";
      case "*":
        return "\\2a";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      case "\u0000":
        return "\\00";
      default:
        return ch;
    }
  });
}

// ─────────────────────────────────────────────
// Groupes protégés (comptes admin non réinitialisables)
// ─────────────────────────────────────────────
const PROTECTED_GROUPS = [
  "Domain Admins",
  "Admins du domaine",
  "Enterprise Admins",
  "Administrateurs de l'entreprise",
  "Schema Admins",
  "Administrateurs du schéma",
  "Administrators",
  "Administrateurs",
  "Account Operators",
  "Opérateurs de compte",
  "Server Operators",
  "Opérateurs de serveur",
];

/**
 * Vérifie si un utilisateur appartient à un groupe protégé (admin).
 * Utilise l'attribut memberOf de l'utilisateur.
 */
async function isProtectedAccount(
  client: ldap.Client,
  userDn: string,
  baseDn: string
): Promise<{ protected: boolean; group?: string }> {
  return new Promise((resolve) => {
    const opts: ldap.SearchOptions = {
      scope: "base",
      attributes: ["memberOf"],
      filter: "(objectClass=*)",
    };

    client.search(userDn, opts, (err, res) => {
      if (err) {
        // En cas d'erreur, on laisse passer (fail-open pour ne pas bloquer)
        return resolve({ protected: false });
      }

      const groups: string[] = [];

      res.on("searchEntry", (entry) => {
        const memberOf = entry.attributes.find(
          (a) => a.type.toLowerCase() === "memberof"
        );
        if (memberOf) {
          for (const val of memberOf.values) {
            groups.push(String(val));
          }
        }
      });

      res.on("error", () => resolve({ protected: false }));

      res.on("end", () => {
        // Extraire le CN de chaque groupe et comparer (insensible à la casse)
        for (const groupDn of groups) {
          const cnMatch = groupDn.match(/^CN=([^,]+)/i);
          if (cnMatch) {
            const cn = cnMatch[1];
            for (const pg of PROTECTED_GROUPS) {
              if (cn.toLowerCase() === pg.toLowerCase()) {
                return resolve({ protected: true, group: cn });
              }
            }
          }
        }
        resolve({ protected: false });
      });
    });
  });
}

// ─────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────

export interface AdUser {
  dn: string;
  sAMAccountName: string;
}

/**
 * Recherche un utilisateur AD par son attribut `mail`.
 * Retourne DN + sAMAccountName.
 */
export async function findUserByEmail(email: string): Promise<AdUser> {
  const config = getConfig();
  const client = createClient(config);

  try {
    await bindAsync(client, config.bindDn, config.bindPassword);

    return await new Promise<AdUser>((resolve, reject) => {
      const filter = `(&(objectClass=user)(mail=${escapeLdapFilter(email)}))`;

      const opts: ldap.SearchOptions = {
        filter,
        scope: "sub",
        attributes: ["dn", "sAMAccountName"],
      };

      const found: AdUser[] = [];

      client.search(config.baseDn, opts, (err, res) => {
        if (err) {
          destroyClient(client);
          return reject({
            code: "LDAP_ERROR",
            message: `Erreur lors de la recherche LDAP : ${err.message}`,
          } satisfies LdapAppError);
        }

        res.on("searchEntry", (entry) => {
          const dn =
            typeof entry.objectName === "string"
              ? entry.objectName
              : String(entry.objectName);

          const sam = entry.attributes.find(
            (a) => a.type.toLowerCase() === "samaccountname"
          );
          const sAMAccountName = sam ? String(sam.values[0]) : "";
          found.push({ dn, sAMAccountName });
        });

        res.on("error", (err) => {
          destroyClient(client);
          reject({
            code: "LDAP_ERROR",
            message: `Erreur de recherche : ${err.message}`,
          } satisfies LdapAppError);
        });

        res.on("end", () => {
          destroyClient(client);

          if (found.length === 0) {
            return reject({
              code: "USER_NOT_FOUND",
              message:
                "Aucun compte Active Directory ne correspond à cette adresse email.",
            } satisfies LdapAppError);
          }
          if (found.length > 1) {
            return reject({
              code: "DUPLICATE_EMAIL",
              message:
                "Plusieurs comptes Active Directory partagent cette adresse email. Contactez votre administrateur.",
            } satisfies LdapAppError);
          }

          resolve(found[0]);
        });
      });
    });
  } catch (err) {
    destroyClient(client);
    throw err;
  }
}

/** Retourne uniquement le DN (rétro-compatibilité avec check-account). */
export async function findUserDnByEmail(email: string): Promise<string> {
  const user = await findUserByEmail(email);
  return user.dn;
}

/**
 * Recherche le DN et valide que l'identifiant Windows fourni correspond.
 * Vérifie aussi que le compte n'est pas un compte admin protégé.
 * @throws LdapAppError avec code "USER_NOT_FOUND" si email ou identifiant ne correspondent pas.
 * @throws LdapAppError avec code "PROTECTED_ACCOUNT" si le compte est admin.
 */
export async function findAndValidateUser(
  email: string,
  identifiant: string
): Promise<AdUser> {
  const config = getConfig();
  const user = await findUserByEmail(email);

  if (user.sAMAccountName.toLowerCase() !== identifiant.trim().toLowerCase()) {
    throw {
      code: "USER_NOT_FOUND",
      message:
        "L'email ou l'identifiant Windows ne correspondent à aucun compte. Vérifiez vos informations.",
    } satisfies LdapAppError;
  }

  // Vérifier que le compte n'est pas un admin protégé
  const client = createClient(config);
  try {
    await bindAsync(client, config.bindDn, config.bindPassword);
    const check = await isProtectedAccount(client, user.dn, config.baseDn);
    destroyClient(client);
    if (check.protected) {
      throw {
        code: "PROTECTED_ACCOUNT",
        message: `Ce compte appartient au groupe « ${check.group} ». La réinitialisation de mot de passe des comptes administrateurs est interdite pour des raisons de sécurité.`,
      } satisfies LdapAppError;
    }
  } catch (err) {
    destroyClient(client);
    if (isLdapAppError(err) && err.code === "PROTECTED_ACCOUNT") throw err;
    // Si la vérification échoue (erreur réseau, etc.), on laisse passer
  }

  return user;
}

/**
 * Retourne le sAMAccountName (identifiant Windows) pour un email donné.
 * Utilisé par le dialog "Trouver mon identifiant".
 */
export async function findUsernameByEmail(email: string): Promise<string> {
  const user = await findUserByEmail(email);
  return user.sAMAccountName;
}

/**
 * Réinitialise le mot de passe d'un utilisateur AD via l'attribut `unicodePwd`.
 *
 * Requiert que :
 *  - La connexion soit en LDAPS (port 636) — obligatoire pour modifier unicodePwd.
 *  - Le compte de service ait le droit "Réinitialiser le mot de passe" sur l'objet.
 *
 * @param userDn      DN complet de l'utilisateur (retourné par findUserDnByEmail)
 * @param newPassword Nouveau mot de passe en clair (sera encodé en UTF-16LE)
 */
export async function resetAdPassword(
  userDn: string,
  newPassword: string
): Promise<void> {
  const config = getConfig();
  const client = createClient(config);

  try {
    await bindAsync(client, config.bindDn, config.bindPassword);

    return await new Promise<void>((resolve, reject) => {
      // AD exige que le mot de passe soit encadré de guillemets et encodé en UTF-16LE
      const encodedPassword = Buffer.from(`"${newPassword}"`, "utf16le");

      // ldapjs : la modification binaire doit passer via Change + Attribute
      // On utilise `as any` car @types/ldapjs type `vals` en string[] uniquement,
      // mais ldapjs accepte nativement des Buffer pour les attributs binaires.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LdapChange = ldap.Change as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LdapAttribute = (ldap as any).Attribute;

      const change = new LdapChange({
        operation: "replace",
        modification: new LdapAttribute({
          type: "unicodePwd",
          vals: [encodedPassword],
        }),
      });

      client.modify(userDn, change, (err) => {
        destroyClient(client);

        if (!err) {
          return resolve();
        }

        const msg = err.message ?? "";

        // Codes d'erreur LDAP courants pour les modifications de mot de passe AD
        if (err.code === 19 || msg.includes("CONSTRAINT_VIOLATION")) {
          return reject({
            code: "PASSWORD_POLICY",
            message:
              "Le mot de passe ne respecte pas la politique de complexité Active Directory. Il doit contenir au moins 8 caractères avec majuscules, minuscules, chiffres et caractères spéciaux.",
          } satisfies LdapAppError);
        }

        if (err.code === 50 || msg.includes("INSUFFICIENT_ACCESS_RIGHTS")) {
          return reject({
            code: "INSUFFICIENT_RIGHTS",
            message:
              "Le compte de service n'a pas les droits pour réinitialiser ce mot de passe. Contactez votre administrateur AD.",
          } satisfies LdapAppError);
        }

        if (err.code === 53 || msg.includes("UNWILLING_TO_PERFORM")) {
          return reject({
            code: "UNWILLING_TO_PERFORM",
            message:
              "Active Directory refuse la modification. Vérifiez que la connexion est bien en LDAPS (port 636) et que le mot de passe respecte la politique.",
          } satisfies LdapAppError);
        }

        reject({
          code: "LDAP_ERROR",
          message: `Erreur LDAP lors de la modification du mot de passe : ${msg}`,
        } satisfies LdapAppError);
      });
    });
  } catch (err) {
    destroyClient(client);
    throw err;
  }
}

/**
 * Teste la connexion LDAP (bind du compte de service).
 * Utile pour diagnostiquer la connectivité au démarrage.
 */
export async function testLdapConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = getConfig();
  const client = createClient(config);

  try {
    await bindAsync(client, config.bindDn, config.bindPassword);
    destroyClient(client);
    return { success: true };
  } catch (err: unknown) {
    destroyClient(client);
    if (isLdapAppError(err)) {
      return { success: false, error: err.message };
    }
    return { success: false, error: String(err) };
  }
}
