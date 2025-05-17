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

const App: () => JSX.Element = () => {
  const [transcription, setTranscription] = useState<string>("");
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const { connection, connectToDeepgram, connectionState } = useDeepgram();
  const { setupMicrophone, microphone, startMicrophone, microphoneState } =
    useMicrophone();
  const keepAliveInterval = useRef<any>();
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const transcriptHistory = useRef<Set<string>>(new Set());
  const lastFinalText = useRef<string>("");

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
        utterance_end_ms: 3000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneState]);

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
        // Prevent adding the same final text multiple times
        if (transcriptHistory.current.has(thisCaption)) {
          return;
        }
        
        // Store this text in history to avoid duplicates
        transcriptHistory.current.add(thisCaption);
        lastFinalText.current = thisCaption;
        
        // Append to main transcript
        setTranscription(prev => {
          const newText = prev + (prev ? " " : "") + thisCaption;
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
    if (transcriptionContainerRef.current) {
      transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
    }
  }, [transcription, interimTranscript]);

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
  const displayTranscription = transcription + (interimTranscript ? " " + interimTranscript : "");

  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      {/* Left half - Transcription */}
      <div className="w-full md:w-1/2 h-full flex flex-col border-b md:border-b-0 md:border-r border-gray-700/30">
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
        <div className="h-16 md:h-24 p-2 md:p-4 flex items-center justify-center">
          {microphone && <Visualizer microphone={microphone} height={80} />}
        </div>
      </div>
      
      {/* Right half - Empty */}
      <div className="hidden md:block md:w-1/2 h-full">
        {/* Intentionally left empty */}
      </div>
    </div>
  );
};

export default App;
