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
  // Enhanced state management for transcription
  const [transcription, setTranscription] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(languages[0]); // Default to Spanish
  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();
  const keepAliveInterval = useRef<any>();
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const translationTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Enhanced refs for sentence management
  const transcriptHistory = useRef<Set<string>>(new Set());
  const completeSentences = useRef<string[]>([]); // For storing complete sentences
  const currentSentenceRef = useRef<string>(""); // For tracking current incomplete sentence
  const lastUtteranceTime = useRef<number>(Date.now()); // Add missing ref
  const lastFinalText = useRef<string>("");
  const lastInterimWasNewSentence = useRef<boolean>(false);
  const sentenceBoundaryDetected = useRef<boolean>(false);
  
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
        utterance_end_ms: 2000, // Detect pauses after 2 seconds
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState]);

  // Handle translation of the transcription with improved sentence formatting
  useEffect(() => {
    // Only translate when we have text and a language selected
    if (!transcription.trim()) {
      setTranslatedText("");
      setIsTranslating(false);
      return;
    }

    if (translationTimeout.current) {
      clearTimeout(translationTimeout.current);
    }

    // Translate with a slight delay to avoid excessive API calls
    setIsTranslating(true);
    translationTimeout.current = setTimeout(async () => {
      try {
        // Use the enhanced translation service that preserves paragraph structure
        const result = await translateBySentences({
          text: transcription,
          sourceLanguage: "auto",
          targetLanguage: selectedLanguage.code
        });
        
        setTranslatedText(result.translatedText);
      } catch (error) {
        console.error("Translation error:", error);
      } finally {
        setIsTranslating(false);
      }
    }, 600); // Reduced for better responsiveness

    return () => {
      if (translationTimeout.current) {
        clearTimeout(translationTimeout.current);
      }
    };
  }, [transcription, selectedLanguage]);
  
  // Helper functions for sentence detection
  const isSentenceEnd = (text: string): boolean => {
    if (!text) return false;
    // Check if text ends with sentence-ending punctuation
    return /[.!?…][ "\n]*$/.test(text);
  };
  
  const startsNewSentence = (text: string): boolean => {
    if (!text) return false;
    // Check if text starts with a capital letter after trimming spaces
    const trimmed = text.trim();
    return trimmed.length > 0 && /^[A-Z]/.test(trimmed);
  };
  
  const hasSignificantPause = (timeSinceLastUtterance: number): boolean => {
    // Consider a pause over 1 second as significant for sentence boundary
    return timeSinceLastUtterance > 1000;
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
      const { is_final: isFinal, speech_final: speechFinal } = data;
      let thisCaption = data.channel.alternatives[0].transcript.trim();

      if (thisCaption === "") return;
      
      const currentTime = Date.now();
      const timeSinceLastUtterance = currentTime - lastUtteranceTime.current;
      lastUtteranceTime.current = currentTime;
      
      // Detect if there's been a significant pause that might indicate sentence boundary
      const pauseDetected = hasSignificantPause(timeSinceLastUtterance);
      
      // Enhanced handling that preserves sentence boundaries
      if (isFinal) {
        // Prevent duplicate processing
        if (transcriptHistory.current.has(thisCaption)) {
          return;
        }
        
        // Store in history to avoid duplicates
        transcriptHistory.current.add(thisCaption);
        lastFinalText.current = thisCaption;
        
        // Process the final text as complete sentences
        const extractedSentences = detectSentences(thisCaption);
        if (extractedSentences.length > 0) {
          // Update the complete sentences with newly detected ones
          const formattedSentences = extractedSentences.map(s => s.trim());
          
          // Update transcription with proper paragraph breaks between sentences
          setTranscription(prev => {
            if (!prev) return formattedSentences.join('\n\n');
            
            return prev + '\n\n' + formattedSentences.join('\n\n');
          });
          
          // Store the complete sentences for reference
          completeSentences.current = [
            ...completeSentences.current,
            ...formattedSentences
          ];
          
          // Clear the current sentence being built
          currentSentenceRef.current = "";
        } else {
          // If no complete sentences detected but text is available, 
          // add it as a paragraph
          setTranscription(prev => {
            if (!prev) return thisCaption;
            return prev + '\n\n' + thisCaption;
          });
          
          currentSentenceRef.current = "";
        }
        
        // Clear interim transcript after processing final text
        setInterimTranscript("");
        lastInterimWasNewSentence.current = false;
        sentenceBoundaryDetected.current = false;
        
      } else {
        // Handle interim results with improved sentence boundary detection
        
        // Skip if identical to last final text
        if (thisCaption === lastFinalText.current) {
          setInterimTranscript("");
          return;
        }
        
        // Check if this interim text starts a new sentence
        const isNewSentence = startsNewSentence(thisCaption) || 
                             (pauseDetected && thisCaption.trim().length > 0) ||
                             sentenceBoundaryDetected.current;
        
        // Update the sentence boundary detection status
        sentenceBoundaryDetected.current = isSentenceEnd(thisCaption);
        
        // Display interim text in a way that respects sentence boundaries
        setInterimTranscript(thisCaption);
        lastInterimWasNewSentence.current = isNewSentence;
      }
    };

    if (connectionState === LiveConnectionState.OPEN) {
      connection.addListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone.addEventListener(MicrophoneEvents.DataAvailable, onData);

      startMicrophone();
    }

    return () => {
      // prettier-ignore
      connection.removeListener(LiveTranscriptionEvents.Transcript, onTranscript);
      microphone.removeEventListener(MicrophoneEvents.DataAvailable, onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]);

  // Generate the combined display transcription with improved formatting
  const displayTranscription = () => {
    if (!transcription && !interimTranscript) return "";
    
    // If we have interim text that represents a new sentence,
    // display it with a paragraph break
    if (interimTranscript && lastInterimWasNewSentence.current) {
      return transcription + (transcription ? '\n\n' : '') + interimTranscript;
    }
    
    // Otherwise, display interim text in the same paragraph as it's continuing
    // the current sentence
    return transcription + (interimTranscript ? ' ' + interimTranscript : '');
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
  }, [transcription, interimTranscript, translatedText]);

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

  return (
    <div className="flex flex-col h-full w-full">
      {/* Language selector */}
      <div className="flex justify-end mb-2 mt-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-300">Translate to:</span>
          <LanguageSelector 
            selectedLanguage={selectedLanguage} 
            onLanguageChange={setSelectedLanguage} 
          />
        </div>
      </div>
      
      {/* Split screen */}
      <div className="flex flex-1 w-full flex-col md:flex-row overflow-hidden">
        {/* Left half - Transcription */}
        <div className="w-full md:w-1/2 h-full flex flex-col border-b md:border-b-0 md:border-r border-gray-700/30 overflow-hidden">
          <div className="p-2 text-center border-b border-gray-700/30">
            <h2 className="text-lg font-semibold text-gray-300">Original</h2>
          </div>
          <div 
            ref={transcriptionContainerRef}
            className="flex-1 p-4 md:p-8 overflow-y-auto text-left text-xl md:text-2xl lg:text-3xl font-light transcription-panel"
          >
            {displayTranscription() ? (
              <div className="whitespace-pre-wrap break-words">
                {displayTranscription()}
              </div>
            ) : (
              <span className="text-gray-500">Speak to see transcription here...</span>
            )}
          </div>
        </div>
        
        {/* Right half - Translation */}
        <div className="w-full md:w-1/2 h-full flex flex-col overflow-hidden">
          <div className="p-2 text-center border-b border-gray-700/30">
            <h2 className="text-lg font-semibold text-gray-300">
              {selectedLanguage.name} ({selectedLanguage.nativeName})
            </h2>
          </div>
          <div 
            ref={translationContainerRef}
            className={`flex-1 p-4 md:p-8 overflow-y-auto text-left text-xl md:text-2xl lg:text-3xl font-light transcription-panel lang-${selectedLanguage.code}`}
          >
            {translatedText ? (
              <div className="whitespace-pre-wrap break-words">
                {translatedText}
              </div>
            ) : (
              <span className="text-gray-500">Translation will appear here...</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Visualizer */}
      <div className="h-16 md:h-24 p-2 md:p-4 flex items-center justify-center">
        {microphone && <Visualizer microphone={microphone} height={80} />}
      </div>
    </div>
  );
};

export default App;
