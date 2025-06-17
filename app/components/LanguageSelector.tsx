/**
 * Language Selector Component
 * 
 * Dropdown component for selecting target translation languages.
 * Provides a user-friendly interface to choose from supported languages
 * for real-time translation of transcribed speech.
 * 
 * Features:
 * - Dropdown interface with native language names
 * - Support for multiple languages (Spanish, French, Japanese, Korean, Chinese, Russian)
 * - Clean, accessible UI with hover states
 * - Language code and display name management
 * - Callback system for language selection events
 * - Responsive design with proper styling
 */
"use client";

import React, { useState } from 'react';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export const languages: Language[] = [
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
];

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onLanguageChange: (language: Language) => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  selectedLanguage, 
  onLanguageChange 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const selectLanguage = (language: Language) => {
    onLanguageChange(language);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleDropdown}
        className="inline-flex items-center justify-between w-48 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <span>{selectedLanguage.name} ({selectedLanguage.nativeName})</span>
        <svg
          className={`-mr-1 ml-2 h-5 w-5 transform transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute mt-2 w-full rounded-lg bg-white shadow-lg border border-gray-200 z-50">
          <ul
            className="py-1 max-h-60 overflow-auto rounded-lg text-base focus:outline-none sm:text-sm"
            tabIndex={-1}
            role="listbox"
          >
            {languages.map((language) => (
              <li
                key={language.code}
                onClick={() => selectLanguage(language)}
                className={`cursor-pointer select-none relative py-3 pl-4 pr-9 hover:bg-blue-50 transition-colors ${
                  selectedLanguage.code === language.code ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                }`}
              >
                <div className="flex items-center">
                  <span className="font-normal block truncate">
                    {language.name} ({language.nativeName})
                  </span>
                </div>
                
                {selectedLanguage.code === language.code && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;