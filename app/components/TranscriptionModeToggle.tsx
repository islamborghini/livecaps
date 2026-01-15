/**
 * Transcription Mode Toggle Component
 *
 * UI control for switching between Single Language and Multi-Language Detection modes.
 * Uses shadcn/ui-inspired styling with modern, clean design.
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
      alert(
        "Please stop the current session before changing transcription mode."
      );
      return;
    }

    const newMode: TranscriptionMode = isSingleMode ? "multi-detect" : "single";
    onModeChange(newMode);

    try {
      localStorage.setItem("transcriptionMode", newMode);
    } catch (error) {
      console.warn("Failed to save mode to localStorage:", error);
    }
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Toggle Switch - shadcn/ui style segmented control */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Mode:
        </span>

        <div className="inline-flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => !isConnected && onModeChange("single")}
            disabled={isConnected}
            className={`
              relative px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
              ${isConnected ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
              ${isSingleMode 
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600" 
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }
            `}
          >
            Single
          </button>
          <button
            onClick={() => !isConnected && onModeChange("multi-detect")}
            disabled={isConnected}
            className={`
              relative px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
              ${isConnected ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
              ${isMultiMode 
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600" 
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }
            `}
          >
            Multi-Detect
          </button>
        </div>
      </div>

      {/* Mode Description */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {isSingleMode ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>
              Using <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">{spokenLanguages[0]?.toUpperCase() || "EN"}</span> only
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-teal-500" />
            <span>Auto-detecting multiple languages</span>
          </div>
        )}
      </div>

      {/* Active Languages Badge */}
      {isMultiMode && spokenLanguages.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Monitoring:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {spokenLanguages.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-md border border-teal-200 dark:border-teal-800"
              >
                {lang.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connection Warning */}
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Stop recording to change mode</span>
        </div>
      )}
    </div>
  );
}
