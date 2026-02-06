"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContextProvider";

type UsageContextType = {
  secondsRemaining: number | null; // null = unlimited (PRO)
  secondsUsedToday: number;
  dailyLimit: number | null; // null = unlimited
  isTimeExpired: boolean;
  tier: "FREE" | "PAID" | "PRO";
  isTimerRunning: boolean;
  startTimer: () => void;
  stopTimer: () => void;
  refreshUsage: () => Promise<void>;
};

const UsageContext = createContext<UsageContextType | undefined>(undefined);

const SYNC_INTERVAL_MS = 30_000; // 30 seconds

export function UsageContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [secondsUsedToday, setSecondsUsedToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [tier, setTier] = useState<"FREE" | "PAID" | "PRO">("FREE");
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const unsyncedSeconds = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTimeExpired =
    tier !== "PRO" && secondsRemaining !== null && secondsRemaining <= 0;

  // Fetch current usage from server
  const refreshUsage = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/usage/remaining");
      if (!res.ok) return;
      const data = await res.json();
      setSecondsUsedToday(data.secondsUsed);
      setSecondsRemaining(data.secondsRemaining);
      setDailyLimit(data.dailyLimit);
      setTier(data.tier);
    } catch {
      // silently fail
    }
  }, [user]);

  // Sync unsynced seconds to server
  const syncToServer = useCallback(async () => {
    if (unsyncedSeconds.current <= 0 || !user) return;

    const toSync = unsyncedSeconds.current;
    unsyncedSeconds.current = 0;

    try {
      const res = await fetch("/api/usage/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secondsUsed: toSync }),
      });
      if (res.ok) {
        const data = await res.json();
        setSecondsUsedToday(data.secondsUsed);
        setSecondsRemaining(data.secondsRemaining);
        setDailyLimit(data.dailyLimit);
        setTier(data.tier);
      }
    } catch {
      // Add back if sync failed
      unsyncedSeconds.current += toSync;
    }
  }, [user]);

  // Load initial usage when user logs in
  useEffect(() => {
    if (user) {
      refreshUsage();
    }
  }, [user, refreshUsage]);

  // 1-second timer to tick local state
  const startTimer = useCallback(() => {
    if (timerRef.current) return; // already running
    setIsTimerRunning(true);

    timerRef.current = setInterval(() => {
      unsyncedSeconds.current += 1;

      // Update local state optimistically
      setSecondsUsedToday((prev) => prev + 1);
      setSecondsRemaining((prev) => {
        if (prev === null) return null; // unlimited
        return Math.max(0, prev - 1);
      });
    }, 1000);

    // Start sync interval
    syncRef.current = setInterval(syncToServer, SYNC_INTERVAL_MS);
  }, [syncToServer]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (syncRef.current) {
      clearInterval(syncRef.current);
      syncRef.current = null;
    }
    setIsTimerRunning(false);

    // Sync remaining seconds immediately
    syncToServer();
  }, [syncToServer]);

  // Stop timer when time expires
  useEffect(() => {
    if (isTimeExpired && isTimerRunning) {
      stopTimer();
    }
  }, [isTimeExpired, isTimerRunning, stopTimer]);

  // sendBeacon on tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (unsyncedSeconds.current > 0) {
        const data = JSON.stringify({ secondsUsed: unsyncedSeconds.current });
        navigator.sendBeacon("/api/usage/sync", new Blob([data], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, []);

  return (
    <UsageContext.Provider
      value={{
        secondsRemaining,
        secondsUsedToday,
        dailyLimit,
        isTimeExpired,
        tier,
        isTimerRunning,
        startTimer,
        stopTimer,
        refreshUsage,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (!context) {
    throw new Error("useUsage must be used within UsageContextProvider");
  }
  return context;
}
