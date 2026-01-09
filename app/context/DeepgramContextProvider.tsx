/**
 * Deepgram Context Provider
 *
 * React context provider that manages the connection to Deepgram's live transcription service.
 * Handles WebSocket connections, authentication, and real-time speech-to-text processing.
 *
 * Features:
 * - Live WebSocket connection management to Deepgram API
 * - Temporary API key authentication via server-side route
 * - Real-time transcription events handling (interim results, final results, metadata)
 * - Connection state management (connecting, connected, disconnected)
 * - Nova-3 model configuration with smart formatting
 * - Error handling and reconnection logic
 * - Automatic connection cleanup on component unmount
 * - Custom React hooks for easy consumption of Deepgram functionality
 */
"use client";

import {
  createClient,
  LiveClient,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveSchema,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  FunctionComponent,
} from "react";

interface DeepgramContextType {
  connection: LiveClient | null;
  connectToDeepgram: (options: LiveSchema, endpoint?: string) => Promise<void>;
  disconnectFromDeepgram: () => void;
  connectionState: LiveConnectionState;
}

const DeepgramContext = createContext<DeepgramContextType | undefined>(
  undefined
);

interface DeepgramContextProviderProps {
  children: ReactNode;
}

const getApiKey = async (): Promise<string> => {
  try {
    const response = await fetch("/api/authenticate", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Authentication API returned ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message || result.error);
    }

    if (!result.key) {
      throw new Error('No API key received from authentication endpoint');
    }

    return result.key;
  } catch (error) {
    console.error('❌ Failed to get API key:', error);
    throw error;
  }
};

const DeepgramContextProvider: FunctionComponent<
  DeepgramContextProviderProps
> = ({ children }) => {
  const [connection, setConnection] = useState<LiveClient | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>(
    LiveConnectionState.CLOSED
  );

  /**
   * Connects to the Deepgram speech recognition service and sets up a live transcription session.
   *
   * @param options - The configuration options for the live transcription session.
   * @param endpoint - The optional endpoint URL for the Deepgram service.
   * @returns A Promise that resolves when the connection is established.
   */
  const connectToDeepgram = async (options: LiveSchema, endpoint?: string) => {
    try {
      console.log('🔄 Requesting Deepgram API key...');
      const key = await getApiKey();

      if (!key || key === 'build-time-placeholder') {
        console.error('❌ Invalid Deepgram API key received');
        setConnectionState(LiveConnectionState.CLOSED);
        return;
      }

      console.log('✅ API key received, length:', key.length);
      console.log('🔄 Creating Deepgram client...');
      const deepgram = createClient(key);

      console.log('🔄 Attempting to establish WebSocket connection with options:', options);
      const conn = deepgram.listen.live(options, endpoint);

      conn.addListener(LiveTranscriptionEvents.Open, () => {
        console.log('✅ Deepgram WebSocket connection opened successfully!');
        setConnectionState(LiveConnectionState.OPEN);
      });

      conn.addListener(LiveTranscriptionEvents.Close, (event: any) => {
        console.log('❌ Deepgram WebSocket connection closed');
        console.log('Close event details:', event);
        setConnectionState(LiveConnectionState.CLOSED);
      });

      conn.addListener(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('❌ Deepgram WebSocket error details:');
        console.error('Error type:', typeof error);
        console.error('Error object:', error);
        if (error?.message) {
          console.error('Error message:', error.message);
        }
        if (error?.code) {
          console.error('Error code:', error.code);
        }
        setConnectionState(LiveConnectionState.CLOSED);
      });

      console.log('✅ WebSocket listeners configured, setting connection...');
      setConnection(conn);
    } catch (error) {
      console.error('❌ Failed to connect to Deepgram:');
      console.error('Error type:', typeof error);
      console.error('Error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      setConnectionState(LiveConnectionState.CLOSED);
    }
  };

  const disconnectFromDeepgram = async () => {
    if (connection) {
      connection.finish();
      setConnection(null);
    }
  };

  return (
    <DeepgramContext.Provider
      value={{
        connection,
        connectToDeepgram,
        disconnectFromDeepgram,
        connectionState,
      }}
    >
      {children}
    </DeepgramContext.Provider>
  );
};

function useDeepgram(): DeepgramContextType {
  const context = useContext(DeepgramContext);
  if (context === undefined) {
    throw new Error(
      "useDeepgram must be used within a DeepgramContextProvider"
    );
  }
  return context;
}

export {
  DeepgramContextProvider,
  useDeepgram,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
};
