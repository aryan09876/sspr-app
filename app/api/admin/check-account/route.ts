import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findAndValidateUser } from "@/lib/ldap";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Adresse email invalide."),
  identifiant: z.string().min(1, "L'identifiant Windows est requis."),
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

  const { email, identifiant } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown";

  if (!checkRateLimit(`checkaccount:ip:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 });
  }

  if (!checkRateLimit(`checkaccount:email:${email}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de tentatives pour cet email. Réessayez dans une heure." }, { status: 429 });
  }

  try {
    await findAndValidateUser(email, identifiant);
    return NextResponse.json({ found: true }, { status: 200 });
  } catch (err: unknown) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code: string }).code
        : null;

    if (code === "USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "L'email ou l'identifiant Windows ne correspond à aucun compte Active Directory." },
        { status: 401 }
      );
    }

    if (code === "DUPLICATE_EMAIL") {
      return NextResponse.json(
        { error: "Plusieurs comptes partagent cette adresse email. Contactez votre administrateur." },
        { status: 409 }
      );
    }

    const message =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message: string }).message
        : "Erreur LDAP inconnue.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
