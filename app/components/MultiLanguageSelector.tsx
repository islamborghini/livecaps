/**
 * Multi-Language Selector Component
 *
 * Allows users to select multiple spoken and display languages for the unified transcript.
 * Uses shadcn/ui-inspired styling with modern, clean design.
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
      {/* Trigger Button - shadcn/ui style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-[140px] shadow-sm"
      >
        <span className="text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
          {selectedLangNames}
        </span>
        <svg 
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
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

          {/* Dropdown - shadcn/ui style popover */}
          <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden animate-in fade-in-0 zoom-in-95">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                {type === "spoken" ? "Speaking Languages" : "Translate To"}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {type === "spoken"
                  ? "Select languages you'll speak"
                  : "Choose translation languages"}
              </p>
            </div>

            {/* Language List */}
            <div className="max-h-72 overflow-y-auto p-2">
              {supportedLanguages.map(lang => (
                <label
                  key={lang.code}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors group"
                >
                  {/* Custom Checkbox - shadcn/ui style */}
                  <div className={`
                    w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                    ${selectedLanguages.includes(lang.code)
                      ? 'bg-teal-500 border-teal-500'
                      : 'border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500'
                    }
                  `}>
                    {selectedLanguages.includes(lang.code) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.includes(lang.code)}
                    onChange={() => toggleLanguage(lang.code)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {lang.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {lang.nativeName}
                    </div>
                  </div>
                  {selectedLanguages.includes(lang.code) && (
                    <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">
                      Selected
                    </span>
                  )}
                </label>
              ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
              >
                Done ({selectedLanguages.length} selected)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
