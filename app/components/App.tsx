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
 */
"use client";

import { useEffect, useRef, useState } from "react";
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
import { detectSentences, processSentencesForTranslation, translateBySentences } from "../services/translationService";

const App: () => JSX.Element = () => {
  // State management for sentence-based transcription and translation
  const [completeSentences, setCompleteSentences] = useState<string[]>([]);
  const [translatedSentences, setTranslatedSentences] = useState<string[]>([]);
  const [currentInterimText, setCurrentInterimText] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(languages[0]);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  
  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();
  
  // Refs for managing transcription flow
  const keepAliveInterval = useRef<any>();
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const translationTimeout = useRef<NodeJS.Timeout | null>(null);
  const processedFinalTexts = useRef<Set<string>>(new Set());
  const currentSentenceBuffer = useRef<string>("");
  const lastProcessedLength = useRef<number>(0);
  const currentLanguageRef = useRef<string>(selectedLanguage.code); // Track current language
  
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
        utterance_end_ms: 1500, // Detect pauses after 1.5 seconds for better sentence detection
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState]);

  // Update the current language ref whenever selectedLanguage changes
  useEffect(() => {
    currentLanguageRef.current = selectedLanguage.code;
  }, [selectedLanguage.code]);

  // Helper function to detect complete sentences
  const detectCompleteSentences = (text: string): string[] => {
    if (!text.trim()) return [];
    
    // Split by sentence-ending punctuation, keeping the punctuation
    const sentences = text.split(/([.!?]+)/).filter(Boolean);
    const completeSentences: string[] = [];
    
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i];
      const punctuation = sentences[i + 1];
      
      if (sentence && punctuation) {
        const fullSentence = (sentence + punctuation).trim();
        if (fullSentence.length > 0) {
          completeSentences.push(fullSentence);
        }
      }
    }
    
    return completeSentences;
  };

  // Enhanced translation function with context
  const translateSentencesWithContext = async (sentences: string[], targetLanguage: string) => {
    if (sentences.length === 0) return [];
    
    setIsTranslating(true);
    
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
    } finally {
      setIsTranslating(false);
    }
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
        
        // Add the buffer content + new final text
        const fullText = currentSentenceBuffer.current + " " + thisCaption;
        const sentences = detectCompleteSentences(fullText.trim());
        
        if (sentences.length > 0) {
          // Add new complete sentences
          const newSentences = [...sentences];
          setCompleteSentences(prev => [...prev, ...newSentences]);
          
          // Translate the new sentences with context using current language
          translateSentencesWithContext(newSentences, currentLanguageRef.current)
            .then(translations => {
              setTranslatedSentences(prev => [...prev, ...translations]);
            });
          
          // Clear the buffer as we've processed complete sentences
          currentSentenceBuffer.current = "";
        } else {
          // No complete sentences, keep in buffer
          currentSentenceBuffer.current = fullText;
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
    return translatedSentences.join('\n\n') + (isTranslating ? '\n\n[Translating...]' : '');
  };

  // Scroll to bottom when transcription updates
  useEffect(() => {
    // Ensure scrolling happens after the DOM update
    const scrollToBottom = () => {
      if (transcriptionContainerRef.current) {
        transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
      }
      
      if (translationContainerRef.current) {
        translationContainerRef.current.scrollTop = translationContainerRef.current.scrollHeight;
      }
    };
    
    // Use requestAnimationFrame to ensure scrolling happens after render
    requestAnimationFrame(scrollToBottom);
  }, [completeSentences, currentInterimText, translatedSentences]);

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
    if (!transcriptionContainerRef.current || !translationContainerRef.current) return;
    
    // Create a function to scroll to bottom
    const scrollToBottom = (element: HTMLElement) => {
      element.scrollTop = element.scrollHeight;
    };
    
    // Create mutation observers
    const transcriptionObserver = new MutationObserver(() => {
      scrollToBottom(transcriptionContainerRef.current!);
    });
    
    const translationObserver = new MutationObserver(() => {
      scrollToBottom(translationContainerRef.current!);
    });
    
    // Configure and start observers
    const observerConfig = { childList: true, subtree: true, characterData: true };
    transcriptionObserver.observe(transcriptionContainerRef.current, observerConfig);
    translationObserver.observe(translationContainerRef.current, observerConfig);
    
    // Clean up observers on unmount
    return () => {
      transcriptionObserver.disconnect();
      translationObserver.disconnect();
    };
  }, []);

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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Control Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${
              connectionState === LiveConnectionState.OPEN ? 'bg-green-500' : 
              connectionState === LiveConnectionState.CONNECTING ? 'bg-yellow-500' : 'bg-gray-400'
            }`} />
            <span className="text-base font-medium text-gray-700">
              {connectionState === LiveConnectionState.OPEN ? 'Connected' : 
               connectionState === LiveConnectionState.CONNECTING ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="text-base font-medium text-gray-700">Translate to:</label>
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
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-8 py-5 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Original
            </h2>
          </div>
          <div 
            ref={transcriptionContainerRef}
            className="h-96 p-8 overflow-y-auto text-gray-900 text-xl leading-relaxed"
          >
            {displayTranscription() ? (
              <div className="whitespace-pre-wrap">
                {displayTranscription()}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-lg">Start speaking to see transcription here</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Translation */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-8 py-5 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {selectedLanguage.name}
              <span className="text-base font-normal text-gray-500">({selectedLanguage.nativeName})</span>
            </h2>
          </div>
          <div 
            ref={translationContainerRef}
            className={`h-96 p-8 overflow-y-auto text-gray-900 text-xl leading-relaxed lang-${selectedLanguage.code}`}
          >
            {displayTranslation() ? (
              <div className="whitespace-pre-wrap">
                {displayTranslation()}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <p className="text-lg">Translation will appear here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audio Visualizer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <h3 className="text-base font-medium text-gray-700 mb-6">Audio Input</h3>
          <div className="flex items-center justify-center">
            {microphone ? (
              <Visualizer microphone={microphone} height={80} />
            ) : (
              <div className="h-20 flex items-center justify-center text-gray-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
