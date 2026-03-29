"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("sspr-consent");
    if (!accepted) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem("sspr-consent", "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg p-4">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-slate-600 flex-1">
          Ce site collecte uniquement les données strictement nécessaires au fonctionnement du service
          (adresse email, identifiant Windows, adresse IP). Aucun cookie de suivi ni aucune donnée
          publicitaire n&apos;est utilisé.{" "}
          <Link href="/mentions-legales" className="underline text-blue-600 hover:text-blue-800">
            Mentions légales
          </Link>{" "}
          &mdash;{" "}
          <Link href="/politique-confidentialite" className="underline text-blue-600 hover:text-blue-800">
            Politique de confidentialité
          </Link>
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          J&apos;ai compris
        </button>
      </div>
    </div>
  );
}
