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

const LiveCapsApp = () => {
  return (
    <>
      <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col transition-colors duration-200">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200">
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between">
            <a href="/" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              LiveCaps
            </a>
            
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Real-time transcription & translation
            </div>
            
            {/* Dark Mode Toggle - Right */}
            <div className="flex items-center">
              <DarkModeToggle />
            </div>
          </div>
        </header>

        {/* Main App */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-800 transition-colors duration-200">
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
