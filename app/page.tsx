import { ShieldCheck, Activity } from "lucide-react";
import Link from "next/link";
import ResetForm from "@/components/reset-form";
import CheckAccountDialog from "@/components/check-account-dialog";

export default function HomePage() {
  const appName = process.env.APP_NAME ?? "SSPR";
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      {/* Bouton admin discret en haut à droite */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <Link
          href="/diagnostic"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm hover:text-slate-700 hover:border-slate-300 transition-colors"
          title="Diagnostic système"
        >
          <Activity className="h-3.5 w-3.5" />
          Diagnostic
        </Link>
        <CheckAccountDialog />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* En-tête */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
              <ShieldCheck className="h-9 w-9 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{appName}</h1>
          <p className="text-sm text-slate-500">
            Portail de réinitialisation de mot de passe Active Directory
          </p>
        </div>

        {/* Formulaire multi-étapes */}
        <ResetForm />

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 space-y-1">
          <p>Problème ? Contactez votre administrateur.</p>
          <p>
            <Link href="/mentions-legales" className="hover:text-slate-600 underline">
              Mentions légales
            </Link>
            {" "}&mdash;{" "}
            <Link href="/politique-confidentialite" className="hover:text-slate-600 underline">
              Politique de confidentialité
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
