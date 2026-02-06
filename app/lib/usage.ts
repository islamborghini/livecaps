export const TIER_LIMITS: Record<string, number> = {
  FREE: 20 * 60,       // 20 minutes in seconds
  PAID: 3 * 60 * 60,   // 3 hours in seconds
  PRO: Infinity,       // Unlimited
};

export function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

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
