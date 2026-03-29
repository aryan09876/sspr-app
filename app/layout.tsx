import type { Metadata } from "next";
import "./globals.css";
import CookieBanner from "@/components/cookie-banner";

// Active la purge automatique des tokens expirés (toutes les heures)
import "@/lib/purge-tokens";

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
      <body className="font-sans antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
