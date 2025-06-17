/**
 * Landing Page Component
 * 
 * Beautiful landing page for LiveCaps - Real-time Speech Transcription & Translation.
 * Modern, conversion-focused design that introduces users to the application
 * and guides them to the main functionality.
 * 
 * Features:
 * - Hero section with compelling value proposition
 * - Feature highlights with visual elements
 * - Call-to-action button leading to the app
 * - Responsive design matching the app's aesthetic
 * - Gradient backgrounds and modern typography
 */
"use client";

import Link from "next/link";
import Footer from "./components/Footer";

const Home = () => {
  return (
    <div className="min-h-screen bg-[#0b0b0c] text-white">
      {/* Header */}
      <header className="relative z-10">
        <div className="bg-gradient-to-b from-black/50 to-black/10 backdrop-blur-[2px] h-[4rem] flex items-center">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold">LiveCaps</h1>
            <Link 
              href="/app" 
              className="text-sm font-medium hover:opacity-80 transition-opacity"
            >
              Launch App
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#13ef9335] via-transparent to-[#149afb35] pointer-events-none" />
        
        <div className="relative z-10 mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          {/* Hero Content */}
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-center pt-6 md:pt-8">
            <div className="max-w-4xl mx-auto">
              {/* Main Headline */}
              <h1 className="hero-title text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in-up">
                <span className="bg-gradient-to-r from-[#13ef93] to-[#149afb] bg-clip-text text-transparent animate-gradient">
                  Real-time Speech
                </span>
                <br />
                <span className="text-white">
                  Transcription & Translation
                </span>
              </h1>

              {/* Subtitle */}
              <p className="hero-subtitle text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed max-w-3xl mx-auto animate-fade-in-up" style={{animationDelay: '0.2s'}}>
                Transform your voice into text and translate it instantly to multiple languages. 
                Perfect for meetings, interviews, lectures, and global communication.
              </p>

              {/* CTA Button */}
              <Link 
                href="/app"
                className="hero-button inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-black bg-gradient-to-r from-[#13ef93] to-[#149afb] rounded-xl hover:opacity-90 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl animate-fade-in-up"
                style={{animationDelay: '0.4s'}}
              >
                Start Transcribing Now
                <svg 
                  className="ml-2 h-5 w-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </Link>

              {/* Features Preview */}
              <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                {/* Feature 1 */}
                <div className="feature-card bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300 animate-fade-in-up" style={{animationDelay: '0.6s'}}>
                  <div className="w-12 h-12 bg-gradient-to-r from-[#13ef93] to-[#149afb] rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Real-time Transcription</h3>
                  <p className="text-gray-400">
                    Advanced AI-powered speech recognition that captures every word with high accuracy.
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="feature-card bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300 animate-fade-in-up" style={{animationDelay: '0.8s'}}>
                  <div className="w-12 h-12 bg-gradient-to-r from-[#13ef93] to-[#149afb] rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Multi-language Translation</h3>
                  <p className="text-gray-400">
                    Instant translation to Spanish, French, Japanese, Chinese, Korean, and more languages.
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="feature-card bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300 animate-fade-in-up" style={{animationDelay: '1.0s'}}>
                  <div className="w-12 h-12 bg-gradient-to-r from-[#13ef93] to-[#149afb] rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
                  <p className="text-gray-400">
                    Sentence-based processing with smart context awareness for accurate translations.
                  </p>
                </div>
              </div>

              {/* Secondary CTA */}
              <div className="mt-12 text-center">
                <p className="text-gray-400 mb-4">
                  No signup required • Works in your browser • Powered by Deepgram & DeepL
                </p>
                <Link 
                  href="/app"
                  className="text-[#13ef93] hover:text-[#149afb] font-medium transition-colors"
                >
                  Try it now →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Home;
