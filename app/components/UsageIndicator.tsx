"use client";

import { useUsage } from "../context/UsageContextProvider";
import { formatTimeRemaining } from "../lib/usage";

export default function UsageIndicator() {
  const { secondsRemaining, tier, isTimeExpired } = useUsage();

  if (tier === "PRO") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
          Unlimited
        </span>
      </div>
    );
  }

  if (isTimeExpired) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs font-medium text-red-600 dark:text-red-400">
          Time expired
        </span>
      </div>
    );
  }

  const remaining = secondsRemaining ?? 0;
  const isLow = remaining < 5 * 60; // less than 5 minutes

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
        isLow
          ? "bg-amber-500/10 border-amber-500/20"
          : "bg-emerald-500/10 border-emerald-500/20"
      }`}
    >
      <div
        className={`w-2 h-2 rounded-full ${
          isLow ? "bg-amber-500" : "bg-emerald-500"
        }`}
      />
      <span
        className={`text-xs font-medium ${
          isLow
            ? "text-amber-600 dark:text-amber-400"
            : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {formatTimeRemaining(remaining)} remaining
      </span>
    </div>
  );
}
