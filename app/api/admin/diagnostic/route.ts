export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { testLdapConnection } from "@/lib/ldap";
import { testSmtpConnection } from "@/lib/mail";

const REQUIRED_VARS = [
  "DATABASE_URL",
  "AD_URL",
  "AD_BASE_DN",
  "AD_BIND_DN",
  "AD_BIND_PASSWORD",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "OTP_SECRET",
  "APP_BASE_URL",
];

export async function GET() {
  // 1. Variables d'environnement
  const missingVars = REQUIRED_VARS.filter((v) => !process.env[v]);
  const configOk = missingVars.length === 0;

  // 2. Base de données (connexion + existence de la table)
  let dbResult: { ok: boolean; detail: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    const count = await prisma.passwordResetToken.count();
    dbResult = { ok: true, detail: `Table accessible — ${count} entrée(s) en base` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNoTable = msg.includes("PasswordResetToken") || msg.includes("no such table");
    dbResult = {
      ok: false,
      detail: isNoTable
        ? "Table PasswordResetToken absente — lancez : npx prisma migrate deploy"
        : `Erreur DB : ${msg}`,
    };
  }

  // 3. LDAP / AD
  let ldapResult: { ok: boolean; detail: string };
  try {
    const r = await testLdapConnection();
    ldapResult = {
      ok: r.success,
      detail: r.success
        ? `Connexion LDAPS réussie (${process.env.AD_URL ?? ""})`
        : `Échec LDAPS : ${r.error ?? "erreur inconnue"}`,
    };
  } catch (err) {
    ldapResult = { ok: false, detail: `Exception LDAP : ${err instanceof Error ? err.message : String(err)}` };
  }

  // 4. SMTP
  let smtpResult: { ok: boolean; detail: string };
  try {
    const r = await testSmtpConnection();
    smtpResult = {
      ok: r.success,
      detail: r.success
        ? `Connexion SMTP réussie (${process.env.SMTP_HOST ?? ""}:${process.env.SMTP_PORT ?? "587"})`
        : `Échec SMTP : ${r.error ?? "erreur inconnue"}`,
    };
  } catch (err) {
    smtpResult = { ok: false, detail: `Exception SMTP : ${err instanceof Error ? err.message : String(err)}` };
  }

  const allOk = configOk && dbResult.ok && ldapResult.ok && smtpResult.ok;

  return NextResponse.json({
    status: allOk ? "ok" : "error",
    checks: {
      config: {
        ok: configOk,
        detail: configOk
          ? "Toutes les variables d'environnement sont définies"
          : `Variables manquantes : ${missingVars.join(", ")}`,
      },
      database: dbResult,
      ldap: ldapResult,
      smtp: smtpResult,
    },
  });
}
