"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContextProvider";
import DarkModeToggle from "../components/DarkModeToggle";

type Profile = {
  id: string;
  email: string;
  name: string;
  tier: "FREE" | "PAID" | "PRO";
  createdAt: string;
  totalSecondsUsed: number;
  totalSessions: number;
};

type Session = {
  id: string;
  durationSeconds: number;
  spokenLanguages: string[];
  displayLanguages: string[];
  createdAt: string;
  endedAt: string | null;
};

const TIER_COLORS: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700",
  PAID: "bg-[#0D9488]/10 text-[#0D9488] dark:text-[#5EEAD4] border-[#0D9488]/20",
  PRO: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20",
};

const TIER_INFO: Record<string, { name: string; limit: string; price: string }> = {
  FREE: { name: "Free", limit: "20 min/day", price: "Free" },
  PAID: { name: "Paid", limit: "3 hours/day", price: "$9.90/mo" },
  PRO: { name: "Pro", limit: "Unlimited", price: "$29.90/mo" },
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  hi: "Hindi", ru: "Russian", pt: "Portuguese", ja: "Japanese",
  it: "Italian", nl: "Dutch", ko: "Korean", zh: "Chinese",
  ar: "Arabic", tr: "Turkish", pl: "Polish", sv: "Swedish",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "sessions" | "settings">("overview");

  // Settings form state
  const [editName, setEditName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);

  // Upgrade state
  const [upgrading, setUpgrading] = useState(false);

  // URL params for Stripe redirect feedback
  const searchParams = useSearchParams();
  const [upgradeNotice, setUpgradeNotice] = useState("");

  useEffect(() => {
    const upgraded = searchParams.get("upgraded");
    const cancelled = searchParams.get("cancelled");
    if (upgraded) {
      setUpgradeNotice(`Successfully upgraded to ${upgraded.toUpperCase()}! Your plan is now active.`);
      // Clean URL
      window.history.replaceState({}, "", "/profile");
    } else if (cancelled) {
      setUpgradeNotice("");
      window.history.replaceState({}, "", "/profile");
    }
  }, [searchParams]);

  const fetchProfile = useCallback(async () => {
    try {
      const [profileRes, sessionsRes] = await Promise.all([
        fetch("/api/auth/profile"),
        fetch("/api/sessions"),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.user);
        setEditName(data.user.name);
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsMsg("");
    setSettingsError("");
    setSaving(true);

    try {
      const body: Record<string, string> = {};
      if (editName !== profile?.name) body.name = editName;
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      if (Object.keys(body).length === 0) {
        setSettingsError("Nothing to update");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSettingsMsg("Profile updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      fetchProfile();
    } catch (err: any) {
      setSettingsError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async (tier: "PAID" | "PRO") => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      alert(err.message);
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      alert(err.message);
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0D] flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0D] transition-colors duration-200">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0D9488]/5 via-transparent to-[#14B8A6]/5" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0D0D0D]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/[0.05] transition-colors duration-200">
        <div className="mx-auto max-w-4xl px-4 md:px-6">
          <div className="flex h-16 items-center justify-between">
            <Link href="/app" className="flex items-center gap-2 group">
              <svg className="w-5 h-5 text-gray-400 group-hover:text-[#0D9488] transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-[#0D9488] dark:group-hover:text-[#5EEAD4] transition-colors">
                LiveCaps
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <DarkModeToggle />
              <button
                onClick={logout}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-4 md:px-6 py-8">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0D9488] to-[#14B8A6] flex items-center justify-center text-white text-2xl font-bold">
            {profile?.name?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {profile?.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {profile?.email}
            </p>
          </div>
          <span className={`ml-auto px-3 py-1 text-sm font-medium rounded-full border ${TIER_COLORS[profile?.tier || "FREE"]}`}>
            {profile?.tier}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
          {(["overview", "sessions", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Upgrade success notice */}
            {upgradeNotice && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 text-sm font-medium flex items-center justify-between">
                <span>{upgradeNotice}</span>
                <button onClick={() => setUpgradeNotice("")} className="text-green-500 hover:text-green-700 dark:hover:text-green-300 ml-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Usage</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatDuration(profile?.totalSecondsUsed || 0)}
                </p>
              </div>
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sessions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile?.totalSessions || 0}
                </p>
              </div>
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Member Since</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {profile?.createdAt ? formatDate(profile.createdAt) : "—"}
                </p>
              </div>
            </div>

            {/* Current Plan */}
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Plan</h2>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {TIER_INFO[profile?.tier || "FREE"].name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {TIER_INFO[profile?.tier || "FREE"].limit} · {TIER_INFO[profile?.tier || "FREE"].price}
                  </p>
                </div>
              </div>

              {/* Upgrade options */}
              {profile?.tier !== "PRO" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {profile?.tier === "FREE" && (
                    <button
                      onClick={() => handleUpgrade("PAID")}
                      disabled={upgrading}
                      className="p-4 rounded-xl border-2 border-[#0D9488]/30 hover:border-[#0D9488] bg-[#0D9488]/5 transition-all text-left group disabled:opacity-50"
                    >
                      <p className="font-semibold text-gray-900 dark:text-white group-hover:text-[#0D9488] dark:group-hover:text-[#5EEAD4] transition-colors">
                        Upgrade to Paid
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        3 hours/day · $9.90/mo
                      </p>
                    </button>
                  )}
                  <button
                    onClick={() => handleUpgrade("PRO")}
                    disabled={upgrading}
                    className="p-4 rounded-xl border-2 border-purple-300 dark:border-purple-500/30 hover:border-purple-500 bg-purple-50 dark:bg-purple-500/5 transition-all text-left group disabled:opacity-50"
                  >
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      Upgrade to Pro
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Unlimited · $29.90/mo
                    </p>
                  </button>
                </div>
              )}
              {profile?.tier === "PRO" && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#0D9488] dark:text-[#5EEAD4] font-medium">
                    You&apos;re on the highest plan with unlimited usage.
                  </p>
                  <button
                    onClick={handleManageBilling}
                    disabled={upgrading}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Manage Billing
                  </button>
                </div>
              )}

              {/* Manage billing for PAID users */}
              {profile?.tier === "PAID" && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/[0.08]">
                  <button
                    onClick={handleManageBilling}
                    disabled={upgrading}
                    className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                  >
                    Manage Billing &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
          <div>
            {sessions.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-lg mb-1">No sessions yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  Start a transcription session to see your history here.
                </p>
                <Link
                  href="/app"
                  className="inline-block mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white text-sm font-medium hover:from-[#0F766E] hover:to-[#0D9488] transition-all"
                >
                  Start Session
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-4 hover:border-[#0D9488]/30 dark:hover:border-[#5EEAD4]/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${session.endedAt ? "bg-gray-300 dark:bg-gray-600" : "bg-green-500 animate-pulse"}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatDate(session.createdAt)} at {formatTime(session.createdAt)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {session.spokenLanguages.length > 0 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                Spoken: {session.spokenLanguages.map(l => LANGUAGE_NAMES[l] || l).join(", ")}
                              </span>
                            )}
                            {session.displayLanguages.length > 0 && (
                              <>
                                <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  Translated: {session.displayLanguages.map(l => LANGUAGE_NAMES[l] || l).join(", ")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDuration(session.durationSeconds)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {session.endedAt ? "Completed" : "In progress"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Account Settings</h2>

            <form onSubmit={handleSaveSettings} className="space-y-5 max-w-md">
              {settingsMsg && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 text-sm">
                  {settingsMsg}
                </div>
              )}
              {settingsError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  {settingsError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02] text-gray-400 dark:text-gray-500 cursor-not-allowed"
                />
              </div>

              <hr className="border-gray-200 dark:border-white/[0.08]" />

              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Password</p>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent transition-colors"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent transition-colors"
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white font-medium hover:from-[#0F766E] hover:to-[#0D9488] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
