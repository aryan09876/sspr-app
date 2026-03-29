import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PolitiqueConfidentialite() {
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

        <h1 className="text-2xl font-bold text-slate-900">Politique de confidentialité</h1>

        <section className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <p>
            Cette politique de confidentialité décrit les données collectées par le portail
            {" "}{appName} et leur traitement, conformément au Règlement Général sur la Protection
            des Données (RGPD — Règlement UE 2016/679).
          </p>

          <h2 className="text-lg font-semibold text-slate-900">
            1. Données collectées
          </h2>
          <p>Le service collecte uniquement les données strictement nécessaires :</p>
          <table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2 font-medium">Donnée</th>
                <th className="text-left p-2 font-medium">Finalité</th>
                <th className="text-left p-2 font-medium">Conservation</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200">
                <td className="p-2">Adresse email</td>
                <td className="p-2">Identifier l&apos;utilisateur et envoyer le code OTP</td>
                <td className="p-2">24 heures après expiration du code</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="p-2">Identifiant Windows (sAMAccountName)</td>
                <td className="p-2">Vérifier la correspondance avec le compte AD</td>
                <td className="p-2">Non stocké (vérifié en temps réel)</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="p-2">DN Active Directory</td>
                <td className="p-2">Identifier le compte pour la réinitialisation</td>
                <td className="p-2">24 heures après expiration du code</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="p-2">Hash du code OTP (HMAC-SHA256)</td>
                <td className="p-2">Vérifier le code saisi par l&apos;utilisateur</td>
                <td className="p-2">24 heures après expiration du code</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="p-2">Adresse IP</td>
                <td className="p-2">Protection contre les abus (rate limiting)</td>
                <td className="p-2">24 heures après expiration du code</td>
              </tr>
            </tbody>
          </table>

          <h2 className="text-lg font-semibold text-slate-900">
            2. Données NON collectées
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Le mot de passe de l&apos;utilisateur (ancien ou nouveau) n&apos;est <strong>jamais</strong> stocké</li>
            <li>Le code OTP en clair n&apos;est <strong>jamais</strong> stocké (uniquement son empreinte cryptographique)</li>
            <li>Aucun cookie de suivi ou publicitaire</li>
            <li>Aucune donnée de navigation, de localisation ou de profilage</li>
            <li>Aucune donnée transmise à des tiers (sauf le service SMTP pour l&apos;envoi d&apos;email)</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-900">
            3. Base légale du traitement
          </h2>
          <p>
            Le traitement est fondé sur l&apos;<strong>intérêt légitime</strong> de l&apos;Organisation
            (article 6.1.f du RGPD) : permettre à ses collaborateurs de gérer de manière autonome
            l&apos;accès à leur compte professionnel, tout en garantissant la sécurité du système
            d&apos;information.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">
            4. Durée de conservation
          </h2>
          <p>
            Les données liées aux demandes de réinitialisation sont <strong>automatiquement
            supprimées 24 heures</strong> après l&apos;expiration du code OTP. Une purge automatique
            s&apos;exécute toutes les heures sur le serveur.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">
            5. Sécurité des données
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Communications chiffrées en TLS (HTTPS pour le navigateur, LDAPS pour l&apos;AD)</li>
            <li>Codes OTP hachés avec HMAC-SHA256 (irréversible)</li>
            <li>Comparaison résistante aux attaques temporelles (timing-safe)</li>
            <li>Limitation du nombre de tentatives (5 max par code, rate limiting par IP et email)</li>
            <li>Protection CSRF sur toutes les requêtes</li>
            <li>Application accessible uniquement depuis le réseau interne</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-900">
            6. Droits des utilisateurs
          </h2>
          <p>
            Conformément au RGPD, vous disposez des droits suivants concernant vos données :
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Droit d&apos;accès :</strong> savoir quelles données sont traitées</li>
            <li><strong>Droit de rectification :</strong> corriger des données inexactes</li>
            <li><strong>Droit à l&apos;effacement :</strong> demander la suppression de vos données</li>
            <li><strong>Droit à la limitation :</strong> limiter le traitement de vos données</li>
          </ul>
          <p>
            Pour exercer ces droits, contactez votre administrateur réseau ou le service
            informatique de votre Organisation. Les données étant automatiquement purgées
            après 24 heures, la plupart des demandes d&apos;effacement sont satisfaites
            automatiquement.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">
            7. Cookies et stockage local
          </h2>
          <p>
            Ce site n&apos;utilise <strong>aucun cookie</strong>. Un unique élément de stockage local
            (<code>localStorage</code>) est utilisé pour mémoriser votre acceptation de cette
            politique. Il ne contient aucune donnée personnelle.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">
            8. Transfert de données
          </h2>
          <p>
            Aucune donnée personnelle n&apos;est transférée en dehors de l&apos;infrastructure
            de l&apos;Organisation, à l&apos;exception de l&apos;adresse email destinataire
            transmise au service SMTP pour l&apos;envoi du code OTP. Le choix du fournisseur
            SMTP relève de la responsabilité de l&apos;Organisation.
          </p>
        </section>

        <div className="border-t border-slate-200 pt-4">
          <Link
            href="/mentions-legales"
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Mentions légales
          </Link>
        </div>
      </div>
    </main>
  );
}
