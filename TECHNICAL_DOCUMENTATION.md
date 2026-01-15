# LiveCaps Technical Documentation (Deprecated)

This document has been superseded by the consolidated architecture and walkthrough guide:

- [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md)

Please refer to that file for the up-to-date system overview, architecture diagrams, data flow, translation pipeline, caching, and deployment details.

This file is kept only to avoid breaking existing links.
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React/Next.js)                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   App.tsx       │  │ LanguageSelector│  │   Visualizer    │ │
│  │ (Main Component)│  │                 │  │ (Audio Levels)  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                      │                      │        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │Context Providers│  │Translation Queue│  │ Sentence Buffer │ │
│  │• Deepgram       │  │   Management    │  │   Management    │ │
│  │• Microphone     │  │                 │  │                 │ │
│  │• DarkMode       │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend API Routes                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ /api/translate  │  │  /api/cache     │  │/api/authenticate│ │
│  │                 │  │                 │  │                 │ │
│  │• DeepL API      │  │• Cache Stats    │  │• Deepgram Auth │ │
│  │• Google Trans.  │  │• Preloading     │  │                 │ │
│  │• Cache Check    │  │• Clear Cache    │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External Services                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Deepgram Nova-3 │  │   DeepL API     │  │ Google Translate│ │
│  │                 │  │                 │  │      API        │ │
│  │• WebSocket      │  │• Primary Trans. │  │• Fallback Trans.│ │
│  │• Real-time STT  │  │• High Quality   │  │• Backup Provider│ │
│  │• 100ms chunks   │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Main Application Component (`app/components/App.tsx`)

The central orchestrator managing all real-time operations:

```typescript
// Key responsibilities:
- Audio capture and processing
- Real-time transcription handling
- Translation queue management
- Sentence detection and buffering
- State management for sentences and translations
```

**Critical Features:**
- **Non-blocking Translation Queue**: Prevents transcription interruption
- **Smart Sentence Detection**: Advanced algorithms with timeout fallbacks
- **Buffer Management**: Handles incomplete sentences and fragments
- **Language Switching**: Complete data reset on language changes

### 2. Context Providers

#### Deepgram Context (`app/context/DeepgramContextProvider.tsx`)
```typescript
// Manages WebSocket connection to Deepgram
- Connection state management
- Authentication token handling
- Real-time event listeners
- Error handling and reconnection
```

#### Microphone Context (`app/context/MicrophoneContextProvider.tsx`)
```typescript
// Audio capture configuration
- MediaRecorder setup with 100ms chunks
- Audio stream management
- Permission handling
- iOS Safari compatibility fixes
```

### 3. Translation Service (`app/services/translationService.ts`)

Comprehensive translation management system:

```typescript
// Core Functions:
- translateText(): Backend API calls
- translateBySentences(): Batch processing
- detectSentences(): Advanced sentence boundary detection
- cacheUtils: Cache management utilities
```

**Advanced Sentence Detection:**
```typescript
// Sophisticated algorithm handles:
- Abbreviations (Dr., Inc., U.S.A.)
- Multiple punctuation marks
- Incomplete fragments
- Natural language patterns
- Quality validation (length, structure, capitalization)
```

---

## Data Flow

### 1. Audio Capture Flow

```
Microphone Input → MediaRecorder (100ms chunks) → WebSocket → Deepgram
                                                              ↓
User Speech → Audio Blob → Binary Data → Real-time Processing → Transcript
```

### 2. Transcription Processing Flow

```
Raw Transcript → Duplicate Check → Buffer Combination → Sentence Detection
                                                              ↓
Complete Sentences → State Update → Translation Queue → Display Update
                                                              ↓
Incomplete Text → Buffer Storage → Timeout Processing → Fallback Handling
```

### 3. Translation Flow

```
New Sentences → Queue Check → Duplicate Prevention → Translation Request
                                                              ↓
Cache Check → Backend API → External Provider → Response → State Update
                                                              ↓
Display Update → User Interface → Real-time Translation Display
```

---

## Translation System

### Backend Translation API (`app/api/translate/route.ts`)

The translation system uses a sophisticated multi-provider approach:

```typescript
// Provider Priority:
1. Server-side Cache (instant response)
2. DeepL API (primary, high quality)
3. Google Translate (fallback)
4. Error handling with original text
```

**Translation Process:**
1. **Cache Check**: Lightning-fast lookup in server memory
2. **Provider Selection**: DeepL for quality, Google for reliability
3. **Language Mapping**: Convert between different API language codes
4. **Response Caching**: Store successful translations for future use
5. **Error Handling**: Graceful fallbacks and user feedback

### Language Support Matrix

| Language | Code | DeepL Support | Google Support | Preloaded Phrases |
|----------|------|---------------|----------------|-------------------|
| Spanish  | es   | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| French   | fr   | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| German   | de   | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| Japanese | ja   | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| Portuguese| pt  | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| Italian  | it   | ✅ Primary    | ✅ Fallback    | 38 phrases        |
| Dutch    | nl   | ✅ Primary    | ✅ Fallback    | 38 phrases        |

---

## Caching Architecture

### Server-Side Translation Cache (`app/lib/translationCache.ts`)

A sophisticated singleton caching system:

```typescript
// Cache Features:
- In-memory storage with 2000 entry limit
- 24-hour TTL (Time To Live)
- LRU eviction policy
- Hit rate statistics
- Automatic cleanup
- Thread-safe operations
```

**Cache Performance Metrics:**
- **Hit Rate**: Typically 85-95% for common phrases
- **Response Time**: 50-120ms for cache hits vs 200-500ms for API calls
- **Memory Usage**: ~10-50MB depending on cache size
- **Cost Savings**: Significant reduction in external API calls

### Cache Management API (`app/api/cache/route.ts`)

Provides comprehensive cache control:

```typescript
// Available Actions:
- GET stats: Retrieve cache statistics
- GET clear: Clear entire cache
- POST preload: Preload common phrases for a language
```

**Preloaded Common Phrases (38 phrases per language):**
```javascript
// Essential conversational phrases:
"Hello", "Thank you", "Good morning", "How are you?", 
"Please", "Excuse me", "I'm sorry", "Goodbye", 
"Yes", "No", "Maybe", "I don't know", 
"Can you help me?", "What time is it?", etc.
```

---

## Audio Processing

### MediaRecorder Configuration

Optimized for real-time performance:

```typescript
// Audio Settings:
- Sample Rate: Browser default (typically 44.1kHz)
- Chunk Duration: 100ms (reduced from 250ms for faster response)
- Format: WebM with Opus codec (fallback to available formats)
- Channels: Mono preferred for speech recognition
```

### iOS Safari Compatibility

Special handling for iOS limitations:

```typescript
// iOS Fixes:
- Prevent zero-size packet transmission
- Handle connection state changes
- Manage audio permission flows
- Optimize for mobile constraints
```

### Audio Visualization

Real-time audio level visualization:

```typescript
// Features:
- Live microphone input levels
- Visual feedback for user confidence
- Connection status indicators
- Recording state visualization
```

---

## Performance Optimizations

### 1. Audio Processing Optimizations

- **100ms Chunks**: Reduced from 250ms for 60% faster response time
- **Efficient WebSocket**: Persistent connection with keepalive
- **Smart Buffering**: Prevents audio data loss during transmission

### 2. Translation Optimizations

- **Non-blocking Queue**: Asynchronous processing prevents UI freezing
- **Intelligent Caching**: 85-95% cache hit rate reduces API calls
- **Duplicate Prevention**: Sophisticated deduplication algorithms
- **Batch Processing**: Efficient handling of multiple sentences

### 3. Sentence Detection Optimizations

- **Conservative Detection**: Prevents false sentence boundaries
- **Timeout Fallbacks**: 3-second timeout for incomplete sentences
- **Fragment Prevention**: Quality checks eliminate meaningless fragments
- **Context Preservation**: Smart buffering maintains conversation flow

### 4. Memory Management

- **Ref-based Counting**: Reliable sentence tracking without state race conditions
- **Automatic Cleanup**: Clear data on language changes
- **Efficient State Updates**: Minimal re-renders through smart state management

---

## API Reference

### Translation API (`/api/translate`)

**POST** `/api/translate`

```typescript
// Request Body:
{
  text: string;           // Text to translate
  targetLanguage: string; // Target language code
}

// Response:
{
  translatedText: string; // Translated text
  provider?: string;      // Translation provider used
  cached?: boolean;       // Whether result came from cache
  error?: string;         // Error message if failed
}
```

### Cache Management API (`/api/cache`)

**GET** `/api/cache?action=stats`
```typescript
// Response:
{
  success: boolean;
  data: {
    size: number;    // Number of cached entries
    hitRate: number; // Cache hit rate percentage
  }
}
```

**GET** `/api/cache?action=clear`
```typescript
// Response:
{
  success: boolean;
  message: string;
}
```

**POST** `/api/cache`
```typescript
// Request Body:
{
  action: "preload";
  targetLanguage: string; // Language to preload
}

// Response:
{
  success: boolean;
  message: string;
  preloadedCount?: number; // Number of phrases preloaded
}
```

### Authentication API (`/api/authenticate`)

**GET** `/api/authenticate`
```typescript
// Response:
{
  key: string; // Deepgram API key for WebSocket connection
}
```

---

## Deployment & Configuration

### Environment Variables

Required environment variables:

```bash
# Deepgram Configuration
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# DeepL Configuration (Primary Translation Provider)
DEEPL_API_KEY=your_deepl_api_key_here

# Google Translate Configuration (Fallback Provider)
GOOGLE_TRANSLATE_API_KEY=your_google_api_key_here

# Next.js Configuration
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Next.js Configuration (`next.config.js`)

```javascript
// Optimized for real-time applications:
- WebSocket support configuration
- API route optimization
- Static asset optimization
- Performance monitoring setup
```

### Performance Monitoring

Key metrics to monitor:

1. **Audio Latency**: Target <100ms from speech to transcription
2. **Translation Speed**: Target <200ms for cached, <500ms for API calls
3. **Cache Hit Rate**: Target >85% for optimal performance
4. **Memory Usage**: Monitor cache size and cleanup efficiency
5. **API Rate Limits**: Track external service usage

### Scaling Considerations

For production deployment:

1. **Horizontal Scaling**: Stateless design allows multiple server instances
2. **Database Integration**: Consider Redis for distributed caching
3. **CDN Integration**: Optimize static asset delivery
4. **Load Balancing**: Distribute WebSocket connections across servers
5. **Monitoring**: Implement comprehensive logging and alerting

---

## Troubleshooting Guide

### Common Issues

1. **Microphone Permission Denied**
   - Solution: Ensure HTTPS deployment, handle permission requests gracefully

2. **WebSocket Connection Failures**
   - Solution: Implement reconnection logic, check API key validity

3. **Translation Delays**
   - Solution: Monitor cache hit rates, verify API provider status

4. **Sentence Detection Issues**
   - Solution: Adjust detection algorithms, monitor buffer timeout settings

5. **Memory Leaks**
   - Solution: Ensure proper cleanup on component unmount, monitor ref usage

### Development Tips

1. **Local Development**: Use ngrok for HTTPS testing with microphone
2. **Debugging**: Enable verbose logging for WebSocket and API calls
3. **Testing**: Test with various accents and speaking speeds
4. **Optimization**: Profile audio processing and translation performance

---

## Future Enhancements

### Planned Features

1. **Offline Mode**: Local speech recognition for privacy-sensitive environments
2. **Custom Models**: Domain-specific vocabulary and terminology
3. **Multi-speaker Detection**: Identify and separate different speakers
4. **Export Functionality**: Save transcriptions and translations
5. **Real-time Collaboration**: Multi-user transcription sessions
6. **Advanced Analytics**: Detailed usage statistics and insights

### Technical Improvements

1. **WebRTC Integration**: Direct peer-to-peer audio streaming
2. **Edge Computing**: Process audio closer to users for reduced latency
3. **AI-Powered Sentence Detection**: Machine learning for better boundary detection
4. **Adaptive Caching**: Dynamic cache sizing based on usage patterns
5. **Progressive Web App**: Offline functionality and mobile app experience

---

This documentation provides a comprehensive understanding of the LiveCaps system architecture, implementation details, and operational considerations. The application represents a sophisticated real-time processing system that balances performance, accuracy, and user experience through careful engineering and optimization.
