import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resetAdPassword } from "@/lib/ldap";
import { checkRateLimit } from "@/lib/rate-limit";

const PASSWORD_MIN_LENGTH = 8;
const VERIFIED_TOKEN_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes après vérification OTP

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères requis.`)
  .refine(
    (v) => {
      const checks = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];
      return checks.filter((r) => r.test(v)).length >= 3;
    },
    { message: "Le mot de passe doit contenir des caractères d'au moins 3 catégories : majuscules, minuscules, chiffres, caractères spéciaux." }
  );

const schema = z.object({
  tokenId: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirmPassword"],
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const { tokenId, newPassword } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown";

  // Rate limit : 5 tentatives par IP par heure
  if (!checkRateLimit(`change:ip:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans une heure." },
      { status: 429 }
    );
  }

  // Retrouver le token
  const token = await prisma.passwordResetToken.findUnique({
    where: { id: tokenId },
  });

  if (!token) {
    return NextResponse.json(
      { error: "Session invalide. Recommencez depuis le début." },
      { status: 400 }
    );
  }

  if (!token.verifiedAt) {
    return NextResponse.json(
      { error: "Code OTP non vérifié. Recommencez depuis le début." },
      { status: 400 }
    );
  }

  if (token.consumedAt) {
    return NextResponse.json(
      { error: "Ce lien a déjà été utilisé. Recommencez si nécessaire." },
      { status: 400 }
    );
  }

  // Vérifier que le token vérifié n'est pas trop ancien
  if (Date.now() - token.verifiedAt.getTime() > VERIFIED_TOKEN_MAX_AGE_MS) {
    return NextResponse.json(
      { error: "Session expirée. Recommencez depuis le début." },
      { status: 400 }
    );
  }

  try {
    // Réinitialisation du mot de passe AD
    await resetAdPassword(token.adDn, newPassword);

    // Invalider le token
    await prisma.passwordResetToken.update({
      where: { id: tokenId },
      data: { consumedAt: new Date() },
    });

    console.log(`[SSPR] Mot de passe réinitialisé pour ${token.email} (DN: ${token.adDn})`);

    return NextResponse.json(
      { message: "Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter avec votre nouveau mot de passe." },
      { status: 200 }
    );
  } catch (err: unknown) {
    const ldapErr = err as { code?: string; message?: string };

    const httpStatus: Record<string, number> = {
      PASSWORD_POLICY: 422,
      INSUFFICIENT_RIGHTS: 403,
      UNWILLING_TO_PERFORM: 422,
      BIND_FAILED: 503,
      LDAP_ERROR: 500,
    };

    const status = ldapErr.code ? (httpStatus[ldapErr.code] ?? 500) : 500;
    const message = ldapErr.message ?? "Erreur interne. Réessayez dans quelques instants.";

    console.error(`[SSPR] Erreur reset mot de passe pour ${token.email}: ${JSON.stringify(err)}`);

    return NextResponse.json({ error: message }, { status });
  }
}
