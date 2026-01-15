/**
 * LiveCaps Application Page
 * 
 * Main application page that houses the real-time speech transcription and translation functionality.
 * This is where users access the core features of LiveCaps after landing on the homepage.
 * 
 * Features:
 * - Real-time speech-to-text transcription using Deepgram
 * - Live translation to multiple target languages
 * - Smart sentence detection and paragraph formatting
 * - Audio visualization with microphone input levels
 * - Dual-panel layout showing original transcription and translated text
 */
"use client";

import App from "../components/App";
import Footer from "../components/Footer";
import DarkModeToggle from "../components/DarkModeToggle";
import Link from "next/link";

const LiveCapsApp = () => {
  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0D] flex flex-col transition-colors duration-200">
        {/* Subtle gradient background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0D9488]/5 via-transparent to-[#14B8A6]/5" />
        </div>

        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0D0D0D]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/[0.05] transition-colors duration-200">
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 group">
                <span className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-[#0D9488] dark:group-hover:text-[#5EEAD4] transition-colors">
                  LiveCaps
                </span>
              </Link>

              {/* Center - Status text */}
              <div className="hidden md:flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Real-time transcription & translation
                </span>
              </div>

              {/* Right - Dark Mode Toggle */}
              <div className="flex items-center gap-4">
                <DarkModeToggle />
                <Link
                  href="/"
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  ← Back
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Main App */}
        <main className="relative flex-1">
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-8">
            <App />
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
};

export default LiveCapsApp;
