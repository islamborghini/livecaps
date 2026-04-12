/** Daily usage limits per tier, in seconds. */
export const TIER_LIMITS: Record<string, number> = {
  FREE: 20 * 60,       // 20 minutes
  PAID: 3 * 60 * 60,   // 3 hours
  PRO: Infinity,       // Unlimited
};

/** Returns today's date as "YYYY-MM-DD" in UTC, used as the key for daily usage records. */
export function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Formats a seconds-remaining value into a human-readable string.
 * Returns "Unlimited" for Infinity (PRO tier) and "0:00" when expired.
 */
export function formatTimeRemaining(seconds: number): string {
  if (!isFinite(seconds)) return "Unlimited";
  if (seconds <= 0) return "0:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m ${s}s`;
}
