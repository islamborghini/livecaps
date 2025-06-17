/**
 * Dark Mode Context Provider
 * 
 * Provides dark mode functionality throughout the application.
 * Manages dark mode state and persists user preference in localStorage.
 * 
 * Features:
 * - Toggle between light and dark modes
 * - Persists user preference in localStorage
 * - Applies/removes 'dark' class to document element
 * - Provides context for dark mode state and toggle function
 */
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export const useDarkMode = (): DarkModeContextType => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error("useDarkMode must be used within a DarkModeContextProvider");
  }
  return context;
};

interface DarkModeContextProviderProps {
  children: React.ReactNode;
}

export const DarkModeContextProvider: React.FC<DarkModeContextProviderProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Initialize dark mode from localStorage on client-side
  useEffect(() => {
    setMounted(true);
    
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('darkMode');
      
      let initialDarkMode = false;
      
      if (savedDarkMode !== null) {
        // Use saved preference
        initialDarkMode = JSON.parse(savedDarkMode);
      } else {
        // Fall back to system preference
        initialDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      
      setIsDarkMode(initialDarkMode);
      
      // Apply dark mode class to document
      if (initialDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', JSON.stringify(newDarkMode));
      
      // Apply/remove dark mode class
      if (newDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const value: DarkModeContextType = {
    isDarkMode,
    toggleDarkMode,
  };

  // Always render, but use mounted state to prevent hydration mismatch
  return (
    <DarkModeContext.Provider value={value}>
      {children}
    </DarkModeContext.Provider>
  );
};
