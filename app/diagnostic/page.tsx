"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckResult {
  ok: boolean;
  detail: string;
}

interface DiagnosticResult {
  status: "ok" | "error";
  checks: {
    config: CheckResult;
    database: CheckResult;
    ldap: CheckResult;
    smtp: CheckResult;
  };
}

const CHECK_LABELS: Record<string, string> = {
  config: "Variables d'environnement",
  database: "Base de données (SQLite)",
  ldap: "Active Directory (LDAPS)",
  smtp: "Serveur email (SMTP)",
};

function StatusIcon({ ok, loading }: { ok?: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
  if (ok === true) return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (ok === false) return <XCircle className="h-5 w-5 text-red-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-slate-300" />;
}

export default function DiagnosticPage() {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnostic() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/diagnostic");
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const data = await res.json() as DiagnosticResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const checks = result
    ? (["config", "database", "ldap", "smtp"] as const).map((key) => ({
        key,
        label: CHECK_LABELS[key],
        ...result.checks[key],
      }))
    : [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>

        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700 shadow">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Diagnostic système</h1>
            <p className="text-xs text-slate-500">Vérifie la configuration et les connexions</p>
          </div>
        </div>

        {/* Carte principale */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="p-6 space-y-4">
            <Button
              onClick={runDiagnostic}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Diagnostic en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Lancer le diagnostic
                </>
              )}
            </Button>

            {/* Résultats */}
            {(result || loading) && (
              <div className="space-y-2 pt-2">
                {loading && !result
                  ? (["config", "database", "ldap", "smtp"] as const).map((key) => (
                      <div
                        key={key}
                        className="flex items-center gap-3 p-3 rounded-md bg-slate-50 border border-slate-200"
                      >
                        <StatusIcon loading />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{CHECK_LABELS[key]}</p>
                          <p className="text-xs text-slate-400">Vérification en cours...</p>
                        </div>
                      </div>
                    ))
                  : checks.map(({ key, label, ok, detail }) => (
                      <div
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-md border ${
                          ok
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <div className="mt-0.5">
                          <StatusIcon ok={ok} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{label}</p>
                          <p className={`text-xs mt-0.5 break-words ${ok ? "text-green-700" : "text-red-700"}`}>
                            {detail}
                          </p>
                        </div>
                      </div>
                    ))}
              </div>
            )}

            {/* Statut global */}
            {result && (
              <div
                className={`rounded-md p-3 text-sm font-medium text-center ${
                  result.status === "ok"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {result.status === "ok"
                  ? "Tous les systèmes sont opérationnels"
                  : "Des problèmes ont été détectés — consultez les détails ci-dessus"}
              </div>
            )}

            {/* Erreur fetch */}
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                Impossible de contacter le serveur : {error}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Cette page est réservée aux administrateurs système.
        </p>
      </div>
    </main>
  );
}
