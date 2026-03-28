import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findUsernameByEmail } from "@/lib/ldap";
import { verifyOtp, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, "Le code doit contenir 6 chiffres."),
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
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { email, otp } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown";

  if (!checkRateLimit(`finduser-verify:ip:${ip}`, 15, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 });
  }

  const token = await prisma.passwordResetToken.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!token) {
    return NextResponse.json(
      { error: "Aucune demande en cours ou code expiré. Recommencez depuis le début." },
      { status: 400 }
    );
  }

  if (token.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Trop de tentatives incorrectes. Faites une nouvelle demande." },
      { status: 429 }
    );
  }

  if (!verifyOtp(otp, token.otpHash)) {
    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });

    const remaining = OTP_MAX_ATTEMPTS - token.attempts - 1;
    return NextResponse.json(
      { error: `Code incorrect. ${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.` },
      { status: 400 }
    );
  }

  // OTP valide → consommer le token immédiatement (usage unique)
  await prisma.passwordResetToken.update({
    where: { id: token.id },
    data: { verifiedAt: new Date(), consumedAt: new Date() },
  });

  // Récupérer le sAMAccountName depuis l'AD
  try {
    const username = await findUsernameByEmail(email);
    return NextResponse.json({ username }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Impossible de récupérer l'identifiant depuis l'AD." }, { status: 500 });
  }
}
