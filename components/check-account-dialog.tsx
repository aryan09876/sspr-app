"use client";

import { useState } from "react";
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
import {
  CheckCircle2,
  XCircle,
  Loader2,
  UserSearch,
  AlertCircle,
  User,
} from "lucide-react";
import FindUsernameDialog from "@/components/find-username-dialog";

const schema = z.object({
  email: z.string().email("Adresse email invalide."),
  identifiant: z.string().min(1, "L'identifiant Windows est requis."),
});
type FormValues = z.infer<typeof schema>;

type Result =
  | { status: "found" }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

export default function CheckAccountDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { reset(); setResult(null); }
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, identifiant: data.identifiant }),
      });
      const json = await res.json();

      if (res.ok && json.found) {
        setResult({ status: "found" });
      } else {
        setResult({ status: res.status >= 500 ? "error" : "not_found", message: json.error ?? "Compte introuvable." });
      }
    } catch {
      setResult({ status: "error", message: "Impossible de joindre le serveur." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-slate-600 border-slate-300">
          <UserSearch className="h-4 w-4" />
          Vérifier un compte AD
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserSearch className="h-5 w-5 text-primary" />
            Vérifier un compte Active Directory
          </DialogTitle>
          <DialogDescription>
            Saisissez l&apos;email et l&apos;identifiant Windows pour confirmer qu&apos;un compte AD existe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="check-email">Adresse email</Label>
            <Input
              id="check-email"
              type="email"
              placeholder="prenom.nom@entreprise.fr"
              autoComplete="off"
              disabled={loading}
              {...register("email")}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Identifiant Windows */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="check-identifiant" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Identifiant Windows
              </Label>
              <FindUsernameDialog />
            </div>
            <Input
              id="check-identifiant"
              type="text"
              placeholder="ex. prenom.nom ou jdupont"
              autoComplete="off"
              disabled={loading}
              {...register("identifiant")}
              className={errors.identifiant ? "border-destructive" : ""}
            />
            {errors.identifiant && (
              <p className="text-sm text-destructive">{errors.identifiant.message}</p>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vérification…</>
              : "Vérifier"}
          </Button>
        </form>

        {/* Résultat */}
        {result && (
          <div className="mt-2">
            {result.status === "found" && (
              <Alert className="border-green-300 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <p className="font-semibold">Compte vérifié</p>
                  <p className="text-xs mt-0.5 text-green-700">
                    L&apos;email et l&apos;identifiant Windows correspondent bien à un compte Active Directory.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {result.status === "not_found" && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-800">
                  <p className="font-semibold">Compte introuvable</p>
                  <p className="text-xs mt-0.5 text-red-700">{result.message}</p>
                </AlertDescription>
              </Alert>
            )}

            {result.status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
