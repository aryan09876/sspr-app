import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSPR – Réinitialisation de mot de passe",
  description: "Portail de réinitialisation de mot de passe Active Directory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
