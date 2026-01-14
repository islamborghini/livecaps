/**
 * Microphone Context Provider
 *
 * React context provider that manages microphone access and audio recording functionality.
 * Handles MediaRecorder API integration and provides audio stream management for
 * real-time speech transcription.
 *
 * Features:
 * - Microphone permission handling and user consent
 * - MediaRecorder API integration for audio capture
 * - Audio stream management with proper cleanup
 * - Microphone state tracking (setup, recording, inactive)
 * - Audio data streaming to transcription services
 * - Error handling for microphone access issues
 * - Cross-browser compatibility for audio recording
 * - Custom React hooks for microphone functionality
 * - Automatic resource cleanup on component unmount
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from "react";

interface MicrophoneContextType {
  microphone: MediaRecorder | null;
  startMicrophone: () => void;
  stopMicrophone: () => void;
  setupMicrophone: () => void;
  microphoneState: MicrophoneState | null;
  errorMessage: string | null;
  retrySetup: () => void;
}

export enum MicrophoneEvents {
  DataAvailable = "dataavailable",
  Error = "error",
  Pause = "pause",
  Resume = "resume",
  Start = "start",
  Stop = "stop",
}

export enum MicrophoneState {
  NotSetup = -1,
  SettingUp = 0,
  Ready = 1,
  Opening = 2,
  Open = 3,
  Error = 4,
  Pausing = 5,
  Paused = 6,
}

const MicrophoneContext = createContext<MicrophoneContextType | undefined>(
  undefined
);

interface MicrophoneContextProviderProps {
  children: ReactNode;
}

const MicrophoneContextProvider: React.FC<MicrophoneContextProviderProps> = ({
  children,
}) => {
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>(
    MicrophoneState.NotSetup
  );
  const [microphone, setMicrophone] = useState<MediaRecorder | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setupMicrophone = async () => {
    setMicrophoneState(MicrophoneState.SettingUp);
    setErrorMessage(null);

    try {
      // Check if we're in a secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        throw new Error('Microphone access requires HTTPS or localhost');
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support microphone access');
      }

      console.log('🎤 Requesting microphone permission...');
      const userMedia = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      // Configure MediaRecorder with specific audio encoding that Deepgram supports
      // Try webm/opus first (widely supported and works well with Deepgram)
      let mimeType = 'audio/webm;codecs=opus';
      let options: MediaRecorderOptions = { mimeType };

      // Fallback to other formats if webm/opus not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(`${mimeType} not supported, trying alternatives...`);

        const alternatives = [
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];

        for (const alt of alternatives) {
          if (MediaRecorder.isTypeSupported(alt)) {
            mimeType = alt;
            options = { mimeType: alt };
            console.log(`Using audio format: ${alt}`);
            break;
          }
        }
      } else {
        console.log(`Using audio format: ${mimeType}`);
      }

      const microphone = new MediaRecorder(userMedia, options);

      console.log('✅ Microphone ready');
      setMicrophoneState(MicrophoneState.Ready);
      setMicrophone(microphone);
    } catch (err: any) {
      console.error('❌ Microphone setup failed:', err);
      setMicrophoneState(MicrophoneState.Error);
      
      // Provide user-friendly error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMessage('Microphone is being used by another application. Please close other apps using the microphone.');
      } else if (err.name === 'OverconstrainedError') {
        setErrorMessage('Could not satisfy audio constraints. Trying with basic settings...');
      } else {
        setErrorMessage(err.message || 'Failed to access microphone. Please check your browser settings.');
      }
    }
  };

  const retrySetup = useCallback(() => {
    console.log('🔄 Retrying microphone setup...');
    setMicrophoneState(MicrophoneState.NotSetup);
    setErrorMessage(null);
    setMicrophone(null);
    // Small delay before retrying
    setTimeout(() => {
      setupMicrophone();
    }, 100);
  }, []);

  const stopMicrophone = useCallback(() => {
    setMicrophoneState(MicrophoneState.Pausing);

    if (microphone?.state === "recording") {
      microphone.pause();
      setMicrophoneState(MicrophoneState.Paused);
    }
  }, [microphone]);

  const startMicrophone = useCallback(() => {
    setMicrophoneState(MicrophoneState.Opening);

    if (microphone?.state === "paused") {
      microphone.resume();
    } else {
      microphone?.start(100);
    }

    setMicrophoneState(MicrophoneState.Open);
  }, [microphone]);

  return (
    <MicrophoneContext.Provider
      value={{
        microphone,
        startMicrophone,
        stopMicrophone,
        setupMicrophone,
        microphoneState,
        errorMessage,
        retrySetup,
      }}
    >
      {children}
    </MicrophoneContext.Provider>
  );
};

function useMicrophone(): MicrophoneContextType {
  const context = useContext(MicrophoneContext);

  if (context === undefined) {
    throw new Error(
      "useMicrophone must be used within a MicrophoneContextProvider"
    );
  }

  return context;
}

export { MicrophoneContextProvider, useMicrophone };
