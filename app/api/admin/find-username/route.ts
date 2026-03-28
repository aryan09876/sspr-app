import { NextResponse } from "next/server";

// Cette route a été remplacée par /api/admin/find-username/request + /verify
// qui imposent une vérification OTP avant de révéler le sAMAccountName.
export async function POST() {
  return NextResponse.json({ error: "Route désactivée." }, { status: 410 });
}
