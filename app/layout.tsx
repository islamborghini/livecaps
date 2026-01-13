/**
 * Root Layout Component
 *
 * Defines the root HTML structure and layout for the entire LiveCaps application.
 * Sets up global providers, fonts, and metadata configuration.
 *
 * Features:
 * - Configures custom ABCFavorit font and Inter Google font
 * - Provides global context providers for Deepgram and Microphone functionality
 * - Sets up responsive viewport and SEO metadata
 * - Defines consistent styling and theming across the application
 * - Wraps the entire app with necessary context providers for speech and audio handling
 */

import { Inter } from "next/font/google";
import classNames from "classnames";
import localFont from "next/font/local";

import { DeepgramContextProvider } from "./context/DeepgramContextProvider";
import { MultiDeepgramContextProvider } from "./context/MultiDeepgramContextProvider";
import { MicrophoneContextProvider } from "./context/MicrophoneContextProvider";
import { DarkModeContextProvider } from "./context/DarkModeContextProvider";

import "./globals.css";

import type { Metadata, Viewport } from "next";

const inter = Inter({ subsets: ["latin"] });
const favorit = localFont({
  src: "./fonts/ABCFavorit-Bold.woff2",
  variable: "--font-favorit",
});

export const viewport: Viewport = {
  themeColor: "#000000",
  initialScale: 1,
  width: "device-width",
  // maximumScale: 1, hitting accessability
};

export const metadata: Metadata = {
  metadataBase: new URL("https://aura-tts-demo.deepgram.com"),
  title: "LiveCaps",
  description: `Deepgram's AI Agent Demo shows just how fast Speech-to-Text and Text-to-Speech can be.`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-dvh">
      <body
        className={`h-full ${classNames(
          favorit.variable,
          inter.className
        )}`}
      >
        <DarkModeContextProvider>
          <MicrophoneContextProvider>
            <DeepgramContextProvider>
              <MultiDeepgramContextProvider>
                {children}
              </MultiDeepgramContextProvider>
            </DeepgramContextProvider>
          </MicrophoneContextProvider>
        </DarkModeContextProvider>
      </body>
    </html>
  );
}
