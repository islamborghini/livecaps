/**
 * Main Application Component
 * 
 * Core component that orchestrates real-time speech transcription and translation.
 * Integrates microphone input, Deepgram speech recognition, and translation services
 * to provide a live captioning and translation experience.
 * 
 * Features:
 * - Real-time speech-to-text transcription using Deepgram
 * - Live translation to multiple target languages (Spanish, French, Japanese, etc.)
 * - Smart sentence detection and paragraph formatting
 * - Audio visualization with microphone input levels
 * - Dual-panel layout showing original transcription and translated text
 * - Language selection dropdown for target translation language
 * - Auto-scrolling to keep latest content visible
 * - Interim results display for immediate feedback
 * - Duplicate text prevention and intelligent text processing
 * - Fullscreen mode for distraction-free viewing
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  LiveConnectionState,
  LiveTranscriptionEvent,
  LiveTranscriptionEvents,
  useDeepgram,
} from "../context/DeepgramContextProvider";
import { useMultiDeepgram } from "../context/MultiDeepgramContextProvider";
import {
  MicrophoneEvents,
  MicrophoneState,
  useMicrophone,
} from "../context/MicrophoneContextProvider";
import Visualizer from "./Visualizer";
import { translateBySentences, cacheUtils } from "../services/translationService";
import MultiLanguageSelector from "./MultiLanguageSelector";
import TranscriptionModeToggle from "./TranscriptionModeToggle";
import RAGUpload, { UploadedFile } from "./RAGUpload";
import { useRAG } from "@/app/hooks/useRAG";
import { WordConfidence } from "@/app/types/rag";
import { TranscriptionMode, WinnerTranscript } from "../types/multiDeepgram";
import { useUsage } from "../context/UsageContextProvider";
import UsageIndicator from "./UsageIndicator";
import TimeExpiredOverlay from "./TimeExpiredOverlay";

/**
 * Languages supported by Nova-3's multilingual mode (language=multi)
 * Source: https://developers.deepgram.com/docs/models-languages-overview
 */
const NOVA3_MULTI_LANGUAGES = ['en', 'es', 'fr', 'de', 'hi', 'ru', 'pt', 'ja', 'it', 'nl'];

/**
 * Represents a transcript segment with detected language metadata.
 * Used to preserve language information from Deepgram's word-level detection
 * through the sentence buffer and translation pipeline.
 */
type TranscriptSegment = {
  text: string;
  languages: string[];  // Unique languages detected in this segment (e.g., ["en", "es"])
};

/**
 * Session-level language configuration.
 * Defines which languages are expected to be spoken and which languages to display translations in.
 */
type SessionLanguages = {
  spoken: string[];   // Languages expected in conversation (e.g., ["en", "ko", "ru"])
  display: string[];  // Languages to translate into (e.g., ["en", "es", "ja"])
};

/**
 * A unified transcript block representing one spoken sentence with its translations.
 * Replaces the dual-panel model with a single stream where each sentence appears once
 * with translations displayed inline.
 */
type TranscriptBlock = {
  id: string;  // Unique identifier for this block
  original: {
    text: string;      // The original transcribed text (may be corrected)
    language: string;  // Dominant language detected (e.g., "en", "ko")
  };
  translations: {
    language: string;  // Target language code (e.g., "es", "ja")
    text: string | null;  // Translated text (null while pending)
  }[];
  // RAG correction metadata (optional - only present if correction was applied)
  ragCorrected?: {
    originalText: string;      // The original misheard text before correction
    correctedTerms: string[];  // List of terms that were corrected
  };
};

const App: () => JSX.Element = () => {
  // Usage tracking
  const { isTimeExpired, startTimer, stopTimer } = useUsage();

  // Session language configuration - defines spoken and display languages
  // Initialize with default values to avoid hydration mismatch
  // Load from localStorage after mount
  const [sessionLanguages, setSessionLanguages] = useState<SessionLanguages>({
    spoken: ["en"],     // Default: English only
    display: ["es"]      // Default: Spanish translation
  });

  // Track if we've loaded from localStorage yet
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  // Transcription mode - single language or multi-language detection
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>("single");
  
  // RAG correction toggle - allows users to enable/disable vocabulary corrections
  const [isRAGEnabled, setIsRAGEnabled] = useState<boolean>(true);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && !hasLoadedFromStorage) {
      const saved = localStorage.getItem('livecaps_languages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSessionLanguages(parsed);
          console.log('📂 Loaded languages from localStorage:', parsed);
        } catch (e) {
          console.error('Failed to parse saved languages:', e);
        }
      }

      // Load transcription mode
      const savedMode = localStorage.getItem('transcriptionMode') as TranscriptionMode;
      if (savedMode === 'single' || savedMode === 'multi-detect') {
        setTranscriptionMode(savedMode);
        console.log('📂 Loaded transcription mode from localStorage:', savedMode);
      }

      setHasLoadedFromStorage(true);
    }
  }, [hasLoadedFromStorage]);

  // Unified transcript blocks - replaces dual-panel completeSentences + translatedSentences
  const [transcriptBlocks, setTranscriptBlocks] = useState<TranscriptBlock[]>([]);
  const [currentInterimText, setCurrentInterimText] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  //Single-language context
  const singleContext = useDeepgram();
  // Multi-language detection context
  const multiContext = useMultiDeepgram();

  // Determine if we're actually using multi-mode (multi-detect mode AND more than 1 spoken language)
  const isMultiMode = transcriptionMode === "multi-detect" && sessionLanguages.spoken.length > 1;
  
  // Use the appropriate connection state based on actual mode being used
  const connectionState = isMultiMode ? multiContext.overallState : singleContext.connectionState;

  const { setupMicrophone, microphone, startMicrophone, microphoneState, errorMessage, retrySetup } =
    useMicrophone();

  // RAG integration for vocabulary-aware transcript correction
  const {
    isReady: isRAGReady,
    sessionId: ragSessionId,
    correct: ragCorrect,
    shouldTriggerRAG,
  } = useRAG({ debug: false });

  // Uploaded files state - lifted from RAGUpload to persist across fullscreen toggle
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Track blocks that are pending RAG correction to avoid duplicate corrections
  const pendingRAGCorrections = useRef<Set<string>>(new Set());

  // Refs for managing transcription flow
  const keepAliveInterval = useRef<any>();
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenTranscriptRef = useRef<HTMLDivElement>(null);
  const processedFinalTexts = useRef<Set<string>>(new Set());
  // Buffer now tracks language metadata for multilingual code-switching support
  const currentSentenceBuffer = useRef<TranscriptSegment>({ text: "", languages: [] });
  const bufferTimeout = useRef<NodeJS.Timeout | null>(null); // Timeout for processing buffered text
  // Store word confidences from latest Deepgram response for RAG correction
  const lastWordConfidences = useRef<WordConfidence[]>([]);

  // Translation queue management - updated to work with TranscriptBlocks
  const translationQueue = useRef<{
    blockId: string;                     // ID of the TranscriptBlock to update
    text: string;                        // Text to translate
    sourceLanguage: "auto";              // Always "auto" for multilingual support
    targetLanguage: string;              // Target translation language
  }[]>([]);
  const isProcessingTranslation = useRef<boolean>(false);

  // Ref to store queueTranslation function for use in callbacks
  const queueTranslationRef = useRef<(blockId: string, text: string, targetLanguage: string) => void>(() => {});

  /**
   * Detect the dominant (most frequent) language from detected languages array.
   * Falls back to first language if all are equally represented.
   */
  const detectDominantLanguage = (detectedLanguages: string[]): string => {
    if (detectedLanguages.length === 0) return "en"; // Default to English
    if (detectedLanguages.length === 1) return detectedLanguages[0];

    // Count frequency of each language
    const languageCounts = detectedLanguages.reduce((acc, lang) => {
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Find the most frequent language
    let dominantLang = detectedLanguages[0];
    let maxCount = 0;

    for (const [lang, count] of Object.entries(languageCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantLang = lang;
      }
    }

    return dominantLang;
  };

  /**
   * Create a new TranscriptBlock with empty translations.
   * Generates translations for all display languages.
   */
  const createTranscriptBlock = (text: string, detectedLanguages: string[]): TranscriptBlock => {
    const dominantLanguage = detectDominantLanguage(detectedLanguages);
    const blockId = `block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    return {
      id: blockId,
      original: {
        text,
        language: dominantLanguage
      },
      translations: sessionLanguages.display.map(lang => ({
        language: lang,
        text: null  // Will be filled by translation queue
      }))
    };
  };

  // Process buffered text after a delay (fallback for incomplete sentences)
  // Now creates a TranscriptBlock for unified transcript view
  // Improved: requires more content before flushing to avoid fragmented sentences
  const processBufferedText = () => {
    const bufferedText = currentSentenceBuffer.current.text.trim();
    
    // Require at least 60 characters to avoid tiny fragments
    // This ensures we have substantial, meaningful content
    if (bufferedText.length >= 60) {
      const bufferedLanguages = currentSentenceBuffer.current.languages;

      // Try to find a natural break point to avoid cutting mid-thought
      // Look for sentence-ending punctuation first
      let textToProcess = bufferedText;
      let remainingText = "";
      
      // First, try to find a sentence boundary (. ! ?)
      // Look for punctuation followed by space and capital/uppercase letter
      // Using simpler regex that works across all ES targets
      const sentenceEndIndex = bufferedText.search(/[.!?]\s+[A-ZА-ЯЁ\u4e00-\u9fff\uac00-\ud7af]/);
      
      if (sentenceEndIndex !== -1) {
        // Found a clean sentence boundary - include the punctuation
        const splitPoint = sentenceEndIndex + 1;
        textToProcess = bufferedText.substring(0, splitPoint).trim();
        remainingText = bufferedText.substring(splitPoint).trim();
      } else {
        // No sentence boundary - look for clause breaks in last 30% of text
        const breakSearchStart = Math.floor(bufferedText.length * 0.7);
        const endPortion = bufferedText.substring(breakSearchStart);
        
        // Find break points: comma, semicolon, dash, or conjunctions
        const breakMatch = endPortion.match(/[,;–—]\s+|(?:\s+(?:and|or|but|that|which|who|и|или|а|но|что|который|которая)\s+)/i);
        
        if (breakMatch && breakMatch.index !== undefined) {
          // Keep text up to and including the break point
          const breakIndex = breakSearchStart + breakMatch.index + breakMatch[0].length;
          textToProcess = bufferedText.substring(0, breakIndex).trim();
          remainingText = bufferedText.substring(breakIndex).trim();
        }
        // If no break found, use all text (will be processed on next flush)
      }

      // Keep remaining text in buffer for next segment
      if (remainingText.length > 0) {
        currentSentenceBuffer.current = { text: remainingText, languages: bufferedLanguages };
      } else {
        currentSentenceBuffer.current = { text: "", languages: [] };
      }

      // Add period if text doesn't end with punctuation
      if (!/[.!?]$/.test(textToProcess)) {
        textToProcess += ".";
      }

      // Only create block if we have meaningful content (at least 4 words)
      // Word pattern covers Latin, Cyrillic, Korean, Chinese/Japanese
      const wordPattern = /[A-Za-zА-Яа-яЁё\u4e00-\u9fff\uac00-\ud7af]+/g;
      const wordCount = (textToProcess.match(wordPattern) || []).length;
      if (wordCount >= 4) {
        // Create a transcript block with the processed text
        const block = createTranscriptBlock(textToProcess, bufferedLanguages);

        // Add block to transcript
        setTranscriptBlocks(prev => [...prev, block]);

        // Queue translations for all display languages
        sessionLanguages.display.forEach(targetLang => {
          queueTranslation(block.id, block.original.text, targetLang);
        });

        // Apply RAG correction asynchronously (non-blocking)
        if (isRAGReady) {
          const dominantLang = detectDominantLanguage(bufferedLanguages);
          applyRAGCorrection(block.id, block.original.text, lastWordConfidences.current, dominantLang);
        }

        console.log(`📦 Flushed buffer (${textToProcess.length} chars, ${wordCount} words): "${textToProcess.substring(0, 50)}..."`);
      } else {
        // Not enough content, put it back in buffer
        currentSentenceBuffer.current = { 
          text: textToProcess.replace(/\.$/, '') + " " + remainingText, 
          languages: bufferedLanguages 
        };
        console.log(`⏳ Buffer too short (${wordCount} words), continuing to accumulate...`);
      }
    }
  };
  
  useEffect(() => {
    setupMicrophone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect to Deepgram when microphone is ready
  useEffect(() => {
    console.log('🔍 Connection effect triggered:', {
      microphoneState,
      isMultiMode,
      connectionState,
      spokenLanguages: sessionLanguages.spoken,
      transcriptionMode,
      hasLoadedFromStorage
    });

    // Don't connect until we've loaded settings from storage
    if (!hasLoadedFromStorage) {
      console.log('⏸️ Waiting for localStorage to load before connecting');
      return;
    }

    // Only connect when microphone is ready and not already connected
    if (microphoneState === MicrophoneState.Ready && connectionState === LiveConnectionState.CLOSED) {
      const connectBasedOnMode = async () => {
        // isMultiMode already accounts for spoken languages count
        console.log('🔍 Deciding connection mode:', {
          isMultiMode,
          spokenLanguagesCount: sessionLanguages.spoken.length,
          willUseMulti: isMultiMode
        });

        if (isMultiMode) {
          // Multi-language detection mode - use parallel connections
          console.log(`🌐 Multi-Language Detection Mode: Creating ${sessionLanguages.spoken.length} parallel connections`);
          console.log(`📍 Languages: ${sessionLanguages.spoken.join(', ')}`);

          try {
            await multiContext.connectToDeepgram(sessionLanguages.spoken);
            console.log('✅ All parallel connections established');
          } catch (error) {
            console.error('❌ Failed to establish parallel connections:', error);
          }
        } else {
          // Single language mode - use specific language for better accuracy
          const languageParam = sessionLanguages.spoken[0] || "en";
          const modelParam = "nova-3"; // Nova-3 supports 30+ languages with better accuracy

          console.log(`🎯 Single Language Mode: ${languageParam} with ${modelParam}`);

          const connectionOptions = {
            model: modelParam,
            language: languageParam,
            interim_results: true,
            smart_format: true,
            punctuate: true,
            endpointing: 300,
            utterance_end_ms: 2500,
            vad_events: true,
          };

          console.log('🎤 Connecting to Deepgram with options:', connectionOptions);
          console.log('🌍 Session languages - Speaking:', sessionLanguages.spoken, 'Display:', sessionLanguages.display);

          try {
            await singleContext.connectToDeepgram(connectionOptions);
            console.log('✅ Single connection established');
          } catch (error) {
            console.error('❌ Failed to establish single connection:', error);
          }
        }
      };

      connectBasedOnMode();
    } else {
      console.log('⏸️ Not connecting - Microphone:', microphoneState, 'Connection:', connectionState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState, isMultiMode, connectionState, hasLoadedFromStorage]);

  // Save languages to localStorage whenever they change (after initial load)
  useEffect(() => {
    if (typeof window !== 'undefined' && hasLoadedFromStorage) {
      localStorage.setItem('livecaps_languages', JSON.stringify(sessionLanguages));
      console.log('💾 Saved languages to localStorage:', sessionLanguages);
    }
  }, [sessionLanguages, hasLoadedFromStorage]);

  // Handle mode changes - disconnect when mode changes (reconnection handled by main connection effect)
  useEffect(() => {
    // Skip on initial mount and before localStorage loads
    if (!hasLoadedFromStorage) return;

    // Only disconnect if already connected - the main connection effect will handle reconnection
    if (connectionState === LiveConnectionState.OPEN) {
      console.log('🔄 Transcription mode changed while connected, disconnecting...', {
        newMode: transcriptionMode,
        isMultiMode,
        spokenLanguages: sessionLanguages.spoken
      });

      // Disconnect current connection
      if (isMultiMode) {
        multiContext.disconnectFromDeepgram();
      } else {
        singleContext.disconnectFromDeepgram();
      }

      // Clear state
      setTranscriptBlocks([]);
      setCurrentInterimText("");
      currentSentenceBuffer.current = { text: "", languages: [] };
      processedFinalTexts.current.clear();

      // Main connection effect will handle reconnection automatically
      console.log('⏳ Main connection effect will handle reconnection...');
    } else {
      console.log('⏭️ Mode changed but not connected - main connection effect will handle connection');
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptionMode]);

  // Track if this is the first render
  const isInitialMount = useRef(true);
  const previousSpokenLanguages = useRef<string[]>(sessionLanguages.spoken);
  const isReconnecting = useRef(false);

  // Automatically reconnect when spoken languages change
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousSpokenLanguages.current = sessionLanguages.spoken;
      return;
    }

    // Check if languages actually changed
    const languagesChanged =
      sessionLanguages.spoken.length !== previousSpokenLanguages.current.length ||
      !sessionLanguages.spoken.every(lang => previousSpokenLanguages.current.includes(lang));

    if (!languagesChanged || isReconnecting.current) {
      return;
    }

    // Only reconnect if already connected
    if (connectionState !== LiveConnectionState.OPEN) {
      previousSpokenLanguages.current = sessionLanguages.spoken;
      return;
    }

    console.log('🔄 Spoken languages changed, auto-reconnecting...');
    isReconnecting.current = true;
    previousSpokenLanguages.current = sessionLanguages.spoken;

    // Disconnect and clear (mode-aware)
    if (isMultiMode) {
      multiContext.disconnectFromDeepgram();
    } else {
      singleContext.disconnectFromDeepgram();
    }

    setTranscriptBlocks([]);
    setCurrentInterimText("");
    currentSentenceBuffer.current = { text: "", languages: [] };
    processedFinalTexts.current.clear();

    // Wait for clean disconnection then reconnect
    const reconnectTimer = setTimeout(async () => {
      if (isMultiMode && sessionLanguages.spoken.length > 1) {
        console.log(`🌐 Reconnecting in multi-language mode with ${sessionLanguages.spoken.length} languages`);
        try {
          await multiContext.connectToDeepgram(sessionLanguages.spoken);
        } catch (error) {
          console.error('❌ Failed to reconnect in multi mode:', error);
        }
      } else {
        const languageParam = sessionLanguages.spoken[0];
        console.log(`🎯 Reconnecting in single-language mode: ${languageParam}`);

        const connectionOptions = {
          model: "nova-3",
          language: languageParam,
          interim_results: true,
          smart_format: true,
          punctuate: true,
          endpointing: 300,
          utterance_end_ms: 2500,
          vad_events: true,
        };

        try {
          await singleContext.connectToDeepgram(connectionOptions);
        } catch (error) {
          console.error('❌ Failed to reconnect in single mode:', error);
        }
      }

      setTimeout(() => {
        isReconnecting.current = false;
      }, 2000);
    }, 1000);

    return () => clearTimeout(reconnectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLanguages.spoken]); // Removed connectionState to prevent loop - we check it inside the effect

  // Preload common phrases for display languages
  useEffect(() => {
    sessionLanguages.display.forEach(lang => {
      if (lang !== 'en') {
        cacheUtils.preloadCommonPhrases(lang).catch(error => {
          console.warn(`Failed to preload common phrases for ${lang}:`, error);
        });
      }
    });
  }, [sessionLanguages.display]);

  // Manual reconnect function
  const handleManualReconnect = async () => {
    if (isReconnecting.current || connectionState === LiveConnectionState.CONNECTING) {
      console.log('⏳ Already reconnecting, please wait...');
      return;
    }

    console.log('🔄 Manual reconnect triggered');
    isReconnecting.current = true;

    // First disconnect any existing connections
    try {
      multiContext.disconnectFromDeepgram();
      singleContext.disconnectFromDeepgram();
    } catch (e) {
      // Ignore disconnect errors
    }

    // Clear state
    setTranscriptBlocks([]);
    setCurrentInterimText("");
    currentSentenceBuffer.current = { text: "", languages: [] };
    processedFinalTexts.current.clear();

    // Wait a moment then reconnect
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      if (isMultiMode) {
        console.log(`🌐 Reconnecting in multi-language mode with ${sessionLanguages.spoken.length} languages`);
        await multiContext.connectToDeepgram(sessionLanguages.spoken);
      } else {
        const languageParam = sessionLanguages.spoken[0] || "en";
        console.log(`🎯 Reconnecting in single-language mode: ${languageParam}`);

        const connectionOptions = {
          model: "nova-3",
          language: languageParam,
          interim_results: true,
          smart_format: true,
          punctuate: true,
          endpointing: 300,
          utterance_end_ms: 2500,
          vad_events: true,
        };

        await singleContext.connectToDeepgram(connectionOptions);
      }
      console.log('✅ Reconnected successfully');
    } catch (error) {
      console.error('❌ Failed to reconnect:', error);
    } finally {
      setTimeout(() => {
        isReconnecting.current = false;
      }, 1000);
    }
  };

  // More robust sentence detection that handles incomplete transcriptions
  // Improved: Accumulates longer segments and uses smarter boundary detection
  const detectCompleteSentences = (text: string): string[] => {
    if (!text.trim()) return [];
    
    const sentences: string[] = [];
    
    // Only process if we have substantial content (at least 40 chars)
    // This prevents premature splitting of short fragments
    if (text.length < 40) {
      return [];
    }
    
    // Match sentences ending with . ! ? followed by space and uppercase
    // Uses explicit character ranges for compatibility
    // Covers: Latin, Cyrillic, Korean Hangul, Chinese/Japanese
    const sentenceRegex = /[^.!?]+[.!?]+(?=\s+[A-ZА-ЯЁ\u4e00-\u9fff\uac00-\ud7af]|$)/g;
    const matches = text.match(sentenceRegex);
    
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim();
        
        // Accept sentence if it meets quality criteria:
        // 1. At least 40 characters (ensures meaningful content)
        // 2. Contains at least 4 word-like sequences (any script)
        // 3. Doesn't look like a fragment (doesn't start with lowercase)
        // Word pattern covers Latin, Cyrillic, Korean, Chinese/Japanese
        const wordPattern = /[A-Za-zА-Яа-яЁё\u4e00-\u9fff\uac00-\ud7af]+/g;
        const wordCount = (trimmed.match(wordPattern) || []).length;
        const startsWithLowercase = /^[a-zа-яё]/.test(trimmed);
        
        if (trimmed.length >= 40 && wordCount >= 4 && !startsWithLowercase) {
          sentences.push(trimmed);
        }
      }
    }
    
    return sentences;
  };

  /**
   * Translate a single text to a target language.
   * Used by the translation queue to translate TranscriptBlock originals.
   */
  const translateText = async (text: string, targetLanguage: string): Promise<string> => {
    try {
      const result = await translateBySentences({
        text,
        sourceLanguage: "auto",  // Always auto for multilingual code-switching
        targetLanguage
      });

      return result.translatedText || text;
    } catch (error) {
      console.error("Translation error:", error);
      return text;  // Return original on failure
    }
  };

  /**
   * Non-blocking translation queue processor with batching.
   * Updated to work with TranscriptBlocks - processes translations and updates blocks.
   */
  const processTranslationQueue = async () => {
    if (isProcessingTranslation.current || translationQueue.current.length === 0) {
      return;
    }

    isProcessingTranslation.current = true;

    try {
      while (translationQueue.current.length > 0) {
        // Take one item from queue at a time (batching multiple blocks would be complex)
        const item = translationQueue.current.shift();
        if (!item) break;

        console.log(`🔄 Translating block ${item.blockId} to ${item.targetLanguage}`);

        // Translate the text
        const translation = await translateText(item.text, item.targetLanguage);

        // Update the specific block's translation for this language
        setTranscriptBlocks(prev => prev.map(block => {
          if (block.id === item.blockId) {
            return {
              ...block,
              translations: block.translations.map(t =>
                t.language === item.targetLanguage
                  ? { ...t, text: translation }
                  : t
              )
            };
          }
          return block;
        }));

        // Small delay between translations
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.error("Translation queue processing error:", error);
    } finally {
      isProcessingTranslation.current = false;
    }
  };

  /**
   * Apply RAG correction to a transcript block asynchronously.
   * Shows original text immediately, updates if correction is different.
   * Re-queues translations if text was modified.
   * 
   * @param blockId - ID of the TranscriptBlock to correct
   * @param originalText - Original transcript text
   * @param wordConfidences - Optional word-level confidence scores from Deepgram
   * @param language - Detected language of the transcript
   */
  const applyRAGCorrection = useCallback(async (
    blockId: string,
    originalText: string,
    wordConfidences: WordConfidence[] | undefined,
    language: string
  ) => {
    // Skip if RAG not ready, disabled, or already processing this block
    if (!isRAGReady || !isRAGEnabled || pendingRAGCorrections.current.has(blockId)) {
      return;
    }

    // Check if correction is needed (based on confidence or always for RAG)
    // If no word confidences provided, generate low-confidence ones to trigger correction
    const confidences = wordConfidences || originalText.split(/\s+/).map((word, i) => ({
      word,
      confidence: 0.6, // Below threshold to trigger RAG
      start: i * 0.5,
      end: (i + 1) * 0.5,
    }));

    // Check if any words need correction
    if (!shouldTriggerRAG(confidences, 0.7)) {
      console.log(`✅ RAG: All words high confidence, skipping correction for block ${blockId}`);
      return;
    }

    pendingRAGCorrections.current.add(blockId);
    console.log(`🔍 RAG: Correcting block ${blockId}: "${originalText.substring(0, 50)}..."`);

    try {
      const result = await ragCorrect(originalText, confidences, {
        language,
        isFinal: true,
      });

      // Check if correction changed the text
      if (result.wasModified && result.correctedTranscript !== originalText) {
        console.log(`✨ RAG: Correction applied to block ${blockId}`);
        console.log(`   Original: "${originalText.substring(0, 60)}..."`);
        console.log(`   Corrected: "${result.correctedTranscript.substring(0, 60)}..."`);
        console.log(`   Corrections:`, result.corrections);

        // Extract corrected terms from the corrections array
        const correctedTerms = result.corrections.map(c => c.corrected);

        // Update the block with corrected text AND store original for hover display
        setTranscriptBlocks(prev => prev.map(block => {
          if (block.id === blockId) {
            return {
              ...block,
              original: {
                ...block.original,
                text: result.correctedTranscript,
              },
              // Store RAG correction metadata
              ragCorrected: {
                originalText: originalText,
                correctedTerms: correctedTerms,
              },
              // Reset translations to null so they get re-queued
              translations: block.translations.map(t => ({ ...t, text: null })),
            };
          }
          return block;
        }));

        // Re-queue translations with corrected text
        sessionLanguages.display.forEach(targetLang => {
          queueTranslationRef.current(blockId, result.correctedTranscript, targetLang);
        });
      } else {
        console.log(`📝 RAG: No changes needed for block ${blockId}`);
      }
    } catch (error) {
      console.error(`❌ RAG: Correction failed for block ${blockId}:`, error);
    } finally {
      pendingRAGCorrections.current.delete(blockId);
    }
  }, [isRAGReady, isRAGEnabled, ragCorrect, shouldTriggerRAG, sessionLanguages.display]);

  /**
   * Handles winner transcript from multi-language detection mode
   * Processes the winning transcript similar to single-mode transcript handling
   */
  const handleWinnerTranscript = useCallback((winner: WinnerTranscript) => {
    console.log(`🏆 Winner transcript: [${winner.language}] confidence=${winner.confidence.toFixed(3)} "${winner.transcript}"`);

    if (!winner.isFinal) {
      // Show interim result
      setCurrentInterimText(winner.transcript);
      return;
    }

    // Skip empty transcripts
    if (winner.transcript.trim() === "") {
      console.log('⚠️ Empty winner transcript, ignoring');
      return;
    }

    // Prevent duplicate processing
    if (processedFinalTexts.current.has(winner.transcript)) {
      console.log('⚠️ Duplicate winner transcript, ignoring');
      return;
    }

    processedFinalTexts.current.add(winner.transcript);

    const textToProcess = winner.transcript;
    const detectedLanguages = [winner.language];

    // Combine with existing buffer
    const combinedText = (currentSentenceBuffer.current.text + " " + textToProcess).trim();
    const combinedLanguages = [...new Set([...currentSentenceBuffer.current.languages, ...detectedLanguages])];

    // Detect complete sentences
    const newCompleteSentences = detectCompleteSentences(combinedText);

    if (newCompleteSentences.length > 0) {
      // Clear buffer timeout since we're processing
      if (bufferTimeout.current) {
        clearTimeout(bufferTimeout.current);
        bufferTimeout.current = null;
      }

      // Calculate remaining text after extracting complete sentences
      const allSentencesText = newCompleteSentences.join(' ');
      const remainingText = combinedText.substring(allSentencesText.length).trim();

      console.log(`✅ Created ${newCompleteSentences.length} new transcript blocks from winner`);

      // Create transcript blocks for each complete sentence
      const newBlocks = newCompleteSentences.map(sentenceText =>
        createTranscriptBlock(sentenceText, combinedLanguages)
      );

      // Add blocks to transcript
      setTranscriptBlocks(prev => [...prev, ...newBlocks]);

      // Queue translations for all display languages
      newBlocks.forEach(block => {
        sessionLanguages.display.forEach(targetLang => {
          queueTranslation(block.id, block.original.text, targetLang);
        });

        // Apply RAG correction asynchronously (non-blocking)
        // Uses word confidences from the winner transcript if available
        if (isRAGReady) {
          const dominantLang = detectDominantLanguage(combinedLanguages);
          applyRAGCorrection(block.id, block.original.text, undefined, dominantLang);
        }
      });

      // Update buffer with remaining text
      currentSentenceBuffer.current = {
        text: remainingText,
        languages: combinedLanguages
      };
    } else {
      // No complete sentence yet, add to buffer
      console.log(`📝 Buffering winner text (no complete sentence yet): "${textToProcess}"`);
      currentSentenceBuffer.current = {
        text: combinedText,
        languages: combinedLanguages
      };

      // Set timeout to process buffer - longer timeout for better accumulation
      if (bufferTimeout.current) {
        clearTimeout(bufferTimeout.current);
      }

      bufferTimeout.current = setTimeout(() => {
        // Only flush if we have substantial content (60+ chars, 4+ words)
        const bufferedText = currentSentenceBuffer.current.text.trim();
        // Word pattern covers Latin, Cyrillic, Korean, Chinese/Japanese
        const wordPattern = /[A-Za-zА-Яа-яЁё\u4e00-\u9fff\uac00-\ud7af]+/g;
        const wordCount = (bufferedText.match(wordPattern) || []).length;
        
        if (bufferedText.length >= 60 && wordCount >= 4) {
          const bufferedLanguages = currentSentenceBuffer.current.languages;

          // Add period if needed
          const finalText = /[.!?]$/.test(bufferedText) ? bufferedText : bufferedText + ".";
          
          const block = createTranscriptBlock(finalText, bufferedLanguages);
          setTranscriptBlocks(prev => [...prev, block]);

          sessionLanguages.display.forEach(targetLang => {
            queueTranslation(block.id, block.original.text, targetLang);
          });

          // Apply RAG correction asynchronously (non-blocking)
          if (isRAGReady) {
            const dominantLang = detectDominantLanguage(bufferedLanguages);
            applyRAGCorrection(block.id, block.original.text, undefined, dominantLang);
          }

          currentSentenceBuffer.current = { text: "", languages: [] };
          console.log(`📦 Timeout flush (${finalText.length} chars, ${wordCount} words)`);
        } else if (bufferedText.length > 0) {
          console.log(`⏳ Timeout: buffer too short (${bufferedText.length} chars, ${wordCount} words), keeping...`);
        }
      }, 3500); // Longer timeout for better accumulation
    }

    // Clear interim text
    setCurrentInterimText("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLanguages, detectCompleteSentences, createTranscriptBlock, isRAGReady, applyRAGCorrection, detectDominantLanguage]);

  /**
   * Add translation to queue (non-blocking).
   * Updated to work with TranscriptBlocks - queues a single text for translation.
   */
  const queueTranslation = useCallback((blockId: string, text: string, targetLanguage: string) => {
    // Create a unique key for this translation request
    const requestKey = `${blockId}-${targetLanguage}`;

    // Check if we already have a translation request for this exact content
    const existingRequest = translationQueue.current.find(item =>
      `${item.blockId}-${item.targetLanguage}` === requestKey
    );

    if (existingRequest) {
      return;  // Already queued
    }

    translationQueue.current.push({
      blockId,
      text,
      sourceLanguage: "auto",  // Always auto for multilingual code-switching
      targetLanguage
    });

    // Start processing queue asynchronously (fire and forget)
    setTimeout(() => processTranslationQueue(), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep queueTranslationRef updated
  useEffect(() => {
    queueTranslationRef.current = queueTranslation;
  }, [queueTranslation]);

  useEffect(() => {
    if (!microphone) return;

    const onData = (e: BlobEvent) => {
      // Gate audio when usage limit reached
      if (isTimeExpired) return;

      // iOS SAFARI FIX:
      // Prevent packetZero from being sent. If sent at size 0, the connection will close.
      // Also check if connection is actually open before sending
      if (e.data.size > 0 && connectionState === LiveConnectionState.OPEN) {
        try {
          if (isMultiMode) {
            // Multi mode - send to all connections
            multiContext.sendAudioToAll(e.data);
          } else {
            // Single mode - send to single connection
            singleContext.connection?.send(e.data);
          }
        } catch (error) {
          console.warn('⚠️ Failed to send audio data:', error);
        }
      }
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const { is_final: isFinal } = data;
      const alternative = data.channel.alternatives[0];
      let thisCaption = alternative.transcript.trim();

      if (thisCaption === "") {
        return;
      }
      
      // Extract language metadata from word-level detection (Nova-2 multilingual)
      // Each word can have a different language when code-switching occurs
      const words = (alternative as any).words || [];
      const detectedLanguages: string[] = [];

      // Store word confidences for RAG correction
      if (isFinal && words.length > 0) {
        lastWordConfidences.current = words.map((w: any) => ({
          word: w.word || "",
          confidence: w.confidence || 0.5,
          start: w.start || 0,
          end: w.end || 0,
        }));
      }

      // Debug: Log the full alternative object to see what we're getting
      if (isFinal) {
        console.log('🔍 Full Deepgram response alternative:', JSON.stringify(alternative, null, 2));
      }

      // Also check for channel-level detected language (fallback)
      const channelLanguage = (data.channel as any).detected_language || (data as any).detected_language;
      if (channelLanguage && !detectedLanguages.includes(channelLanguage)) {
        detectedLanguages.push(channelLanguage);
        console.log(`📡 Channel-level language detected: ${channelLanguage}`);
      }

      // Extract per-word languages
      for (const word of words) {
        if (word.language && !detectedLanguages.includes(word.language)) {
          detectedLanguages.push(word.language);
        }
      }

      // Debug logging for language detection
      if (isFinal) {
        console.log(`📝 Final transcript: "${thisCaption.substring(0, 50)}${thisCaption.length > 50 ? '...' : ''}"`);
        console.log(`🔍 Detected languages: [${detectedLanguages.length > 0 ? detectedLanguages.join(', ') : 'none detected'}]`);
        console.log(`📊 Words array length: ${words.length}`);
        if (words.length > 0) {
          console.log(`📊 First few words:`, words.slice(0, 3).map((w: any) => ({
            word: w.word,
            language: w.language,
            confidence: w.confidence
          })));
        }
      }

      // Log code-switching detection for debugging
      if (detectedLanguages.length > 1) {
        console.log(`🌐 Code-switching detected: [${detectedLanguages.join(', ')}] in: "${thisCaption.substring(0, 50)}..."`);
      }
      
      if (isFinal) {
        // Prevent duplicate processing
        if (processedFinalTexts.current.has(thisCaption)) {
          return;
        }
        
        processedFinalTexts.current.add(thisCaption);
        
        // Combine buffer with new text (merging language metadata)
        const combinedText = (currentSentenceBuffer.current.text + " " + thisCaption).trim();
        const combinedLanguages = [...new Set([...currentSentenceBuffer.current.languages, ...detectedLanguages])];
        const textToProcess = combinedText;
        
        // Wait for a longer pause or multiple sentences before processing
        // This helps ensure we have complete context
        const newCompleteSentences = detectCompleteSentences(textToProcess);
        
        if (newCompleteSentences.length > 0) {
          // Clear any pending buffer timeout since we found complete sentences
          if (bufferTimeout.current) {
            clearTimeout(bufferTimeout.current);
            bufferTimeout.current = null;
          }

          // Calculate what text remains after extracting complete sentences
          const extractedText = newCompleteSentences.join(' ');
          const remainingText = textToProcess.slice(extractedText.length).trim();

          // Create TranscriptBlocks for each complete sentence
          const newBlocks = newCompleteSentences.map(sentenceText =>
            createTranscriptBlock(sentenceText, combinedLanguages)
          );

          console.log(`✅ Created ${newBlocks.length} new transcript blocks:`, newBlocks.map(b => ({ id: b.id, text: b.original.text })));

          // Add all new blocks to transcript
          setTranscriptBlocks(prev => [...prev, ...newBlocks]);

          // Queue translations for all display languages for each block
          // Also apply RAG correction asynchronously if ready
          newBlocks.forEach(block => {
            sessionLanguages.display.forEach(targetLang => {
              queueTranslation(block.id, block.original.text, targetLang);
            });

            // Apply RAG correction asynchronously (non-blocking)
            // Pass word confidences from Deepgram for accurate correction targeting
            if (isRAGReady) {
              const dominantLang = detectDominantLanguage(combinedLanguages);
              applyRAGCorrection(block.id, block.original.text, lastWordConfidences.current, dominantLang);
            }
          });

          // Keep any remaining text in buffer (preserving languages for next segment)
          currentSentenceBuffer.current = { text: remainingText, languages: combinedLanguages };
        } else {
          // No complete sentences detected, keep building in buffer with language info
          currentSentenceBuffer.current = { text: textToProcess, languages: combinedLanguages };
          
          // Set a timeout to process buffered text if no new transcription comes
          // Longer timeout allows more content to accumulate
          if (bufferTimeout.current) {
            clearTimeout(bufferTimeout.current);
          }
          
          bufferTimeout.current = setTimeout(() => {
            processBufferedText();
          }, 3500); // Longer timeout for better accumulation
        }
        
        // Clear interim display
        setCurrentInterimText("");
        
      } else {
        // Show interim results without breaking sentences
        setCurrentInterimText(thisCaption);
      }
    };

    // Handler for when Deepgram detects the speaker has paused/stopped talking
    // Improved: Only process if we have substantial content, otherwise wait for more
    const onUtteranceEnd = () => {
      console.log('🎤 Speaker pause detected...');

      const bufferLength = currentSentenceBuffer.current.text.trim().length;
      
      // Only process immediately if we have substantial content (80+ chars)
      // Otherwise, let the regular buffer timeout handle it
      // This prevents flushing tiny fragments on brief pauses
      if (bufferLength >= 80) {
        const langInfo = currentSentenceBuffer.current.languages.length > 0 
          ? ` [${currentSentenceBuffer.current.languages.join(', ')}]` 
          : '';
        console.log(`📝 Substantial buffer${langInfo} (${bufferLength} chars), processing...`);

        // Clear any pending timeout since we're processing now
        if (bufferTimeout.current) {
          clearTimeout(bufferTimeout.current);
          bufferTimeout.current = null;
        }

        // Process the buffered text
        processBufferedText();
      } else if (bufferLength > 0) {
        console.log(`⏳ Small buffer (${bufferLength} chars), waiting for more content...`);
        // Don't flush yet - let the buffer continue accumulating
        // The regular timeout will flush if no more audio comes
      } else {
        console.log('📭 Buffer empty, nothing to process');
      }
    };

    if (connectionState === LiveConnectionState.OPEN) {
      console.log('🔗 Registering event listeners for transcript and audio data');
      microphone.addEventListener(MicrophoneEvents.DataAvailable, onData);

      if (isMultiMode) {
        // Multi mode - register winner event handler
        console.log('📡 Multi-mode: Registering winner event listener');
        const cleanup = multiContext.onWinnerSelected(handleWinnerTranscript);

        // Only start microphone if it's not already recording
        if (microphone.state !== "recording") {
          console.log('🎤 Starting microphone...');
          startMicrophone();
        }

        return () => {
          cleanup();
          microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
        };
      } else {
        // Single mode - register transcript events
        console.log('📡 Single-mode: Registering transcript event listeners');
        const conn = singleContext.connection;
        if (conn) {
          conn.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
          conn.addListener(LiveTranscriptionEvents.UtteranceEnd, onUtteranceEnd);
        }

        // Only start microphone if it's not already recording
        if (microphone.state !== "recording") {
          console.log('🎤 Starting microphone...');
          startMicrophone();
        }

        return () => {
          if (conn) {
            conn.removeListener(LiveTranscriptionEvents.Transcript, onTranscript);
            conn.removeListener(LiveTranscriptionEvents.UtteranceEnd, onUtteranceEnd);
          }
          microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
        };
      }
    } else {
      console.log('⚠️ Connection not open, state:', connectionState);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, isMultiMode]); // Added isMultiMode to dependencies

  // Start/stop usage timer based on connection and microphone state
  useEffect(() => {
    const isActive =
      connectionState === LiveConnectionState.OPEN &&
      microphoneState === MicrophoneState.Open &&
      !isTimeExpired;

    if (isActive) {
      startTimer();
    } else {
      stopTimer();
    }
  }, [connectionState, microphoneState, isTimeExpired, startTimer, stopTimer]);

  // Disconnect on time expiry
  useEffect(() => {
    if (isTimeExpired) {
      if (microphoneState === MicrophoneState.Open) {
        microphone?.pause();
      }
      if (connectionState === LiveConnectionState.OPEN) {
        if (isMultiMode) {
          multiContext.disconnectFromDeepgram();
        } else {
          singleContext.connection?.finish();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimeExpired]);

  // Scroll to bottom when transcript updates
  useEffect(() => {
    // Ensure scrolling happens after the DOM update
    const scrollToBottom = () => {
      if (isFullscreen) {
        if (fullscreenTranscriptRef.current) {
          fullscreenTranscriptRef.current.scrollTop = fullscreenTranscriptRef.current.scrollHeight;
        }
      } else {
        if (transcriptContainerRef.current) {
          transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
        }
      }
    };

    // Use requestAnimationFrame to ensure scrolling happens after render
    requestAnimationFrame(scrollToBottom);
  }, [transcriptBlocks, currentInterimText, isFullscreen]);

  useEffect(() => {
    // Keep-alive is only needed for single mode
    // Multi mode handles keep-alive internally in MultiDeepgramContextProvider
    if (isMultiMode) return;

    const conn = singleContext.connection;
    if (!conn) return;

    if (
      microphoneState !== MicrophoneState.Open &&
      connectionState === LiveConnectionState.OPEN
    ) {
      conn.keepAlive();

      keepAliveInterval.current = setInterval(() => {
        conn.keepAlive();
      }, 10000);
    } else {
      clearInterval(keepAliveInterval.current);
    }

    return () => {
      clearInterval(keepAliveInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState, connectionState, isMultiMode]);


  /**
   * Render a single TranscriptBlock with original text and translations.
   * Supports both light and dark mode.
   * Shows RAG correction indicator if vocabulary correction was applied.
   */
  const renderTranscriptBlock = (block: TranscriptBlock) => {
    // Debug: log when rendering blocks
    console.log(`🎨 Rendering block: ${block.id}, text: "${block.original.text.substring(0, 30)}...", ragCorrected: ${!!block.ragCorrected}`);
    
    return (
      <div key={block.id} className="mb-6 border-l-2 border-[#0D9488] pl-4 hover:border-[#14B8A6] transition-colors duration-200">
        {/* Original text - smaller, muted */}
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-start gap-2">
          <div className="flex-1">
            <span className="font-mono text-xs uppercase tracking-wide mr-2 text-[#0D9488]">
              [{block.original.language}]
            </span>
            {block.original.text}
          </div>
          
          {/* RAG Correction Indicator */}
          {block.ragCorrected && (
            <div className="group relative flex-shrink-0">
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 cursor-help"
                title="Vocabulary correction applied"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.061l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
                </svg>
                ✨
              </span>
              
              {/* Hover tooltip showing original text */}
              <div className="absolute right-0 top-full mt-1 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                <div className="bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 max-w-xs whitespace-normal border border-gray-700">
                  <div className="font-medium text-amber-400 mb-1">Original (before correction):</div>
                  <div className="text-gray-300 italic">&quot;{block.ragCorrected.originalText}&quot;</div>
                  {block.ragCorrected.correctedTerms.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Corrected terms:</div>
                      <div className="flex flex-wrap gap-1">
                        {block.ragCorrected.correctedTerms.map((term, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px]">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Translations - larger, more prominent */}
        {block.translations.map(translation => (
          <div
            key={`${block.id}-${translation.language}`}
            className="text-lg text-gray-900 dark:text-white mb-2 font-medium"
          >
            <span className="text-xs text-[#14B8A6] mr-2 font-mono">
              {translation.language.toUpperCase()}:
            </span>
            {translation.text}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Fullscreen Mode - Unified Transcript */}
      {isFullscreen ? (
        <div className="fixed inset-0 bg-white dark:bg-[#0D0D0D] z-50 flex flex-col transition-colors duration-200">
          {/* Fullscreen Header */}
          <div className="border-b border-gray-200 dark:border-white/[0.05] px-6 py-4 flex items-center justify-between bg-white/80 dark:bg-[#0D0D0D]/80 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionState === LiveConnectionState.OPEN ? 'bg-[#10B981]' :
                connectionState === LiveConnectionState.CONNECTING ? 'bg-[#F59E0B]' : 'bg-gray-400'
              }`} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {connectionState === LiveConnectionState.OPEN ? 'Connected' :
                 connectionState === LiveConnectionState.CONNECTING ? 'Connecting...' : 'Disconnected'}
              </span>
              <div className="ml-6 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Speaking:</span>
                  <MultiLanguageSelector
                    type="spoken"
                    selectedLanguages={sessionLanguages.spoken}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, spoken: languages }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-500">Translate:</span>
                  <MultiLanguageSelector
                    type="display"
                    selectedLanguages={sessionLanguages.display}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, display: languages }))}
                  />
                </div>
              </div>

              {/* Mode Toggle */}
              {sessionLanguages.spoken.length > 1 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/[0.05]">
                  <TranscriptionModeToggle
                    mode={transcriptionMode}
                    onModeChange={setTranscriptionMode}
                    spokenLanguages={sessionLanguages.spoken}
                    isConnected={connectionState === LiveConnectionState.OPEN}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* RAG Upload - Compact Mode in Fullscreen */}
              <RAGUpload compact uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles} isRAGEnabled={isRAGEnabled} setIsRAGEnabled={setIsRAGEnabled} />

              <button
                onClick={() => setIsFullscreen(false)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Exit Fullscreen
              </button>
            </div>
          </div>

          {/* Unified Transcript - Fullscreen */}
          <div
            ref={fullscreenTranscriptRef}
            className="flex-1 min-h-0 p-12 overflow-y-auto"
          >
            {transcriptBlocks.length > 0 || currentInterimText ? (
              <div className="max-w-4xl mx-auto">
                {transcriptBlocks.map(renderTranscriptBlock)}

                {/* Buffer and Interim text */}
                {(currentSentenceBuffer.current.text || currentInterimText) && (
                  <div className="text-gray-400 dark:text-gray-500 italic">
                    {currentSentenceBuffer.current.text} {currentInterimText}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-500">
                <div className="text-center">
                  <svg className="w-24 h-24 mx-auto mb-4 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-2xl text-gray-600 dark:text-gray-500">Start speaking to see transcription and translation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Normal Mode */
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Control Panel */}
          <div className="relative z-30 rounded-2xl bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] p-5 backdrop-blur-sm shadow-sm dark:shadow-none">
            <div className="flex flex-col gap-4">
              {/* Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    connectionState === LiveConnectionState.OPEN ? 'bg-[#10B981]' :
                    connectionState === LiveConnectionState.CONNECTING ? 'bg-[#F59E0B] animate-pulse' : 'bg-gray-500'
                  }`} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {connectionState === LiveConnectionState.OPEN ? 'Connected' :
                     connectionState === LiveConnectionState.CONNECTING ? 'Connecting...' : 'Disconnected'}
                  </span>
                  {connectionState === LiveConnectionState.OPEN && (
                    <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-md bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-medium">
                      {sessionLanguages.spoken.length === 1
                        ? `${sessionLanguages.spoken[0].toUpperCase()} mode`
                        : 'Multi-language mode'}
                    </span>
                  )}
                  {/* Reconnect Button - shows when disconnected */}
                  {connectionState === LiveConnectionState.CLOSED && microphoneState === MicrophoneState.Ready && (
                    <button
                      onClick={handleManualReconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reconnect
                    </button>
                  )}
                </div>

                {/* RAG Upload - Compact Mode */}
                <RAGUpload compact uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles} isRAGEnabled={isRAGEnabled} setIsRAGEnabled={setIsRAGEnabled} />

                <UsageIndicator />

                <button
                  onClick={() => setIsFullscreen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Fullscreen
                </button>
              </div>

              {/* Language Selectors Row */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Speaking:
                  </label>
                  <MultiLanguageSelector
                    type="spoken"
                    selectedLanguages={sessionLanguages.spoken}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, spoken: languages }))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Translate to:
                  </label>
                  <MultiLanguageSelector
                    type="display"
                    selectedLanguages={sessionLanguages.display}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, display: languages }))}
                  />
                </div>
              </div>

              {/* Mode Toggle */}
              {sessionLanguages.spoken.length > 1 && (
                <div className="mt-4">
                  <TranscriptionModeToggle
                    mode={transcriptionMode}
                    onModeChange={setTranscriptionMode}
                    spokenLanguages={sessionLanguages.spoken}
                    isConnected={connectionState === LiveConnectionState.OPEN}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Unified Transcript Interface */}
          <div className="relative rounded-2xl bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] overflow-hidden backdrop-blur-sm shadow-sm dark:shadow-none">
            <TimeExpiredOverlay />
            <div className="bg-gray-50 dark:bg-white/[0.02] px-8 py-5 border-b border-gray-200 dark:border-white/[0.05]">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                <svg className="w-6 h-6 text-[#0D9488]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                Live Transcript
              </h2>
            </div>
            <div
              ref={transcriptContainerRef}
              className="h-96 p-8 overflow-y-auto"
            >
              {transcriptBlocks.length > 0 || currentInterimText ? (
                <div>
                  {transcriptBlocks.map(renderTranscriptBlock)}

                  {/* Buffer and Interim text */}
                  {(currentSentenceBuffer.current.text || currentInterimText) && (
                    <div className="text-gray-400 dark:text-gray-500 italic text-sm mt-4">
                      {currentSentenceBuffer.current.text} {currentInterimText}
                    </div>
                  )}
                </div>
              ) : microphoneState === MicrophoneState.Error ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-lg text-red-400 font-medium">Microphone Access Required</p>
                    <p className="text-sm text-gray-500 mt-2 max-w-md">
                      Please allow microphone access to use real-time transcription. 
                      Check the audio input section below for details.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <p className="text-lg text-gray-600 dark:text-gray-500">Start speaking to see transcription and translation</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Visualizer */}
          <div className="rounded-2xl bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] p-4 backdrop-blur-sm shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  microphoneState === MicrophoneState.Error 
                    ? 'bg-red-500/10' 
                    : 'bg-[#0D9488]/10'
                }`}>
                  <svg className={`w-4 h-4 ${
                    microphoneState === MicrophoneState.Error 
                      ? 'text-red-400' 
                      : 'text-[#0D9488]'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Audio Input</span>
              </div>
              
              <div className="flex items-center">
                {microphoneState === MicrophoneState.Error ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-red-500 dark:text-red-400 max-w-xs truncate">
                      {errorMessage || 'Microphone error'}
                    </span>
                    <button
                      onClick={retrySetup}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors shadow-sm"
                    >
                      Retry
                    </button>
                  </div>
                ) : microphoneState === MicrophoneState.SettingUp ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-teal-600 dark:text-teal-400">Requesting permission...</span>
                  </div>
                ) : microphone ? (
                  <div className="flex items-center gap-2">
                    <Visualizer microphone={microphone} height={40} />
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Recording</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">No microphone detected</span>
                )}
              </div>
            </div>
            
            {/* Expanded error message */}
            {microphoneState === MicrophoneState.Error && errorMessage && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{errorMessage}</p>
                <p className="text-xs text-red-500/70 mt-1">
                  Tip: Click the lock/camera icon in your browser's address bar to manage permissions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default App;