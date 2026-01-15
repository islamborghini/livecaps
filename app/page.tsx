/**
 * Landing Page Component - Linear-inspired Design
 *
 * Ultra-polished, modern landing page for LiveCaps with:
 * - Animated gradient mesh backgrounds
 * - Glassmorphism effects
 * - Smooth scroll animations
 * - Interactive micro-interactions
 * - Bento-box feature grid
 */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Footer from "./components/Footer";
import DarkModeToggle from "./components/DarkModeToggle";

// Animated counter hook
const useCounter = (end: number, duration: number = 2000, start: number = 0) => {
  const [count, setCount] = useState(start);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * (end - start) + start));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isVisible, end, start, duration]);

  return { count, ref };
};

// Scroll reveal hook
const useScrollReveal = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
};

const Home = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  // Mouse tracking for spotlight effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Scroll reveal refs
  const featuresReveal = useScrollReveal();
  const statsReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  // Animated counters
  const languagesCounter = useCounter(30, 2000);
  const accuracyCounter = useCounter(99, 2500);
  const latencyCounter = useCounter(100, 1800);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0D0D0D] text-gray-900 dark:text-white overflow-x-hidden">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="gradient-mesh" />
        <div className="absolute inset-0 bg-white/60 dark:bg-[#0D0D0D]/60" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 nav-blur">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0D9488] to-[#14B8A6] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <span className="text-lg font-semibold tracking-tight">LiveCaps</span>
            </div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Features
              </a>
              <a href="#performance" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Performance
              </a>
              <a href="#languages" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Languages
              </a>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <DarkModeToggle />
              <Link
                href="/app"
                className="group relative px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300"
              >
                <span className="relative z-10">Launch App</span>
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#0D9488]/20 to-[#14B8A6]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center pt-20 pb-32 text-center overflow-hidden"
      >
        {/* Spotlight effect */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30 transition-opacity duration-500"
          style={{
            background: `radial-gradient(800px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(13, 148, 136, 0.15), transparent 40%)`,
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0D9488] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0D9488]"></span>
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">Now with multi-language detection</span>
          </div>

          {/* Main Headline */}
          <h1 className="hero-title text-5xl md:text-7xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="block text-gray-900 dark:text-white animate-slide-up">
              Transcribe speech
            </span>
            <span
              className="block bg-gradient-to-r from-[#0D9488] via-[#14B8A6] to-[#5EEAD4] bg-clip-text text-transparent animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              in real-time
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            Built for teams that move fast. Transform voice to text instantly,
            translate across 30+ languages, and never miss a word again.
          </p>

          {/* CTA Buttons */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              href="/app"
              className="group relative inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white rounded-xl bg-gradient-to-r from-[#0D9488] to-[#14B8A6] hover:from-[#0F766E] hover:to-[#0D9488] transition-all duration-300 shadow-lg shadow-[#0D9488]/25 hover:shadow-xl hover:shadow-[#0D9488]/30"
            >
              <span>Start transcribing</span>
              <svg
                className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              See how it works
              <svg
                className="ml-2 w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          {/* Product Preview */}
          <div
            className="relative max-w-5xl mx-auto animate-slide-up"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-[#0D9488]/20 via-[#14B8A6]/20 to-[#5EEAD4]/20 rounded-3xl blur-3xl" />
            <div className="relative glass-card rounded-2xl p-2 border border-gray-200 dark:border-white/10">
              <div className="bg-gray-50 dark:bg-[#0D0D0D] rounded-xl p-6 md:p-8">
                {/* Mock UI */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  <span className="ml-4 text-sm text-gray-500">LiveCaps — Real-time Transcription</span>
                </div>
                
                {/* Animated transcription demo */}
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0D9488] to-[#14B8A6] flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">Original (English)</div>
                      <p className="text-gray-900 dark:text-white typing-animation">
                        Hello, welcome to our meeting. Let&apos;s discuss the quarterly results.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4 opacity-80">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10B981] to-[#34D399] flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">Spanish Translation</div>
                      <p className="text-gray-700 dark:text-gray-300">
                        Hola, bienvenidos a nuestra reunión. Discutamos los resultados trimestrales.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Audio visualizer mock */}
                <div className="mt-6 flex items-center justify-center gap-1">
                  {[...Array(40)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-[#0D9488] to-[#14B8A6] rounded-full audio-bar"
                      style={{
                        height: `${Math.random() * 24 + 8}px`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-gray-500">
            <span className="text-sm">Powered by</span>
            <div className="flex items-center gap-6">
              <span className="text-gray-400 font-medium">Deepgram</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-400 font-medium">DeepL</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-400 font-medium">Next.js</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg
            className="w-6 h-6 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* Features Section - Redesigned */}
      <section
        id="features"
        ref={featuresReveal.ref}
        className={`relative py-32 transition-all duration-1000 ${
          featuresReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0D9488]/10 border border-[#0D9488]/20 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
              <span className="text-sm text-[#0D9488] font-medium">Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              Everything you need to
              <span className="block bg-gradient-to-r from-[#0D9488] via-[#14B8A6] to-[#5EEAD4] bg-clip-text text-transparent">
                capture every word
              </span>
            </h2>
            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Built with precision and speed in mind. Experience transcription that keeps up with your conversations.
            </p>
          </div>

          {/* Features Grid - New Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Main Feature - Real-time Transcription */}
            <div className="lg:col-span-7 group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-8 lg:p-10 hover:border-[#0D9488]/30 transition-all duration-500 shadow-sm dark:shadow-none">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#0D9488]/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#0D9488]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0D9488] to-[#14B8A6] flex items-center justify-center shadow-lg shadow-[#0D9488]/25 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-[#0D9488]/30 transition-all duration-300">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                    </svg>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-[#0D9488]/10 text-[#0D9488] text-xs font-medium">
                    Core Feature
                  </div>
                </div>
                
                <h3 className="text-2xl lg:text-3xl font-bold mb-4 text-gray-900 dark:text-white group-hover:text-[#0D9488] dark:group-hover:text-[#5EEAD4] transition-colors duration-300">
                  Real-time Transcription
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                  Advanced AI-powered speech recognition processes your voice in milliseconds. See your words appear as you speak with unprecedented accuracy.
                </p>
              </div>
            </div>

            {/* Right column - stacked features */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              
              {/* Lightning Fast */}
              <div className="group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-6 lg:p-8 hover:border-[#10B981]/30 transition-all duration-500 flex-1 shadow-sm dark:shadow-none">
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#10B981]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                
                <div className="relative z-10 flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10B981] to-[#34D399] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#10B981]/20 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-[#10B981] dark:group-hover:text-[#34D399] transition-colors duration-300">Lightning Fast</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                      Sub-100ms latency. Your words appear before you finish speaking.
                    </p>
                  </div>
                </div>
              </div>

              {/* 30+ Languages */}
              <div className="group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-6 lg:p-8 hover:border-[#14B8A6]/30 transition-all duration-500 flex-1 shadow-sm dark:shadow-none">
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#14B8A6]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                
                <div className="relative z-10 flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14B8A6] to-[#5EEAD4] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#14B8A6]/20 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-[#14B8A6] dark:group-hover:text-[#5EEAD4] transition-colors duration-300">30+ Languages</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                      Translate to Spanish, French, German, Japanese, Chinese, Korean, and many more—instantly.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row - three equal cards */}
            <div className="lg:col-span-4 group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-6 lg:p-8 hover:border-[#F59E0B]/30 transition-all duration-500 shadow-sm dark:shadow-none">
              <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#F59E0B]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#FBBF24] flex items-center justify-center mb-5 shadow-lg shadow-[#F59E0B]/20 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-[#F59E0B] dark:group-hover:text-[#FBBF24] transition-colors duration-300">Multi-Language Detection</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  Automatically detect and transcribe multiple languages simultaneously.
                </p>
              </div>
            </div>

            <div className="lg:col-span-4 group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-6 lg:p-8 hover:border-[#EC4899]/30 transition-all duration-500 shadow-sm dark:shadow-none">
              <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#EC4899]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#EC4899] to-[#F472B6] flex items-center justify-center mb-5 shadow-lg shadow-[#EC4899]/20 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-[#EC4899] dark:group-hover:text-[#F472B6] transition-colors duration-300">Browser-Based</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  No downloads required. Works directly in your browser with enterprise-grade security.
                </p>
              </div>
            </div>

            <div className="lg:col-span-4 group relative overflow-hidden rounded-3xl bg-white dark:bg-[#0D0D0D] border border-gray-200 dark:border-white/[0.05] p-6 lg:p-8 hover:border-[#06B6D4]/30 transition-all duration-500 shadow-sm dark:shadow-none">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#06B6D4]/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#22D3EE] flex items-center justify-center mb-5 shadow-lg shadow-[#06B6D4]/20 group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white group-hover:text-[#06B6D4] dark:group-hover:text-[#22D3EE] transition-colors duration-300">Smart Formatting</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  Intelligent punctuation and sentence structure for clean, readable transcripts.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section
        id="performance"
        ref={statsReveal.ref}
        className={`relative py-32 transition-all duration-1000 ${
          statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Stat 1 */}
            <div ref={languagesCounter.ref} className="text-center group">
              <div className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-[#0D9488] to-[#14B8A6] bg-clip-text text-transparent mb-2">
                {languagesCounter.count}+
              </div>
              <div className="text-gray-600 dark:text-gray-400 text-lg">Languages supported</div>
            </div>

            {/* Stat 2 */}
            <div ref={accuracyCounter.ref} className="text-center group">
              <div className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-[#10B981] to-[#34D399] bg-clip-text text-transparent mb-2">
                {accuracyCounter.count}%
              </div>
              <div className="text-gray-600 dark:text-gray-400 text-lg">Accuracy rate</div>
            </div>

            {/* Stat 3 */}
            <div ref={latencyCounter.ref} className="text-center group">
              <div className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] bg-clip-text text-transparent mb-2">
                &lt;{latencyCounter.count}ms
              </div>
              <div className="text-gray-600 dark:text-gray-400 text-lg">Average latency</div>
            </div>
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section id="languages" className="relative py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Speak any language,
              <span className="block bg-gradient-to-r from-[#0D9488] to-[#14B8A6] bg-clip-text text-transparent">
                understand everyone
              </span>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              From English to Japanese, Spanish to Mandarin - we&apos;ve got you covered.
            </p>
          </div>

          {/* Language grid */}
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "English", "Spanish", "French", "German", "Japanese", "Chinese",
              "Korean", "Russian", "Portuguese", "Italian", "Dutch", "Arabic",
              "Hindi", "Turkish", "Polish", "Vietnamese", "Thai", "Indonesian"
            ].map((lang, i) => (
              <div
                key={lang}
                className="px-4 py-2 rounded-full bg-gray-100 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:border-[#0D9488]/50 hover:text-gray-900 dark:hover:text-white transition-all duration-300 cursor-default"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {lang}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section
        ref={ctaReveal.ref}
        className={`relative py-32 transition-all duration-1000 ${
          ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
      >
        <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
          {/* Glowing background */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-96 h-96 bg-[#0D9488]/20 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold mb-6">
              Ready to get started?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
              No signup required. No credit card. Just open the app and start transcribing.
            </p>
            <Link
              href="/app"
              className="group inline-flex items-center justify-center px-10 py-5 text-lg font-semibold text-white rounded-xl bg-gradient-to-r from-[#0D9488] to-[#14B8A6] hover:from-[#0F766E] hover:to-[#0D9488] transition-all duration-300 shadow-lg shadow-[#0D9488]/25 hover:shadow-2xl hover:shadow-[#0D9488]/40 hover:scale-105"
            >
              <span>Launch LiveCaps</span>
              <svg
                className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>

            {/* Trust line */}
            <p className="mt-8 text-sm text-gray-500">
              Free to use • No account needed • Works in any browser
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Home;
