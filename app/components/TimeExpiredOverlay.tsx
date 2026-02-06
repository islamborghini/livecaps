"use client";

import { useUsage } from "../context/UsageContextProvider";

export default function TimeExpiredOverlay() {
  const { isTimeExpired, tier } = useUsage();

  if (!isTimeExpired) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm rounded-2xl">
      <div className="text-center p-8 max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Daily limit reached
        </h3>
        <p className="text-gray-300 text-sm">
          You&apos;ve used all your {tier === "FREE" ? "20 minutes" : "3 hours"}{" "}
          for today. Your limit resets at midnight UTC.
        </p>
        <p className="text-gray-400 text-xs mt-3">
          Upgrade your plan for more time.
        </p>
      </div>
    </div>
  );
}
