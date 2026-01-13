/**
 * Transcription Mode Toggle Component
 *
 * UI control for switching between Single Language and Multi-Language Detection modes.
 * Shows current mode, active languages, and quota impact warnings.
 */

"use client";

import { TranscriptionMode } from "../types/multiDeepgram";

interface TranscriptionModeToggleProps {
  /** Current mode */
  mode: TranscriptionMode;

  /** Callback when mode changes */
  onModeChange: (mode: TranscriptionMode) => void;

  /** Currently selected spoken languages */
  spokenLanguages: string[];

  /** Whether connections are currently active (disable toggle during connection) */
  isConnected: boolean;

  /** Optional className for styling */
  className?: string;
}

export default function TranscriptionModeToggle({
  mode,
  onModeChange,
  spokenLanguages,
  isConnected,
  className = "",
}: TranscriptionModeToggleProps) {
  const isSingleMode = mode === "single";
  const isMultiMode = mode === "multi-detect";

  const handleToggle = () => {
    if (isConnected) {
      // Show warning if trying to switch during connection
      alert(
        "Please stop the current session before changing transcription mode."
      );
      return;
    }

    // Toggle mode
    const newMode: TranscriptionMode = isSingleMode ? "multi-detect" : "single";
    onModeChange(newMode);

    // Persist to localStorage
    try {
      localStorage.setItem("transcriptionMode", newMode);
    } catch (error) {
      console.warn("Failed to save mode to localStorage:", error);
    }
  };

  // Calculate quota multiplier
  const quotaMultiplier = isMultiMode ? spokenLanguages.length : 1;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Toggle Switch */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Transcription Mode:
        </span>

        <button
          onClick={handleToggle}
          disabled={isConnected}
          className={`
            relative inline-flex h-8 w-64 items-center rounded-full
            transition-colors duration-200 ease-in-out
            ${isConnected ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            ${isSingleMode ? "bg-blue-600" : "bg-purple-600"}
          `}
          aria-label="Toggle transcription mode"
        >
          {/* Background labels */}
          <span
            className={`
              absolute left-2 text-xs font-medium transition-opacity
              ${isSingleMode ? "text-white opacity-100" : "text-white opacity-40"}
            `}
          >
            Single Language
          </span>
          <span
            className={`
              absolute right-2 text-xs font-medium transition-opacity
              ${isMultiMode ? "text-white opacity-100" : "text-white opacity-40"}
            `}
          >
            Multi-Detect
          </span>

          {/* Sliding indicator */}
          <span
            className={`
              inline-block h-6 w-6 transform rounded-full bg-white shadow-lg
              transition-transform duration-200 ease-in-out
              ${isSingleMode ? "translate-x-1" : "translate-x-56"}
            `}
          />
        </button>
      </div>

      {/* Mode Description */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {isSingleMode ? (
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400">🎤</span>
            <div>
              <strong>Single Language:</strong> Uses{" "}
              <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">
                {spokenLanguages[0] || "selected language"}
              </span>{" "}
              only. More accurate for single language speech.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <span className="text-purple-600 dark:text-purple-400">🌐</span>
            <div>
              <strong>Multi-Language Detection:</strong> Automatically detects which
              language is being spoken among{" "}
              <span className="font-mono bg-purple-100 dark:bg-purple-900 px-1 rounded">
                {spokenLanguages.join(", ")}
              </span>
              .
            </div>
          </div>
        )}
      </div>

      {/* Active Languages Badge */}
      {isMultiMode && spokenLanguages.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            Monitoring:
          </span>
          <div className="flex gap-1">
            {spokenLanguages.map((lang) => (
              <span
                key={lang}
                className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full font-mono"
              >
                {lang.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quota Warning */}
      {isMultiMode && spokenLanguages.length > 1 && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>
          <div className="text-xs text-yellow-800 dark:text-yellow-200">
            <strong>Quota Impact:</strong> Multi-language detection uses{" "}
            <strong>{quotaMultiplier}x</strong> API quota (
            {spokenLanguages.length} parallel connections). Your free tier will be
            consumed {quotaMultiplier}x faster.
          </div>
        </div>
      )}

      {/* Connection Warning */}
      {isConnected && (
        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
          Mode cannot be changed during active session. Stop recording first.
        </div>
      )}
    </div>
  );
}
