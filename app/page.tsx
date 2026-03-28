import { ShieldCheck } from "lucide-react";
import ResetForm from "@/components/reset-form";
import CheckAccountDialog from "@/components/check-account-dialog";

export default function HomePage() {
  const appName = process.env.APP_NAME ?? "SSPR";
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      {/* Bouton admin discret en haut à droite */}
      <div className="fixed top-4 right-4 z-50">
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
        <p className="text-center text-xs text-slate-400">
          Problème ? Contactez votre administrateur.
        </p>
      </div>
    </main>
  );
}
