import crypto from "crypto";

const OTP_EXPIRY_MINUTES = 15;
export const OTP_MAX_ATTEMPTS = 5;
export { OTP_EXPIRY_MINUTES };

/** Génère un OTP numérique à 6 chiffres, cryptographiquement sûr. */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Hashe un OTP via HMAC-SHA256 avec un secret applicatif. */
export function hashOtp(otp: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("[SSPR] OTP_SECRET manquant dans les variables d'environnement.");
  return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

/** Compare un OTP fourni à son hash en temps constant (prévient timing attacks). */
export function verifyOtp(otp: string, storedHash: string): boolean {
  const expected = hashOtp(otp);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}

/** Retourne la date d'expiration de l'OTP (maintenant + OTP_EXPIRY_MINUTES). */
export function getOtpExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}
