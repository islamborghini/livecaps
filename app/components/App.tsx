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
import { translateBySentences } from "../services/translationService";

const App: () => JSX.Element = () => {
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
  const transcriptHistory = useRef<Set<string>>(new Set());
  const lastFinalText = useRef<string>("");
  const pauseDetected = useRef<boolean>(false);
  const lastUtteranceTime = useRef<number>(Date.now());
  const translationTimeout = useRef<NodeJS.Timeout | null>(null);

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

  // Handle translation of the transcription
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

    // Slight delay to avoid translating every single keystroke
    // Using a longer delay (1000ms) to ensure we don't translate too frequently
    setIsTranslating(true);
    translationTimeout.current = setTimeout(async () => {
      try {
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
    }, 1000); // Increased to 1 second

    return () => {
      if (translationTimeout.current) {
        clearTimeout(translationTimeout.current);
      }
    };
  }, [transcription, selectedLanguage]);

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
      
      // Update the last utterance time
      lastUtteranceTime.current = currentTime;
      
      if (isFinal) {
        // Prevent adding the same final text multiple times
        if (transcriptHistory.current.has(thisCaption)) {
          return;
        }
        
        // Store this text in history to avoid duplicates
        transcriptHistory.current.add(thisCaption);
        lastFinalText.current = thisCaption;
        
        // Always add each new sentence as a separate paragraph
        setTranscription(prev => {
          // Add a line break for each new sentence
          const newText = prev + (prev ? "\n\n" : "") + thisCaption;
          return newText;
        });
        
        // Clear interim transcript
        setInterimTranscript("");
      } else {
        // For interim results, completely replace the interim transcript
        // Don't show interim results that are identical to the last final text
        if (thisCaption !== lastFinalText.current) {
          setInterimTranscript(thisCaption);
        } else {
          setInterimTranscript("");
        }
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

  // Combined transcription for display
  const displayTranscription = transcription + (interimTranscript ? "\n\n" + interimTranscript : "");

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
            {displayTranscription ? (
              <div className="whitespace-pre-wrap break-words">
                {transcription}
                {interimTranscript && (
                  <span className="text-gray-400"> {interimTranscript}</span>
                )}
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
