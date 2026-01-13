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
import { TranscriptionMode, WinnerTranscript } from "../types/multiDeepgram";

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
    text: string;      // The original transcribed text
    language: string;  // Dominant language detected (e.g., "en", "ko")
  };
  translations: {
    language: string;  // Target language code (e.g., "es", "ja")
    text: string | null;  // Translated text (null while pending)
  }[];
};

const App: () => JSX.Element = () => {
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

  // Use the appropriate context based on mode
  const isMultiMode = transcriptionMode === "multi-detect";
  const connectionState = isMultiMode ? multiContext.overallState : singleContext.connectionState;

  const { setupMicrophone, microphone, startMicrophone, microphoneState, errorMessage, retrySetup } =
    useMicrophone();

  // Refs for managing transcription flow
  const keepAliveInterval = useRef<any>();
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenTranscriptRef = useRef<HTMLDivElement>(null);
  const processedFinalTexts = useRef<Set<string>>(new Set());
  // Buffer now tracks language metadata for multilingual code-switching support
  const currentSentenceBuffer = useRef<TranscriptSegment>({ text: "", languages: [] });
  const bufferTimeout = useRef<NodeJS.Timeout | null>(null); // Timeout for processing buffered text

  // Translation queue management - updated to work with TranscriptBlocks
  const translationQueue = useRef<{
    blockId: string;                     // ID of the TranscriptBlock to update
    text: string;                        // Text to translate
    sourceLanguage: "auto";              // Always "auto" for multilingual support
    targetLanguage: string;              // Target translation language
  }[]>([]);
  const isProcessingTranslation = useRef<boolean>(false);

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
  const processBufferedText = () => {
    if (currentSentenceBuffer.current.text.trim().length > 10) { // Only if substantial content
      const bufferedText = currentSentenceBuffer.current.text.trim();
      const bufferedLanguages = currentSentenceBuffer.current.languages;

      // Create a transcript block with the buffered text
      const block = createTranscriptBlock(bufferedText + ".", bufferedLanguages);

      // Add block to transcript
      setTranscriptBlocks(prev => [...prev, block]);

      // Queue translations for all display languages
      sessionLanguages.display.forEach(targetLang => {
        queueTranslation(block.id, block.original.text, targetLang);
      });

      currentSentenceBuffer.current = { text: "", languages: [] };
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
        console.log('🔍 Deciding connection mode:', {
          isMultiMode,
          spokenLanguagesCount: sessionLanguages.spoken.length,
          willUseMulti: isMultiMode && sessionLanguages.spoken.length > 1
        });

        if (isMultiMode && sessionLanguages.spoken.length > 1) {
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
            endpointing: 100,
            utterance_end_ms: 1500,
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
          endpointing: 100,
          utterance_end_ms: 1500,
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

  // More robust sentence detection that handles incomplete transcriptions
  const detectCompleteSentences = (text: string): string[] => {
    if (!text.trim()) return [];
    
    // Use a more sophisticated approach for sentence detection
    // that's better suited for real-time transcription
    const sentences: string[] = [];
    
    // Split on strong sentence boundaries (.!?)
    // But be more careful about what we consider complete
    const potentialSentences = text.split(/([.!?]+\s+)/g).filter(s => s.trim());
    
    let currentSentence = '';
    
    for (let i = 0; i < potentialSentences.length; i++) {
      const part = potentialSentences[i].trim();
      
      if (!part) continue;
      
      currentSentence += part + ' ';
      
      // Check if this part ends with sentence punctuation
      if (part.match(/[.!?]+$/)) {
        const trimmedSentence = currentSentence.trim();
        
        // Only accept as complete if it meets quality criteria:
        // 1. Has substantial length
        // 2. Contains at least one word with 2+ characters
        // 3. Doesn't start with obvious continuation words
        // 4. Has proper sentence structure
        if (trimmedSentence.length > 5 && 
            trimmedSentence.match(/\b\w{2,}\b/) && // At least one substantial word
            !trimmedSentence.match(/^(and|but|or|so|then|also|however|therefore|because|since|after|before|when|while|if|unless|although|though)\s/i) &&
            !trimmedSentence.match(/^[a-z]/) && // Should start with capital letter
            trimmedSentence.split(' ').length >= 2) { // At least 2 words
          
          sentences.push(trimmedSentence);
          currentSentence = '';
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

      // Set timeout to process buffer after 3 seconds
      if (bufferTimeout.current) {
        clearTimeout(bufferTimeout.current);
      }

      bufferTimeout.current = setTimeout(() => {
        if (currentSentenceBuffer.current.text.trim().length > 10) {
          const bufferedText = currentSentenceBuffer.current.text.trim();
          const bufferedLanguages = currentSentenceBuffer.current.languages;

          const block = createTranscriptBlock(bufferedText + ".", bufferedLanguages);
          setTranscriptBlocks(prev => [...prev, block]);

          sessionLanguages.display.forEach(targetLang => {
            queueTranslation(block.id, block.original.text, targetLang);
          });

          currentSentenceBuffer.current = { text: "", languages: [] };
        }
      }, 3000);
    }

    // Clear interim text
    setCurrentInterimText("");
  }, [sessionLanguages, detectCompleteSentences, createTranscriptBlock]);

  /**
   * Add translation to queue (non-blocking).
   * Updated to work with TranscriptBlocks - queues a single text for translation.
   */
  const queueTranslation = (blockId: string, text: string, targetLanguage: string) => {
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
  };

  useEffect(() => {
    if (!microphone) return;

    const onData = (e: BlobEvent) => {
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
          console.log('🎤 Audio chunk sent:', e.data.size, 'bytes');
        } catch (error) {
          console.warn('⚠️ Failed to send audio data:', error);
        }
      } else {
        console.log('⚠️ Not sending audio - size:', e.data.size, 'state:', connectionState);
      }
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const { is_final: isFinal } = data;
      const alternative = data.channel.alternatives[0];
      let thisCaption = alternative.transcript.trim();

      console.log(`📡 Transcript received - isFinal: ${isFinal}, text: "${thisCaption}"`);

      if (thisCaption === "") {
        console.log('⚠️ Empty transcript, ignoring');
        return;
      }
      
      // Extract language metadata from word-level detection (Nova-2 multilingual)
      // Each word can have a different language when code-switching occurs
      const words = (alternative as any).words || [];
      const detectedLanguages: string[] = [];

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
          newBlocks.forEach(block => {
            sessionLanguages.display.forEach(targetLang => {
              queueTranslation(block.id, block.original.text, targetLang);
            });
          });

          // Keep any remaining text in buffer (preserving languages for next segment)
          currentSentenceBuffer.current = { text: remainingText, languages: combinedLanguages };
        } else {
          // No complete sentences detected, keep building in buffer with language info
          currentSentenceBuffer.current = { text: textToProcess, languages: combinedLanguages };
          
          // Set a timeout to process buffered text if no new transcription comes
          // This helps capture incomplete but meaningful segments
          if (bufferTimeout.current) {
            clearTimeout(bufferTimeout.current);
          }
          
          bufferTimeout.current = setTimeout(() => {
            processBufferedText();
          }, 3000); // Wait 3 seconds before processing buffered text
        }
        
        // Clear interim display
        setCurrentInterimText("");
        
      } else {
        // Show interim results without breaking sentences
        setCurrentInterimText(thisCaption);
      }
    };

    // Handler for when Deepgram detects the speaker has paused/stopped talking
    const onUtteranceEnd = () => {
      console.log('🎤 Speaker pause detected, processing buffer immediately...');

      // If there's text in the buffer, process it immediately
      if (currentSentenceBuffer.current.text.trim().length > 0) {
        const langInfo = currentSentenceBuffer.current.languages.length > 0 
          ? ` [${currentSentenceBuffer.current.languages.join(', ')}]` 
          : '';
        console.log(`📝 Buffer content${langInfo}: "${currentSentenceBuffer.current.text.trim()}"`);

        // Clear any pending timeout since we're processing now
        if (bufferTimeout.current) {
          clearTimeout(bufferTimeout.current);
          bufferTimeout.current = null;
        }

        // Process the buffered text immediately
        processBufferedText();
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
   * Original text is smaller and brighter, translations are larger and more prominent.
   */
  const renderTranscriptBlock = (block: TranscriptBlock) => {
    return (
      <div key={block.id} className="mb-6 border-l-2 border-blue-500 pl-4">
        {/* Original text - smaller, brighter */}
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 opacity-75">
          <span className="font-mono text-xs uppercase tracking-wide mr-2">
            [{block.original.language}]
          </span>
          {block.original.text}
        </div>

        {/* Translations - larger, more prominent */}
        {block.translations.map(translation => (
          <div
            key={`${block.id}-${translation.language}`}
            className="text-lg text-gray-900 dark:text-white mb-2 font-medium"
          >
            <span className="text-xs text-gray-400 mr-2">
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
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col transition-colors duration-200">
          {/* Fullscreen Header */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between transition-colors duration-200">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionState === LiveConnectionState.OPEN ? 'bg-green-500' :
                connectionState === LiveConnectionState.CONNECTING ? 'bg-yellow-500' : 'bg-gray-400'
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
                  <span className="text-xs text-gray-500 dark:text-gray-400">Translate:</span>
                  <MultiLanguageSelector
                    type="display"
                    selectedLanguages={sessionLanguages.display}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, display: languages }))}
                  />
                </div>
              </div>

              {/* Mode Toggle */}
              {sessionLanguages.spoken.length > 1 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <TranscriptionModeToggle
                    mode={transcriptionMode}
                    onModeChange={setTranscriptionMode}
                    spokenLanguages={sessionLanguages.spoken}
                    isConnected={connectionState === LiveConnectionState.OPEN}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setIsFullscreen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit Fullscreen
            </button>
          </div>

          {/* Unified Transcript - Fullscreen */}
          <div
            ref={fullscreenTranscriptRef}
            className="flex-1 min-h-0 p-12 overflow-y-auto transition-colors duration-200"
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
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <svg className="w-24 h-24 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-2xl">Start speaking to see transcription and translation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Normal Mode */
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Control Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
            <div className="flex flex-col gap-4">
              {/* Status Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    connectionState === LiveConnectionState.OPEN ? 'bg-green-500' :
                    connectionState === LiveConnectionState.CONNECTING ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {connectionState === LiveConnectionState.OPEN ? 'Connected' :
                     connectionState === LiveConnectionState.CONNECTING ? 'Connecting...' : 'Disconnected'}
                  </span>
                  {connectionState === LiveConnectionState.OPEN && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {sessionLanguages.spoken.length === 1
                        ? `${sessionLanguages.spoken[0].toUpperCase()} mode`
                        : 'Multi-language mode'}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Speaking:
                  </label>
                  <MultiLanguageSelector
                    type="spoken"
                    selectedLanguages={sessionLanguages.spoken}
                    onChange={(languages) => setSessionLanguages(prev => ({ ...prev, spoken: languages }))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
            <div className="bg-gray-50 dark:bg-gray-700 px-8 py-5 border-b border-gray-200 dark:border-gray-600 transition-colors duration-200">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                Live Transcript
              </h2>
            </div>
            <div
              ref={transcriptContainerRef}
              className="h-96 p-8 overflow-y-auto transition-colors duration-200"
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
                    <svg className="w-16 h-16 mx-auto mb-4 text-red-400 dark:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-lg text-red-600 dark:text-red-400 font-medium">Microphone Access Required</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md">
                      Please allow microphone access to use real-time transcription. 
                      Check the audio input section below for details.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <p className="text-lg">Start speaking to see transcription and translation</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Visualizer */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  microphoneState === MicrophoneState.Error 
                    ? 'bg-red-50 dark:bg-red-900/30' 
                    : 'bg-blue-50 dark:bg-blue-900/30'
                }`}>
                  <svg className={`w-4 h-4 ${
                    microphoneState === MicrophoneState.Error 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-blue-600 dark:text-blue-400'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Audio Input</span>
              </div>
              
              <div className="flex items-center">
                {microphoneState === MicrophoneState.Error ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
                      {errorMessage || 'Microphone error'}
                    </span>
                    <button
                      onClick={retrySetup}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : microphoneState === MicrophoneState.SettingUp ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-blue-600 dark:text-blue-400">Requesting permission...</span>
                  </div>
                ) : microphone ? (
                  <div className="flex items-center gap-2">
                    <Visualizer microphone={microphone} height={40} />
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Recording</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">No microphone detected</span>
                )}
              </div>
            </div>
            
            {/* Expanded error message */}
            {microphoneState === MicrophoneState.Error && errorMessage && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
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