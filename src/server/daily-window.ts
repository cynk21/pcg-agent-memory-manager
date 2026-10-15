// Zeitfenster für den Daily-Lauf. Alle Quellen nutzen dieselbe Obergrenze.
// Dailies betrachten höchstens die letzten 3 Tage; längere Zeiträume gehören in Weekly/Monthly.
export const DAILY_LOOKBACK_DAYS = 3;

/** Gmail-Suchfilter, z. B. "newer_than:3d". */
export const DAILY_GMAIL_NEWER_THAN = `newer_than:${DAILY_LOOKBACK_DAYS}d`;

/** Epoch-Grenze für Quellen mit Unix-Zeitstempel (Sekunden). */
export function dailyCutoffUnix(now: number = Date.now()): number {
  return Math.floor((now - DAILY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);
}

/** Datumsgrenze (Date) für Quellen mit Date-Objekten. */
export function dailyCutoffDate(now: number = Date.now()): Date {
  return new Date(now - DAILY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}
