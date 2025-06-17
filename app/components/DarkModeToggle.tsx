/**
 * Dark Mode Toggle Component
 * 
 * A toggle switch component for switching between light and dark modes.
 * Features a smooth animation and uses system theme icons.
 * 
 * Features:
 * - Smooth sliding animation
 * - Sun and moon icons for visual feedback
 * - Accessible button with proper ARIA labels
 * - Responsive design that works in various contexts
 */
"use client";

import React from "react";
import { useDarkMode } from "../context/DarkModeContextProvider";

const DarkModeToggle: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <button
      onClick={toggleDarkMode}
      className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      role="switch"
      aria-checked={isDarkMode}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Toggle Circle */}
      <span
        className={`${
          isDarkMode ? 'translate-x-7' : 'translate-x-1'
        } inline-block h-6 w-6 transform rounded-full bg-white dark:bg-gray-200 transition-transform duration-200 shadow-lg`}
      >
        {/* Sun Icon (Light Mode) */}
        <svg
          className={`${
            isDarkMode ? 'opacity-0' : 'opacity-100'
          } absolute inset-0 h-6 w-6 p-1 text-yellow-500 transition-opacity duration-200`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>

        {/* Moon Icon (Dark Mode) */}
        <svg
          className={`${
            isDarkMode ? 'opacity-100' : 'opacity-0'
          } absolute inset-0 h-6 w-6 p-1 text-slate-700 transition-opacity duration-200`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </span>
    </button>
  );
};

export default DarkModeToggle;
