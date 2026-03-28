"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, Mail, KeyRound, ShieldCheck, CheckCircle2,
  AlertCircle, Eye, EyeOff, RotateCcw, User,
} from "lucide-react";
import FindUsernameDialog from "@/components/find-username-dialog";

// ─── Schémas Zod ─────────────────────────────────────────────────────────────

const step1Schema = z.object({
  email: z.string().email("Adresse email invalide."),
  identifiant: z.string().min(1, "L'identifiant Windows est requis."),
});

const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "Le code doit contenir exactement 6 chiffres.")
    .regex(/^\d{6}$/, "Le code ne contient que des chiffres."),
});

const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Au moins 8 caractères requis.")
      .refine(
        (v) => [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length >= 3,
        { message: "Le mot de passe doit contenir des caractères d'au moins 3 catégories." }
      ),
    confirmPassword: z.string().min(1, "Confirmation requise."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

type Step1Values = z.infer<typeof step1Schema>;
type OtpValues = z.infer<typeof otpSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;
type Step = "email" | "otp" | "password" | "success";

function getPasswordStrength(v: string) {
  if (!v) return { score: 0, label: "", color: "" };
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[a-z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const map = [
    { label: "Très faible", color: "bg-red-500" },
    { label: "Très faible", color: "bg-red-500" },
    { label: "Faible", color: "bg-orange-500" },
    { label: "Moyen", color: "bg-yellow-500" },
    { label: "Fort", color: "bg-blue-500" },
    { label: "Très fort", color: "bg-green-500" },
  ];
  return { score, ...map[score] };
}

const STEPS = ["email", "otp", "password"] as const;
const STEP_LABELS = ["Identité", "Code OTP", "Mot de passe"];

export default function ResetForm() {
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const otpRef = useRef<HTMLInputElement | null>(null);

  const step1Form = useForm<Step1Values>({ resolver: zodResolver(step1Schema) });
  const otpForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema) });
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const newPwd = passwordForm.watch("newPassword", "");
  const strength = getPasswordStrength(newPwd);

  // ── Étape 1 ──────────────────────────────────────────────────────────────

  const handleStep1Submit = async (data: Step1Values) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, identifiant: data.identifiant }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Une erreur est survenue."); return; }
      setEmail(data.email);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch {
      setErrorMsg("Impossible de joindre le serveur. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 ──────────────────────────────────────────────────────────────

  const handleOtpSubmit = async (data: OtpValues) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: data.otp }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Code incorrect."); return; }
      setTokenId(json.tokenId);
      setStep("password");
    } catch {
      setErrorMsg("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 3 ──────────────────────────────────────────────────────────────

  const handlePasswordSubmit = async (data: PasswordValues) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/reset/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, newPassword: data.newPassword, confirmPassword: data.confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Erreur lors de la réinitialisation."); return; }
      setStep("success");
    } catch {
      setErrorMsg("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  const restart = () => {
    setStep("email"); setEmail(""); setTokenId(""); setErrorMsg("");
    step1Form.reset(); otpForm.reset(); passwordForm.reset();
  };

  const currentStepIndex = STEPS.indexOf(step as typeof STEPS[number]);

  return (
    <Card className="shadow-lg border-slate-200">

      {/* ── Indicateur d'étapes ── */}
      {step !== "success" && (
        <div className="px-6 pt-5">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s ? "bg-primary text-white"
                  : currentStepIndex > i ? "bg-green-500 text-white"
                  : "bg-slate-100 text-slate-400"
                }`}>
                  {currentStepIndex > i ? "✓" : i + 1}
                </div>
                {i < 2 && (
                  <div className={`h-0.5 flex-1 rounded-full transition-colors ${
                    currentStepIndex > i ? "bg-green-500" : "bg-slate-100"
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
            {STEP_LABELS.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
      )}

      {/* ── Étape 1 : Identité (email + identifiant) ── */}
      {step === "email" && (
        <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} noValidate>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Vérification d&apos;identité</CardTitle>
                <CardDescription>
                  Renseignez votre email et votre identifiant Windows.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Adresse email</Label>
              <Input
                id="email"
                type="email"
                placeholder="prenom.nom@entreprise.fr"
                autoComplete="email"
                disabled={loading}
                {...step1Form.register("email")}
                className={step1Form.formState.errors.email ? "border-destructive" : ""}
              />
              {step1Form.formState.errors.email && (
                <p className="text-sm text-destructive">{step1Form.formState.errors.email.message}</p>
              )}
            </div>

            {/* Identifiant Windows */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="identifiant" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Identifiant Windows
                </Label>
                <FindUsernameDialog />
              </div>
              <Input
                id="identifiant"
                type="text"
                placeholder="ex. prenom.nom ou jdupont"
                autoComplete="username"
                disabled={loading}
                {...step1Form.register("identifiant")}
                className={step1Form.formState.errors.identifiant ? "border-destructive" : ""}
              />
              {step1Form.formState.errors.identifiant && (
                <p className="text-sm text-destructive">{step1Form.formState.errors.identifiant.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Votre nom de connexion Windows (ex.&nbsp;: ce que vous tapez sur l&apos;écran de verrouillage).
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</>
                : "Recevoir le code de vérification"}
            </Button>
          </CardFooter>
        </form>
      )}

      {/* ── Étape 2 : OTP ── */}
      {step === "otp" && (
        <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)} noValidate>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Code de vérification</CardTitle>
                <CardDescription>
                  Un code a été envoyé à <span className="font-medium text-foreground">{email}</span>.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="otp">Code à 6 chiffres</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                disabled={loading}
                className={`text-center text-2xl font-mono tracking-[0.5em] ${otpForm.formState.errors.otp ? "border-destructive" : ""}`}
                {...otpForm.register("otp")}
                ref={(el) => { otpForm.register("otp").ref(el); otpRef.current = el; }}
              />
              {otpForm.formState.errors.otp && (
                <p className="text-sm text-destructive">{otpForm.formState.errors.otp.message}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Le code est valable <strong>15 minutes</strong>. Vérifiez vos spams si nécessaire.
            </p>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</>
                : "Valider le code"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={restart} className="text-muted-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Recommencer
            </Button>
          </CardFooter>
        </form>
      )}

      {/* ── Étape 3 : Nouveau mot de passe ── */}
      {step === "password" && (
        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} noValidate>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Nouveau mot de passe</CardTitle>
                <CardDescription>Choisissez un mot de passe sécurisé pour votre compte AD.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Entrez votre nouveau mot de passe"
                  disabled={loading}
                  className={`pr-10 ${passwordForm.formState.errors.newPassword ? "border-destructive" : ""}`}
                  {...passwordForm.register("newPassword")}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNew ? "Masquer" : "Afficher"}>
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPwd.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.color : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Force : <span className="font-medium">{strength.label}</span></p>
                </div>
              )}
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirmez votre mot de passe"
                  disabled={loading}
                  className={`pr-10 ${passwordForm.formState.errors.confirmPassword ? "border-destructive" : ""}`}
                  {...passwordForm.register("confirmPassword")}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? "Masquer" : "Afficher"}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Politique AD :</p>
              <ul className="space-y-0.5">
                {[
                  { check: newPwd.length >= 8, label: "Au moins 8 caractères" },
                  { check: /[A-Z]/.test(newPwd), label: "Au moins une majuscule" },
                  { check: /[a-z]/.test(newPwd), label: "Au moins une minuscule" },
                  { check: /[0-9]/.test(newPwd), label: "Au moins un chiffre" },
                  { check: /[^A-Za-z0-9]/.test(newPwd), label: "Au moins un caractère spécial" },
                ].map(({ check, label }) => (
                  <li key={label} className={`flex items-center gap-1.5 ${check && newPwd ? "text-green-700" : ""}`}>
                    <span>{check && newPwd ? "✓" : "○"}</span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Réinitialisation en cours…</>
                : "Réinitialiser le mot de passe"}
            </Button>
          </CardFooter>
        </form>
      )}

      {/* ── Étape 4 : Succès ── */}
      {step === "success" && (
        <>
          <CardContent className="pt-8 pb-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">Mot de passe réinitialisé !</h2>
                <p className="text-sm text-slate-500">
                  Votre mot de passe Active Directory a été modifié avec succès.
                  Vous pouvez maintenant vous connecter à vos postes et services.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button className="w-full" onClick={() => window.location.href = "/"}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Retour à l&apos;accueil
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={restart}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Nouvelle réinitialisation
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
