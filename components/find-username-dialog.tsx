"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, User, AlertCircle, HelpCircle, RotateCcw } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Adresse email invalide."),
});
const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "Le code doit contenir exactement 6 chiffres.")
    .regex(/^\d{6}$/, "Le code ne contient que des chiffres."),
});

type EmailValues = z.infer<typeof emailSchema>;
type OtpValues = z.infer<typeof otpSchema>;
type Step = "email" | "otp" | "result";

export default function FindUsernameDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const otpRef = useRef<HTMLInputElement | null>(null);

  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema) });
  const otpForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema) });

  const reset = () => {
    setStep("email");
    setEmail("");
    setUsername(null);
    setErrorMsg("");
    emailForm.reset();
    otpForm.reset();
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  // Étape 1 — envoyer l'OTP
  const onEmailSubmit = async (data: EmailValues) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/find-username/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Erreur serveur."); return; }
      setEmail(data.email);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch {
      setErrorMsg("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  // Étape 2 — vérifier l'OTP et récupérer le username
  const onOtpSubmit = async (data: OtpValues) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/find-username/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: data.otp }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Code incorrect."); return; }
      setUsername(json.username ?? null);
      setStep("result");
    } catch {
      setErrorMsg("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
        >
          <HelpCircle className="h-3 w-3" />
          Trouver mon identifiant
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Trouver mon identifiant Windows
          </DialogTitle>
          <DialogDescription>
            {step === "email" && "Entrez votre email professionnel pour recevoir un code de vérification."}
            {step === "otp" && <>Code envoyé à <span className="font-medium text-foreground">{email}</span>. Saisissez-le ci-dessous.</>}
            {step === "result" && "Votre identifiant Windows a été retrouvé."}
          </DialogDescription>
        </DialogHeader>

        {/* Étape 1 — Email */}
        {step === "email" && (
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fu-email">Adresse email</Label>
              <Input
                id="fu-email"
                type="email"
                placeholder="prenom.nom@entreprise.fr"
                autoComplete="off"
                disabled={loading}
                {...emailForm.register("email")}
                className={emailForm.formState.errors.email ? "border-destructive" : ""}
              />
              {emailForm.formState.errors.email && (
                <p className="text-sm text-destructive">{emailForm.formState.errors.email.message}</p>
              )}
            </div>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Envoi du code…</>
                : "Recevoir le code"}
            </Button>
          </form>
        )}

        {/* Étape 2 — OTP */}
        {step === "otp" && (
          <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fu-otp">Code à 6 chiffres</Label>
              <Input
                id="fu-otp"
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
              <p className="text-xs text-muted-foreground">Le code est valable <strong>15 minutes</strong>. Vérifiez vos spams si nécessaire.</p>
            </div>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</>
                : "Valider le code"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset} className="w-full text-muted-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Recommencer
            </Button>
          </form>
        )}

        {/* Étape 3 — Résultat */}
        {step === "result" && username && (
          <div className="space-y-4">
            <div className="rounded-md border bg-slate-50 p-4 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Votre identifiant Windows</p>
              <p className="text-2xl font-bold font-mono text-slate-900 tracking-wide">{username}</p>
              <p className="text-xs text-muted-foreground">Utilisez ce nom pour vous connecter à vos postes Windows.</p>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="w-full text-muted-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Nouvelle recherche
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
