/**
 * Rate limiter en mémoire (simple, suffisant pour un déploiement mono-instance).
 * Les compteurs sont réinitialisés au redémarrage du processus.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

/**
 * Vérifie si une clé a dépassé la limite autorisée dans la fenêtre de temps.
 * @returns true = autorisé, false = bloqué
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

// Nettoyage périodique pour éviter les fuites mémoire (toutes les 10 min)
setInterval(
  () => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now > entry.resetAt) store.delete(key);
    });
  },
  10 * 60 * 1000
);
