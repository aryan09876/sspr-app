import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findUserByEmail } from "@/lib/ldap";
import { generateOtp, hashOtp, getOtpExpiry } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Adresse email invalide."),
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

  const { email } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown";

  if (!checkRateLimit(`finduser-otp:email:${email}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de demandes. Réessayez dans une heure." }, { status: 429 });
  }

  if (!checkRateLimit(`finduser-otp:ip:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de demandes depuis votre réseau. Réessayez plus tard." }, { status: 429 });
  }

  try {
    const user = await findUserByEmail(email);

    // Invalider les tokens précédents non utilisés pour cet email
    await prisma.passwordResetToken.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const otp = generateOtp();
    await prisma.passwordResetToken.create({
      data: {
        email,
        adDn: user.dn,
        otpHash: hashOtp(otp),
        expiresAt: getOtpExpiry(),
        ipAddress: ip,
      },
    });

    sendOtpEmail(email, otp).catch((err) => {
      console.error("[SSPR] Erreur envoi email OTP (find-username):", err);
    });

    const maskedEmail = email.replace(/(?<=.{2})[^@]+(?=@)/, "***");
    console.log(`[SSPR] OTP find-username envoyé à ${maskedEmail} depuis IP ${ip}`);

    return NextResponse.json(
      { message: "Un code de vérification a été envoyé à votre adresse email." },
      { status: 200 }
    );
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code: string }).code : null;

    if (code === "USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Aucun compte Active Directory ne correspond à cette adresse email." },
        { status: 401 }
      );
    }

    if (code === "DUPLICATE_EMAIL") {
      return NextResponse.json(
        { error: "Plusieurs comptes partagent cette adresse email. Contactez votre administrateur." },
        { status: 409 }
      );
    }

    console.error("[SSPR] Erreur inattendue /api/admin/find-username/request:", err);
    return NextResponse.json({ error: "Une erreur technique est survenue." }, { status: 500 });
  }
}
