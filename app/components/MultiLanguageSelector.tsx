/**
 * Multi-Language Selector Component
 *
 * Allows users to select multiple spoken and display languages for the unified transcript.
 */
"use client";

import { useState } from "react";

// Supported languages for multilingual code-switching
// Nova-2 supports 36 languages
export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
];

interface MultiLanguageSelectorProps {
  type: "spoken" | "display";
  selectedLanguages: string[];
  onChange: (languages: string[]) => void;
}

export default function MultiLanguageSelector({
  type,
  selectedLanguages,
  onChange,
}: MultiLanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleLanguage = (code: string) => {
    if (selectedLanguages.includes(code)) {
      // Remove language (but keep at least one)
      if (selectedLanguages.length > 1) {
        onChange(selectedLanguages.filter(lang => lang !== code));
      }
    } else {
      // Add language
      onChange([...selectedLanguages, code]);
    }
  };

  const selectedLangNames = selectedLanguages
    .map(code => supportedLanguages.find(l => l.code === code)?.name || code.toUpperCase())
    .join(", ");

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
      >
        <span className="text-gray-700 dark:text-gray-300">
          {type === "spoken" ? "🎤" : "🌐"} {selectedLangNames}
        </span>
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                Select {type === "spoken" ? "Spoken" : "Display"} Languages
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {type === "spoken"
                  ? "Languages you'll speak during the conversation"
                  : "Languages to translate into"}
              </p>
            </div>

            <div className="p-2">
              {supportedLanguages.map(lang => (
                <label
                  key={lang.code}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedLanguages.includes(lang.code)}
                    onChange={() => toggleLanguage(lang.code)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {lang.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {lang.nativeName}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
