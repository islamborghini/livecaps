/**
 * Dark Mode Debug Component
 * 
 * A temporary debugging component to check dark mode state
 */
"use client";

import React from "react";
import { useDarkMode } from "../context/DarkModeContextProvider";

const DarkModeDebug: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900 p-4 rounded-lg shadow-lg z-50">
      <div className="text-sm">
        <p><strong>Debug Info:</strong></p>
        <p>isDarkMode: {isDarkMode ? 'true' : 'false'}</p>
        <p>Document class: {typeof document !== 'undefined' ? document.documentElement.className : 'N/A'}</p>
        <button 
          onClick={toggleDarkMode}
          className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs"
        >
          Toggle (Debug)
        </button>
      </div>
    </div>
  );
};

export default DarkModeDebug;
