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
import {
  MicrophoneEvents,
  MicrophoneState,
  useMicrophone,
} from "../context/MicrophoneContextProvider";
import Visualizer from "./Visualizer";
import LanguageSelector, { Language, languages } from "./LanguageSelector";
import { detectSentences, processSentencesForTranslation, translateBySentences, cacheUtils } from "../services/translationService";

const App: () => JSX.Element = () => {
  // Translation batching configuration - process up to 3 sentences at once for better performance
  const BATCH_SIZE = 3;

  // State management for sentence-based transcription and translation
  const [completeSentences, setCompleteSentences] = useState<string[]>([]);
  const [translatedSentences, setTranslatedSentences] = useState<string[]>([]);
  const [currentInterimText, setCurrentInterimText] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(languages[0]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();
  
  // Refs for managing transcription flow
  const keepAliveInterval = useRef<any>();
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenTranscriptionRef = useRef<HTMLDivElement>(null);
  const fullscreenTranslationRef = useRef<HTMLDivElement>(null);
  const translationTimeout = useRef<NodeJS.Timeout | null>(null);
  const processedFinalTexts = useRef<Set<string>>(new Set());
  const currentSentenceBuffer = useRef<string>("");
  const lastProcessedLength = useRef<number>(0);
  const currentSentenceCount = useRef<number>(0); // Track current sentence count reliably
  const currentLanguageRef = useRef<string>(selectedLanguage.code); // Track current language
  const bufferTimeout = useRef<NodeJS.Timeout | null>(null); // Timeout for processing buffered text
  
  // Translation queue management
  const translationQueue = useRef<{
    sentences: string[];
    language: string;
    index: number;
  }[]>([]);
  const isProcessingTranslation = useRef<boolean>(false);
  
  // Clear all transcription and translation data
  const clearAllData = () => {
    setCompleteSentences([]);
    setTranslatedSentences([]);
    setCurrentInterimText("");
    currentSentenceBuffer.current = "";
    currentSentenceCount.current = 0;
    processedFinalTexts.current.clear();
    translationQueue.current = [];
    isProcessingTranslation.current = false;
    
    // Clear any pending timeouts
    if (bufferTimeout.current) {
      clearTimeout(bufferTimeout.current);
      bufferTimeout.current = null;
    }
  };

  // Process buffered text after a delay (fallback for incomplete sentences)
  const processBufferedText = () => {
    if (currentSentenceBuffer.current.trim().length > 10) { // Only if substantial content
      const bufferedText = currentSentenceBuffer.current.trim();
      
      // Add as a sentence even if it doesn't meet strict criteria
      // This helps capture incomplete but meaningful segments
      const startingIndex = currentSentenceCount.current;
      currentSentenceCount.current += 1;
      
      setCompleteSentences(prev => [...prev, bufferedText + "."]);
      setTranslatedSentences(prev => [...prev, ""]);
      queueTranslation([bufferedText + "."], currentLanguageRef.current, startingIndex);
      
      currentSentenceBuffer.current = "";
    }
  };
  
  useEffect(() => {
    setupMicrophone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (microphoneState === MicrophoneState.Ready) {
      connectToDeepgram({
        model: "nova-3",
        interim_results: true,
        smart_format: true,
        filler_words: true,
        punctuate: true, // Enable Deepgram's built-in punctuation for better sentence detection
        utterance_end_ms: 1500, // Detect pauses after 1.5 seconds for better sentence detection
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState]);

  // Update the current language ref whenever selectedLanguage changes
  useEffect(() => {
    const oldLanguage = currentLanguageRef.current;
    currentLanguageRef.current = selectedLanguage.code;
    
    // If language changed, clear everything and start fresh
    if (oldLanguage !== selectedLanguage.code) {
      clearAllData();
    }
    
    // Preload common phrases for the new language in the background using backend cache
    if (selectedLanguage.code !== 'en') {
      cacheUtils.preloadCommonPhrases(selectedLanguage.code).catch(error => {
        console.warn('Failed to preload common phrases:', error);
      });
    }
  }, [selectedLanguage.code]);

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

  // Enhanced translation function with context - now completely asynchronous
  const translateSentencesWithContext = async (sentences: string[], targetLanguage: string) => {
    if (sentences.length === 0) return [];
    
    try {
      // For context, include the last 2 sentences (if available) plus the new sentences
      const contextSentences = completeSentences.slice(-2);
      const textWithContext = [...contextSentences, ...sentences].join(' ');
      
      const result = await translateBySentences({
        text: textWithContext,
        sourceLanguage: "auto",
        targetLanguage: targetLanguage
      });
      
      // Extract only the new translations (skip the context part)
      const translatedWithContext = result.translatedText.split(/[.!?]+/).filter(s => s.trim());
      const newTranslations = translatedWithContext.slice(-sentences.length);
      
      // Ensure we have proper sentence endings
      return newTranslations.map((translation, index) => {
        const originalSentence = sentences[index];
        const lastChar = originalSentence.slice(-1);
        return translation.trim() + (lastChar.match(/[.!?]/) ? lastChar : '.');
      });
      
    } catch (error) {
      console.error("Translation error:", error);
      return sentences.map(() => "Translation failed");
    }
  };

  // Non-blocking translation queue processor with batching
  const processTranslationQueue = async () => {
    if (isProcessingTranslation.current || translationQueue.current.length === 0) {
      return;
    }

    isProcessingTranslation.current = true;

    try {
      while (translationQueue.current.length > 0) {
        // Take multiple items from queue (up to BATCH_SIZE)
        const batchSize = Math.min(BATCH_SIZE, translationQueue.current.length);
        const batch = translationQueue.current.splice(0, batchSize);

        if (batch.length === 0) break;

        // Check if all items in batch are for the same language
        const language = batch[0].language;
        const sameLanguage = batch.every(item => item.language === language);

        if (!sameLanguage) {
          // If different languages detected, put extras back and process first item only
          console.log('⚠️ Language mismatch in batch, processing separately');
          translationQueue.current.unshift(...batch.slice(1));
          batch.length = 1;
        }

        // Combine all sentences from the batch
        const allSentences = batch.flatMap(item => item.sentences);
        const startIndex = batch[0].index;

        console.log(`🔄 Batch translating ${allSentences.length} sentence(s) to ${language}`);

        // ONE API call for all sentences in the batch
        const translations = await translateSentencesWithContext(allSentences, language);

        // Update all translated sentences at once - use functional update to avoid race conditions
        setTranslatedSentences(prev => {
          const newTranslatedSentences = [...prev];

          // Ensure we have enough slots
          while (newTranslatedSentences.length < startIndex + translations.length) {
            newTranslatedSentences.push("");
          }

          // Insert all translations at the correct positions
          translations.forEach((translation, i) => {
            newTranslatedSentences[startIndex + i] = translation;
          });

          return newTranslatedSentences;
        });

        // Slightly longer delay after batch since we processed more
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("Translation queue processing error:", error);
    } finally {
      isProcessingTranslation.current = false;
    }
  };

  // Add translation to queue (non-blocking)
  const queueTranslation = (sentences: string[], targetLanguage: string, startIndex: number) => {
    // Create a unique key for this translation request
    const requestKey = `${startIndex}-${sentences.length}-${sentences.join('|').substring(0, 50)}`;
    
    // Check if we already have a translation request for this exact content
    const existingRequest = translationQueue.current.find(item => {
      const existingKey = `${item.index}-${item.sentences.length}-${item.sentences.join('|').substring(0, 50)}`;
      return existingKey === requestKey;
    });
    
    if (existingRequest) {
      return;
    }

    // Also check if these sentences are already translated
    let alreadyTranslated = true;
    for (let i = 0; i < sentences.length; i++) {
      const translationIndex = startIndex + i;
      const currentTranslation = translatedSentences[translationIndex];
      if (!currentTranslation || currentTranslation === "") {
        alreadyTranslated = false;
        break;
      }
    }
    
    if (alreadyTranslated) {
      return;
    }

    translationQueue.current.push({
      sentences,
      language: targetLanguage,
      index: startIndex
    });

    // Start processing queue asynchronously (fire and forget)
    setTimeout(() => processTranslationQueue(), 0);
  };

  useEffect(() => {
    if (!microphone) return;
    if (!connection) return;

    const onData = (e: BlobEvent) => {
      // iOS SAFARI FIX:
      // Prevent packetZero from being sent. If sent at size 0, the connection will close. 
      if (e.data.size > 0) {
        connection?.send(e.data);
      }
    };

    const onTranscript = (data: LiveTranscriptionEvent) => {
      const { is_final: isFinal } = data;
      let thisCaption = data.channel.alternatives[0].transcript.trim();

      if (thisCaption === "") return;
      
      if (isFinal) {
        // Prevent duplicate processing
        if (processedFinalTexts.current.has(thisCaption)) {
          return;
        }
        
        processedFinalTexts.current.add(thisCaption);
        
        // Combine buffer with new text
        const textToProcess = (currentSentenceBuffer.current + " " + thisCaption).trim();
        
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
          
          // Update the sentence count ref immediately
          const startingIndex = currentSentenceCount.current;
          currentSentenceCount.current += newCompleteSentences.length;
          
          // Add all detected sentences to the state
          setCompleteSentences(prev => [...prev, ...newCompleteSentences]);

          // Add empty placeholders for the new sentences
          setTranslatedSentences(prev => {
            const newPlaceholders = new Array(newCompleteSentences.length).fill("");
            return [...prev, ...newPlaceholders];
          });
          
          // Queue translation for the new sentences
          queueTranslation(newCompleteSentences, currentLanguageRef.current, startingIndex);
          
          // Keep any remaining text in buffer
          currentSentenceBuffer.current = remainingText;
        } else {
          // No complete sentences detected, keep building in buffer
          currentSentenceBuffer.current = textToProcess;
          
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

    if (connectionState === LiveConnectionState.OPEN) {
      connection.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone.addEventListener(MicrophoneEvents.DataAvailable, onData);

      // Only start microphone if it's not already recording
      if (microphone.state !== "recording") {
        startMicrophone();
      }
    }

    return () => {
      connection.removeListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]); // Removed selectedLanguage.code from dependencies

  // Generate display text for transcription
  const displayTranscription = () => {
    const sentencesText = completeSentences.join('\n\n');
    const bufferText = currentSentenceBuffer.current;
    const interimText = currentInterimText;
    
    let result = sentencesText;
    
    if (bufferText) {
      result += (result ? '\n\n' : '') + bufferText;
    }
    
    if (interimText) {
      result += (bufferText ? ' ' : (result ? '\n\n' : '')) + interimText;
    }
    
    return result;
  };

  // Generate display text for translation
  const displayTranslation = () => {
    return translatedSentences.join('\n\n');
  };

  // Scroll to bottom when transcription updates
  useEffect(() => {
    // Ensure scrolling happens after the DOM update
    const scrollToBottom = () => {
      if (isFullscreen) {
        // Scroll fullscreen mode containers
        if (fullscreenTranscriptionRef.current) {
          fullscreenTranscriptionRef.current.scrollTop = fullscreenTranscriptionRef.current.scrollHeight;
        }
        
        if (fullscreenTranslationRef.current) {
          fullscreenTranslationRef.current.scrollTop = fullscreenTranslationRef.current.scrollHeight;
        }
      } else {
        // Scroll normal mode containers
        if (transcriptionContainerRef.current) {
          transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
        }
        
        if (translationContainerRef.current) {
          translationContainerRef.current.scrollTop = translationContainerRef.current.scrollHeight;
        }
      }
    };
    
    // Use requestAnimationFrame to ensure scrolling happens after render
    requestAnimationFrame(scrollToBottom);
  }, [completeSentences, currentInterimText, translatedSentences, isFullscreen]);

  useEffect(() => {
    if (!connection) return;

    if (
      microphoneState !== MicrophoneState.Open &&
      connectionState === LiveConnectionState.OPEN
    ) {
      connection.keepAlive();

      keepAliveInterval.current = setInterval(() => {
        connection.keepAlive();
      }, 10000);
    } else {
      clearInterval(keepAliveInterval.current);
    }

    return () => {
      clearInterval(keepAliveInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState, connectionState]);

  // Set up mutation observer for better scroll handling
  useEffect(() => {
    // Create a function to scroll to bottom
    const scrollToBottom = (element: HTMLElement) => {
      element.scrollTop = element.scrollHeight;
    };
    
    const transcriptionObserver = new MutationObserver(() => {
      if (isFullscreen && fullscreenTranscriptionRef.current) {
        scrollToBottom(fullscreenTranscriptionRef.current);
      } else if (!isFullscreen && transcriptionContainerRef.current) {
        scrollToBottom(transcriptionContainerRef.current);
      }
    });
    
    const translationObserver = new MutationObserver(() => {
      if (isFullscreen && fullscreenTranslationRef.current) {
        scrollToBottom(fullscreenTranslationRef.current);
      } else if (!isFullscreen && translationContainerRef.current) {
        scrollToBottom(translationContainerRef.current);
      }
    });
    
    // Configure and start observers
    const observerConfig = { childList: true, subtree: true, characterData: true };
    
    // Start observers based on current mode
    if (isFullscreen) {
      if (fullscreenTranscriptionRef.current) {
        transcriptionObserver.observe(fullscreenTranscriptionRef.current, observerConfig);
      }
      if (fullscreenTranslationRef.current) {
        translationObserver.observe(fullscreenTranslationRef.current, observerConfig);
      }
    } else {
      if (transcriptionContainerRef.current) {
        transcriptionObserver.observe(transcriptionContainerRef.current, observerConfig);
      }
      if (translationContainerRef.current) {
        translationObserver.observe(translationContainerRef.current, observerConfig);
      }
    }
    
    // Clean up observers on unmount
    return () => {
      transcriptionObserver.disconnect();
      translationObserver.disconnect();
    };
  }, [isFullscreen]); // Re-run when fullscreen mode changes

  // Handle language changes - retranslate existing sentences when language changes
  useEffect(() => {
    if (completeSentences.length === 0) return;
    
    // When language changes, retranslate all existing complete sentences
    console.log(`🔄 Language changed to ${selectedLanguage.name}, retranslating existing sentences...`);
    
    const retranslate = async () => {
      try {
        const translations = await translateSentencesWithContext(completeSentences, selectedLanguage.code);
        setTranslatedSentences(translations);
      } catch (error) {
        console.error('Error retranslating sentences:', error);
      }
    };
    
    retranslate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage.code]); // Only depend on language code - completeSentences is accessed from latest state

  return (
    <>
      {/* Fullscreen Mode */}
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
              <div className="ml-6 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Translate to:</label>
                <LanguageSelector 
                  selectedLanguage={selectedLanguage} 
                  onLanguageChange={setSelectedLanguage} 
                />
              </div>
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
          
          {/* Fullscreen Transcription Panels */}
          <div className="flex-1 grid grid-cols-2 overflow-hidden min-h-0">
            {/* Original Transcription - Fullscreen */}
            <div className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col min-h-0 transition-colors duration-200">
              <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Original
                </h2>
              </div>
              <div 
                ref={fullscreenTranscriptionRef}
                className="flex-1 min-h-0 p-8 overflow-y-auto text-gray-900 dark:text-white text-2xl leading-relaxed transition-colors duration-200"
              >
                {displayTranscription() ? (
                  <div className="whitespace-pre-wrap">
                    {displayTranscription()}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <div className="text-center">
                      <svg className="w-20 h-20 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <p className="text-xl">Start speaking to see transcription here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Translation - Fullscreen */}
            <div className="bg-white dark:bg-gray-900 flex flex-col min-h-0 transition-colors duration-200">
              <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  {selectedLanguage.name}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({selectedLanguage.nativeName})</span>
                </h2>
              </div>
              <div 
                ref={fullscreenTranslationRef}
                className={`flex-1 min-h-0 p-8 overflow-y-auto text-gray-900 dark:text-white text-2xl leading-relaxed lang-${selectedLanguage.code} transition-colors duration-200`}
              >
                {displayTranslation() ? (
                  <div className="whitespace-pre-wrap">
                    {displayTranslation()}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <div className="text-center">
                      <svg className="w-20 h-20 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                      <p className="text-xl">Translation will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Normal Mode */
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Control Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  connectionState === LiveConnectionState.OPEN ? 'bg-green-500' : 
                  connectionState === LiveConnectionState.CONNECTING ? 'bg-yellow-500' : 'bg-gray-400'
                }`} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {connectionState === LiveConnectionState.OPEN ? 'Connected' : 
                   connectionState === LiveConnectionState.CONNECTING ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Fullscreen
                </button>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Translate to:</label>
                <LanguageSelector 
                  selectedLanguage={selectedLanguage} 
                  onLanguageChange={setSelectedLanguage} 
                />
              </div>
            </div>
          </div>

          {/* Transcription Interface */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Original Transcription */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
              <div className="bg-gray-50 dark:bg-gray-700 px-8 py-5 border-b border-gray-200 dark:border-gray-600 transition-colors duration-200">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Original
                </h2>
              </div>
              <div 
                ref={transcriptionContainerRef}
                className="h-96 p-8 overflow-y-auto text-gray-900 dark:text-white text-xl leading-relaxed transition-colors duration-200"
              >
                {displayTranscription() ? (
                  <div className="whitespace-pre-wrap">
                    {displayTranscription()}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <div className="text-center">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <p className="text-lg">Start speaking to see transcription here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Translation */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
              <div className="bg-gray-50 dark:bg-gray-700 px-8 py-5 border-b border-gray-200 dark:border-gray-600 transition-colors duration-200">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  {selectedLanguage.name}
                  <span className="text-base font-normal text-gray-500 dark:text-gray-400">({selectedLanguage.nativeName})</span>
                </h2>
              </div>
              <div 
                ref={translationContainerRef}
                className={`h-96 p-8 overflow-y-auto text-gray-900 dark:text-white text-xl leading-relaxed lang-${selectedLanguage.code} transition-colors duration-200`}
              >
                {displayTranslation() ? (
                  <div className="whitespace-pre-wrap">
                    {displayTranslation()}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <div className="text-center">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                      <p className="text-lg">Translation will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Audio Visualizer */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Audio Input</span>
              </div>
              
              <div className="flex items-center">
                {microphone ? (
                  <div className="flex items-center gap-2">
                    <Visualizer microphone={microphone} height={40} />
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Recording</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">No microphone detected</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;