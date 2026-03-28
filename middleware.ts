import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Appliquer uniquement aux routes API POST
  if (req.method !== "POST" || !req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // Autoriser les requêtes sans Origin (appels serveur-à-serveur internes)
  if (!origin) return NextResponse.next();

  // Vérifier que l'origine correspond au host attendu
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return NextResponse.json(
        { error: "Requête refusée : origine non autorisée." },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Requête refusée : origine invalide." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
