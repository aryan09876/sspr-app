import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function MentionsLegales() {
  const appName = process.env.APP_NAME ?? "SSPR";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        <h1 className="text-2xl font-bold text-slate-900">Mentions légales</h1>

        <section className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900">1. Responsable du traitement</h2>
          <p>
            Le responsable du traitement des données est l&apos;organisation exploitante de cette
            instance de {appName} (ci-après &laquo; l&apos;Organisation &raquo;). Le service est
            destiné exclusivement aux collaborateurs de l&apos;Organisation disposant d&apos;un
            compte Active Directory.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">2. Objet du service</h2>
          <p>
            Ce portail permet aux utilisateurs de réinitialiser leur mot de passe Active Directory
            de manière autonome, par vérification d&apos;un code OTP (One-Time Password) envoyé
            par email. Le service est accessible uniquement depuis le réseau interne de
            l&apos;Organisation.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">3. Hébergement</h2>
          <p>
            L&apos;application est hébergée sur un serveur interne de l&apos;Organisation.
            Aucune donnée n&apos;est transmise à des serveurs externes, à l&apos;exception de
            l&apos;envoi du code OTP via le service SMTP configuré par l&apos;Organisation
            (par défaut : Gmail).
          </p>

          <h2 className="text-lg font-semibold text-slate-900">4. Propriété intellectuelle</h2>
          <p>
            SSPR est un logiciel open source. Le code source est disponible sur GitHub.
            L&apos;interface utilise des composants ShadCN UI et des icônes Lucide (licence MIT).
          </p>

          <h2 className="text-lg font-semibold text-slate-900">5. Contact</h2>
          <p>
            Pour toute question relative à ce service, contactez votre administrateur réseau
            ou le service informatique de votre Organisation.
          </p>
        </section>

        <div className="border-t border-slate-200 pt-4">
          <Link
            href="/politique-confidentialite"
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Politique de confidentialité
          </Link>
        </div>
      </div>
    </main>
  );
}
