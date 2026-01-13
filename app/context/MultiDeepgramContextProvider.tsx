/**
 * Multi-Deepgram Context Provider
 *
 * Manages multiple parallel Deepgram WebSocket connections for multilingual
 * speech recognition with confidence-based winner selection.
 *
 * Key responsibilities:
 * - Create and manage N parallel LiveClient connections (one per language)
 * - Distribute audio data to all connections simultaneously
 * - Buffer and compare transcript results
 * - Select winner based on confidence scores
 * - Emit winner events to consumers
 * - Handle connection lifecycle, errors, and circuit breaking
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import {
  createClient,
  LiveTranscriptionEvents,
  LiveConnectionState,
  LiveClient,
  LiveTranscriptionEvent,
} from "@deepgram/sdk";
import {
  DeepgramConnection,
  MultiDeepgramContextType,
  MultiDeepgramConfig,
  TranscriptResult,
  WinnerTranscript,
  ConnectionHealth,
  TranscriptionMode,
} from "../types/multiDeepgram";
import {
  TranscriptBuffer,
  CONFIDENCE_CONFIG,
} from "../utils/confidenceComparison";
import { duplicateAudioBlob } from "../utils/audioDuplication";

// API key fetching (reuse from original DeepgramContextProvider)
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
      throw new Error("No API key received from authentication endpoint");
    }

    return result.key;
  } catch (error) {
    console.error("❌ Failed to get API key:", error);
    throw error;
  }
};

// Create context
const MultiDeepgramContext = createContext<MultiDeepgramContextType | undefined>(
  undefined
);

// Provider props
interface MultiDeepgramContextProviderProps {
  children: ReactNode;
}

/**
 * Multi-Deepgram Context Provider Component
 */
export function MultiDeepgramContextProvider({
  children,
}: MultiDeepgramContextProviderProps) {
  // State
  const [connections, setConnections] = useState<Map<string, DeepgramConnection>>(
    new Map()
  );
  const [overallState, setOverallState] = useState<LiveConnectionState>(
    LiveConnectionState.CLOSED
  );
  const [mode, setMode] = useState<TranscriptionMode>("single");
  const [config, setConfig] = useState<MultiDeepgramConfig>({
    mode: "single",
    languages: [],
    bufferWindowMs: CONFIDENCE_CONFIG.BUFFER_WINDOW_MS,
    minConfidenceThreshold: CONFIDENCE_CONFIG.MIN_CONFIDENCE_THRESHOLD,
    maxConnections: 5,
  });

  // Refs for non-rendering state
  const transcriptBuffer = useRef<TranscriptBuffer | null>(null);
  const keepAliveIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const winnerCallbacks = useRef<Array<(winner: WinnerTranscript) => void>>([]);

  // Ref to track connections for cleanup without causing re-renders
  const connectionsRef = useRef<Map<string, DeepgramConnection>>(new Map());

  /**
   * Aggregates connection states into overall state
   */
  const aggregateConnectionStates = (
    conns: Map<string, DeepgramConnection>
  ): LiveConnectionState => {
    if (conns.size === 0) {
      return LiveConnectionState.CLOSED;
    }

    const states = Array.from(conns.values()).map((conn) => conn.state);

    // All open → OPEN
    if (states.every((s) => s === LiveConnectionState.OPEN)) {
      return LiveConnectionState.OPEN;
    }

    // Any connecting → CONNECTING
    if (states.some((s) => s === LiveConnectionState.CONNECTING)) {
      return LiveConnectionState.CONNECTING;
    }

    // All closed → CLOSED
    if (states.every((s) => s === LiveConnectionState.CLOSED)) {
      return LiveConnectionState.CLOSED;
    }

    // Mixed states → CONNECTING (transitioning)
    return LiveConnectionState.CONNECTING;
  };

  /**
   * Updates overall state based on provided connections map
   */
  const updateOverallStateFromConnections = useCallback(
    (conns: Map<string, DeepgramConnection>) => {
      const newState = aggregateConnectionStates(conns);
      setOverallState((prevState) => {
        if (newState !== prevState) {
          console.log(`🔄 Overall state changed: ${prevState} → ${newState}`);
          return newState;
        }
        return prevState;
      });
    },
    []
  );

  /**
   * Creates a single Deepgram connection for a specific language
   */
  const createConnection = useCallback(
    async (language: string, apiKey: string): Promise<DeepgramConnection> => {
      const connectionId = `connection-${language}`;

      console.log(`🔗 Creating connection for language: ${language}`);

      // Create Deepgram client
      const deepgram = createClient(apiKey);

      // Connection options (use Nova-3 for single language)
      const options = {
        model: "nova-3",
        language: language,
        interim_results: true,
        smart_format: true,
        punctuate: true,
        endpointing: 100,
        utterance_end_ms: 1500,
        vad_events: true,
      };

      console.log(`📞 Establishing WebSocket for [${language}]:`, options);

      // Create live connection
      const client = deepgram.listen.live(options);

      // Create connection object
      const connection: DeepgramConnection = {
        id: connectionId,
        language,
        client,
        state: LiveConnectionState.CONNECTING,
        lastTranscript: "",
        lastConfidence: 0,
        errorCount: 0,
        isHealthy: true,
        lastActivityTimestamp: Date.now(),
      };

      // Set up event listeners
      setupConnectionListeners(connection);

      return connection;
    },
    []
  );

  /**
   * Sets up event listeners for a connection
   */
  const setupConnectionListeners = (connection: DeepgramConnection) => {
    const { client, id, language } = connection;

    // Open event
    client.addListener(LiveTranscriptionEvents.Open, () => {
      console.log(`✅ Connection opened: [${language}] (${id})`);

      // Also update the connection object directly for immediate state access
      connection.state = LiveConnectionState.OPEN;
      connection.isHealthy = true;
      connection.errorCount = 0;

      setConnections((prev) => {
        const updated = new Map(prev);
        const conn = updated.get(id);
        if (conn) {
          conn.state = LiveConnectionState.OPEN;
          conn.isHealthy = true;
          conn.errorCount = 0;
        }
        return updated;
      });
    });

    // Close event
    client.addListener(LiveTranscriptionEvents.Close, (event: any) => {
      console.log(`❌ Connection closed: [${language}] (${id})`, event);

      // Update connection object directly
      connection.state = LiveConnectionState.CLOSED;

      setConnections((prev) => {
        const updated = new Map(prev);
        const conn = updated.get(id);
        if (conn) {
          conn.state = LiveConnectionState.CLOSED;
        }
        return updated;
      });
    });

    // Error event
    client.addListener(LiveTranscriptionEvents.Error, (error: any) => {
      console.error(`❌ Connection error: [${language}] (${id})`, error);

      // Update connection object directly
      connection.errorCount++;
      if (connection.errorCount >= 3) {
        connection.isHealthy = false;
      }

      setConnections((prev) => {
        const updated = new Map(prev);
        const conn = updated.get(id);
        if (conn) {
          conn.errorCount++;

          // Circuit breaker: mark unhealthy after 3 errors
          if (conn.errorCount >= 3) {
            console.error(
              `⚠️ Connection marked unhealthy after ${conn.errorCount} errors: [${language}]`
            );
            conn.isHealthy = false;
          }
        }
        return updated;
      });
    });

    // Transcript event
    client.addListener(
      LiveTranscriptionEvents.Transcript,
      (data: LiveTranscriptionEvent) => {
        handleTranscriptFromConnection(id, language, data);
      }
    );

    // Utterance end event (optional, for buffer flushing)
    client.addListener(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log(`🎤 Utterance end detected: [${language}]`);
      // Could trigger immediate buffer flush here if needed
    });

    // Start keep-alive
    const keepAliveInterval = setInterval(() => {
      if (connection.state === LiveConnectionState.OPEN) {
        client.keepAlive();
      }
    }, 10000);

    keepAliveIntervals.current.set(id, keepAliveInterval);
  };

  /**
   * Handles transcript event from a specific connection
   */
  const handleTranscriptFromConnection = useCallback(
    (connectionId: string, language: string, data: LiveTranscriptionEvent) => {
      const { is_final: isFinal } = data;
      const alternative = data.channel.alternatives[0];
      const transcript = alternative.transcript.trim();

      // Skip empty transcripts
      if (transcript === "") {
        return;
      }

      // Extract confidence
      const confidence = alternative.confidence || 0;

      // Extract word-level data
      const words = (alternative as any).words || [];

      // Create transcript result
      const result: TranscriptResult = {
        connectionId,
        language,
        transcript,
        confidence,
        isFinal,
        timestamp: Date.now(),
        words: words.map((w: any) => ({
          word: w.word,
          confidence: w.confidence,
          start: w.start,
          end: w.end,
          language: w.language,
        })),
        detectedLanguage: (data.channel as any).detected_language,
      };

      console.log(
        `📡 Transcript from [${language}]: confidence=${confidence.toFixed(3)}, isFinal=${isFinal}, text="${transcript.substring(0, 40)}..."`
      );

      // Update connection's last transcript
      setConnections((prev) => {
        const updated = new Map(prev);
        const conn = updated.get(connectionId);
        if (conn) {
          conn.lastTranscript = transcript;
          conn.lastConfidence = confidence;
          conn.lastActivityTimestamp = Date.now();
        }
        return updated;
      });

      // Add to buffer for comparison (only for final results)
      if (isFinal && transcriptBuffer.current) {
        transcriptBuffer.current.addResult(result);
      }
    },
    []
  );

  /**
   * Handler for when a winner is selected
   */
  const handleWinnerSelected = useCallback((winner: WinnerTranscript) => {
    console.log(
      `🏆 Winner selected: [${winner.language}] confidence=${winner.confidence.toFixed(3)}`
    );

    // Notify all registered callbacks
    winnerCallbacks.current.forEach((callback) => {
      callback(winner);
    });
  }, []);

  /**
   * Connects to Deepgram with parallel connections for specified languages
   */
  const connectToDeepgram = useCallback(
    async (languages: string[]) => {
      console.log(
        `🌐 Connecting to Deepgram with ${languages.length} parallel connections:`,
        languages
      );

      // Validate
      if (languages.length === 0) {
        throw new Error("No languages specified");
      }

      if (languages.length > (config.maxConnections || 5)) {
        throw new Error(
          `Too many languages (${languages.length}), max is ${config.maxConnections}`
        );
      }

      try {
        // Get API key
        const apiKey = await getApiKey();

        // Create all connections in parallel
        const connectionPromises = languages.map((lang) =>
          createConnection(lang, apiKey)
        );
        const newConnections = await Promise.all(connectionPromises);

        // Store connections in map
        const connectionsMap = new Map<string, DeepgramConnection>();
        newConnections.forEach((conn) => {
          connectionsMap.set(conn.id, conn);
        });

        setConnections(connectionsMap);

        // Initialize transcript buffer
        transcriptBuffer.current = new TranscriptBuffer(
          languages.length,
          handleWinnerSelected,
          {
            BUFFER_WINDOW_MS: config.bufferWindowMs,
            MIN_CONFIDENCE_THRESHOLD: config.minConfidenceThreshold,
          }
        );

        // Update config
        setConfig((prev) => ({ ...prev, languages }));

        console.log(`✅ All ${languages.length} connections established`);
      } catch (error) {
        console.error("❌ Failed to establish connections:", error);
        setOverallState(LiveConnectionState.CLOSED);
        throw error;
      }
    },
    [config, createConnection, handleWinnerSelected]
  );

  /**
   * Disconnects and cleans up all connections
   * Uses ref to avoid dependency on connections state
   */
  const disconnectFromDeepgram = useCallback(() => {
    const currentConnections = connectionsRef.current;
    console.log(`🔌 Disconnecting all connections (${currentConnections.size} active)`);

    // Stop all keep-alive intervals
    keepAliveIntervals.current.forEach((interval) => {
      clearInterval(interval);
    });
    keepAliveIntervals.current.clear();

    // Close all connections - check state before closing
    currentConnections.forEach((connection) => {
      try {
        // Only call finish() if the connection is actually open
        if (connection.state === LiveConnectionState.OPEN) {
          connection.client.finish();
          console.log(`🔌 Closed connection: [${connection.language}]`);
        } else {
          console.log(`⏭️ Skipping close for [${connection.language}] - state: ${connection.state}`);
        }
      } catch (error) {
        // Silently handle already closed connections
        if (error instanceof Error && error.message.includes('CLOSED')) {
          console.log(`ℹ️ Connection [${connection.language}] already closed`);
        } else {
          console.error(
            `⚠️ Error closing connection [${connection.language}]:`,
            error
          );
        }
      }
    });

    // Clear connections ref
    connectionsRef.current = new Map();
    
    // Clear connections state
    setConnections(new Map());
    setOverallState(LiveConnectionState.CLOSED);

    // Clear transcript buffer
    if (transcriptBuffer.current) {
      transcriptBuffer.current.clear();
      transcriptBuffer.current = null;
    }

    console.log("✅ All connections disconnected");
  }, []);

  /**
   * Sends audio data to all active connections
   */
  const sendAudioToAll = useCallback(
    async (audioData: Blob) => {
      const healthyConnections = Array.from(connections.values()).filter(
        (conn) =>
          conn.isHealthy && conn.state === LiveConnectionState.OPEN
      );

      if (healthyConnections.length === 0) {
        console.warn("⚠️ No healthy connections to send audio to");
        return;
      }

      try {
        // Duplicate audio blob for each connection
        const audioBlobs = await duplicateAudioBlob(
          audioData,
          healthyConnections.length
        );

        // Send to each connection
        healthyConnections.forEach((conn, index) => {
          try {
            conn.client.send(audioBlobs[index]);
          } catch (error) {
            console.error(
              `⚠️ Failed to send audio to [${conn.language}]:`,
              error
            );
          }
        });
      } catch (error) {
        console.error("❌ Failed to duplicate/send audio:", error);
      }
    },
    [connections]
  );

  /**
   * Registers a callback for winner events
   */
  const onWinnerSelected = useCallback((callback: (winner: WinnerTranscript) => void) => {
    winnerCallbacks.current.push(callback);

    // Return cleanup function
    return () => {
      winnerCallbacks.current = winnerCallbacks.current.filter(
        (cb) => cb !== callback
      );
    };
  }, []);

  /**
   * Gets health status of all connections
   */
  const getConnectionHealth = useCallback((): ConnectionHealth[] => {
    return Array.from(connections.values()).map((conn) => ({
      connectionId: conn.id,
      language: conn.language,
      state: conn.state,
      errorCount: conn.errorCount,
      isHealthy: conn.isHealthy,
      lastActivity: conn.lastActivityTimestamp,
      uptime: Date.now() - conn.lastActivityTimestamp,
    }));
  }, [connections]);

  // Sync connections ref and update overall state when connections change
  useEffect(() => {
    connectionsRef.current = connections;
    updateOverallStateFromConnections(connections);
  }, [connections, updateOverallStateFromConnections]);

  // Cleanup on unmount - empty deps to run only once
  useEffect(() => {
    return () => {
      // Use a local function to avoid closure issues
      const cleanup = () => {
        console.log('🧹 Unmount cleanup: disconnecting all connections');
        
        // Stop all keep-alive intervals
        keepAliveIntervals.current.forEach((interval) => {
          clearInterval(interval);
        });
        keepAliveIntervals.current.clear();

        // Close all connections from ref
        connectionsRef.current.forEach((connection) => {
          try {
            if (connection.state === LiveConnectionState.OPEN) {
              connection.client.finish();
            }
          } catch (error) {
            // Silently ignore cleanup errors
          }
        });
        connectionsRef.current = new Map();
      };
      cleanup();
    };
  }, []);

  // Context value
  const contextValue: MultiDeepgramContextType = {
    connections,
    connectToDeepgram,
    disconnectFromDeepgram,
    sendAudioToAll,
    overallState,
    mode,
    setMode,
    config,
  };

  // Also expose helper methods for consumers
  const contextValueWithHelpers = {
    ...contextValue,
    onWinnerSelected,
    getConnectionHealth,
  };

  return (
    <MultiDeepgramContext.Provider value={contextValueWithHelpers as any}>
      {children}
    </MultiDeepgramContext.Provider>
  );
}

/**
 * Hook to use Multi-Deepgram context
 */
export function useMultiDeepgram() {
  const context = useContext(MultiDeepgramContext);

  if (context === undefined) {
    throw new Error(
      "useMultiDeepgram must be used within a MultiDeepgramContextProvider"
    );
  }

  return context as MultiDeepgramContextType & {
    onWinnerSelected: (callback: (winner: WinnerTranscript) => void) => () => void;
    getConnectionHealth: () => ConnectionHealth[];
  };
}
