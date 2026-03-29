import { prisma } from "./prisma";

const RETENTION_HOURS = 24;

/**
 * Supprime les tokens expirés depuis plus de RETENTION_HOURS heures.
 * Appelé automatiquement au démarrage du serveur et toutes les heures.
 */
export async function purgeExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    console.log(
      `[SSPR] Purge : ${result.count} token(s) expiré(s) supprimé(s) (rétention : ${RETENTION_HOURS}h)`
    );
  }

  return result.count;
}

// Lancer la purge toutes les heures
if (typeof globalThis !== "undefined") {
  const PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 heure
  const key = "__sspr_purge_interval__";

  // Éviter les intervalles multiples en dev (hot-reload)
  if (!(globalThis as Record<string, unknown>)[key]) {
    (globalThis as Record<string, unknown>)[key] = setInterval(
      () => void purgeExpiredTokens(),
      PURGE_INTERVAL_MS
    );

    // Purge initiale au démarrage
    void purgeExpiredTokens();
  }
}
