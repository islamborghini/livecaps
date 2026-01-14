/**
 * Audio Duplication Utility
 *
 * Handles cloning of audio Blobs for distribution to multiple Deepgram WebSocket connections.
 * Audio chunks from MediaRecorder need to be duplicated without modification to ensure
 * each connection receives identical data for fair confidence comparison.
 */

/**
 * Duplicates an audio Blob N times for sending to multiple connections
 *
 * @param original - The original audio Blob from MediaRecorder
 * @param count - Number of copies to create
 * @returns Array of Blob copies (including original as first element for efficiency)
 *
 * @example
 * const audioBlob = new Blob([audioData], { type: 'audio/webm;codecs=opus' });
 * const [blob1, blob2, blob3] = await duplicateAudioBlob(audioBlob, 3);
 */
export async function duplicateAudioBlob(
  original: Blob,
  count: number
): Promise<Blob[]> {
  if (count <= 0) {
    throw new Error("Count must be greater than 0");
  }

  // Optimization: If only one copy needed, return original
  if (count === 1) {
    return [original];
  }

  try {
    // Read the original blob's data once
    const arrayBuffer = await original.arrayBuffer();

    // Create array of duplicates
    // First element is original (no need to recreate), rest are clones
    const duplicates: Blob[] = [original];

    for (let i = 1; i < count; i++) {
      // Create new Blob with same data and MIME type
      // ArrayBuffer can be reused since Blobs are immutable
      const clone = new Blob([arrayBuffer], { type: original.type });
      duplicates.push(clone);
    }

    return duplicates;
  } catch (error) {
    console.error("❌ Failed to duplicate audio blob:", error);
    throw new Error(`Audio duplication failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Creates a single clone of an audio Blob
 *
 * @param original - The original audio Blob
 * @returns A new Blob with identical content and MIME type
 *
 * @example
 * const clone = await cloneAudioBlob(originalBlob);
 */
export async function cloneAudioBlob(original: Blob): Promise<Blob> {
  try {
    const arrayBuffer = await original.arrayBuffer();
    return new Blob([arrayBuffer], { type: original.type });
  } catch (error) {
    console.error("❌ Failed to clone audio blob:", error);
    throw new Error(`Audio cloning failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Validates that a Blob is a supported audio format
 *
 * @param blob - The Blob to validate
 * @returns true if valid audio format, false otherwise
 */
export function isValidAudioBlob(blob: Blob): boolean {
  if (!blob || blob.size === 0) {
    return false;
  }

  // Check for supported audio MIME types
  const supportedTypes = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/wav",
    "audio/mpeg",
  ];

  // Check if type starts with any supported type
  return supportedTypes.some((type) => blob.type.startsWith(type));
}

/**
 * Gets statistics about audio duplication performance
 *
 * @param original - Original blob
 * @param count - Number of duplicates
 * @returns Performance metrics
 */
export async function getAudioDuplicationStats(
  original: Blob,
  count: number
): Promise<{
  originalSize: number;
  totalSize: number;
  count: number;
  estimatedMemory: number;
  mimeType: string;
}> {
  const originalSize = original.size;
  const totalSize = originalSize * count;
  // Estimated memory includes ArrayBuffer + Blob objects overhead
  const estimatedMemory = totalSize + count * 100; // ~100 bytes per Blob object

  return {
    originalSize,
    totalSize,
    count,
    estimatedMemory,
    mimeType: original.type,
  };
}

/**
 * Batch duplicate multiple audio blobs efficiently
 *
 * Useful for pre-duplicating a queue of audio chunks
 *
 * @param blobs - Array of audio blobs to duplicate
 * @param countPerBlob - Number of copies per blob
 * @returns 2D array where each row contains duplicates of one blob
 */
export async function batchDuplicateAudioBlobs(
  blobs: Blob[],
  countPerBlob: number
): Promise<Blob[][]> {
  const promises = blobs.map((blob) => duplicateAudioBlob(blob, countPerBlob));
  return Promise.all(promises);
}
