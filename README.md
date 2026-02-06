# LiveCaps: Real-Time Speech Transcription and Translation

LiveCaps is a real-time speech transcription and translation system built on top of Deepgram's Nova-3 streaming API and a multi-provider translation backend. It is designed for low-latency captioning in live environments such as talks, meetups, and hybrid events.

The application runs entirely in the browser on top of Next.js, with a thin set of API routes for authentication, translation, caching, and RAG-based vocabulary correction. Audio is streamed in small chunks to Deepgram, converted into text, grouped into sentences, and then translated asynchronously into one or more target languages. An optional RAG system learns domain-specific vocabulary from uploaded documents and automatically corrects misrecognized terms in real time.

![alt text](image.png)
---

## Highlights and Techniques

- **Streaming audio capture in the browser**  
   Audio is captured via the MediaRecorder API ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)) in 100 ms chunks and streamed to Deepgram over a persistent WebSocket connection ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)). This keeps end‑to‑end latency low while avoiding excessive request overhead.

- **Web Audio–based visualization**  
   The audio visualizer is built on top of the Web Audio API ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)), giving users immediate feedback on input levels and signal presence.

- **RAG-based vocabulary correction**
   Users can upload presentation materials (PDF, PPTX, DOCX, TXT, MD) before a session. The system extracts domain-specific terms, indexes them in a vector database ([Upstash Vector](https://upstash.com/docs/vector/overall/getstarted)), and uses hybrid semantic + phonetic search to correct low-confidence words in real time. An LLM ([Groq](https://groq.com) with Llama 3.3 70B) makes the final correction decisions. For example, if Deepgram transcribes "cooper netties" with low confidence, the RAG system detects that "Kubernetes" from the uploaded slides is a strong phonetic and semantic match, and corrects accordingly.

- **Asynchronous translation queue on the client**
   The main orchestrator in [app/components/App.tsx](app/components/App.tsx) maintains a queue of completed sentences and processes them asynchronously, so translation calls never block ongoing transcription. This decouples the "speech → text" loop from the "text → translation" loop.

- **Sentence detection and buffering**  
   Text from Deepgram is buffered and segmented into sentences using a lightweight sentence detector, rather than pushing every interim token to translation. This improves translation quality and keeps the UI output stable and readable.

- **Multi-language winner selection**  
   In multi-language mode, [app/context/MultiDeepgramContextProvider.tsx](app/context/MultiDeepgramContextProvider.tsx) opens one Deepgram stream per candidate spoken language and selects a “winner” transcript per time window based on model confidence. All downstream logic works off these winner segments.

- **Unified transcript blocks**  
   Transcripts are represented as unified blocks in [app/components/App.tsx](app/components/App.tsx), each containing the original sentence and all translations. This avoids duplicated layout logic and keeps the UI consistent across single- and multi-language modes.

- **Server-side translation cache**  
   A singleton in-memory cache in [app/lib/translationCache.ts](app/lib/translationCache.ts) stores translations with TTL and a capped size. It is exposed via [app/api/cache/route.ts](app/api/cache/route.ts) for stats, clearing, and warm-up of common phrases.

- **Thin translation API with provider fallback**  
   The translation API handler in [app/api/translate/route.ts](app/api/translate/route.ts) prefers DeepL, falling back to Google Translate’s HTTP endpoint. Errors are surfaced clearly to the client, and responses are structured to support future providers.

- **Context-based wiring for runtime services**  
   React Context is used to encapsulate Deepgram connections, microphone access, and theme state in [app/context](app/context). The UI is kept relatively dumb; most side-effects and state transitions are concentrated in these providers.

- **Static key exchange via authenticate endpoint**  
   A small authentication endpoint at [app/api/authenticate/route.ts](app/api/authenticate/route.ts) issues short-lived API keys to the browser, keeping long-lived credentials out of client bundles.

---

## Technologies and Libraries

This project uses a mix of common and less common tools. The ones below may be of particular interest:

- **Next.js 14 App Router**  
   Next.js ([website](https://nextjs.org/)) powers routing, serverless API handlers, and static asset handling. The application uses the App Router (`app/` directory) and client components for all real-time behavior.

- **React 18**  
   React ([website](https://react.dev/)) is used with function components and hooks, along with context providers for cross-cutting concerns (microphone, Deepgram, dark mode, multi-language orchestration).

- **Deepgram SDK (@deepgram/sdk)**  
   The official Deepgram SDK ([npm](https://www.npmjs.com/package/@deepgram/sdk), [docs](https://developers.deepgram.com/)) is used to manage live transcription WebSocket sessions and handle streaming events.

- **Tailwind CSS**  
   Tailwind CSS ([website](https://tailwindcss.com/)) is used for styling, enabling a utility-first, layout-oriented approach without a separate component library.

- **Custom ABC Favorit font**  
   Bold weights of the ABC Favorit typeface (ABCFavorit-Bold) are bundled under [app/fonts](app/fonts). ABC Favorit is published by Dinamo ([typeface page](https://abcdinamo.com/typefaces/favorit)) and is integrated via local font files.

- **Device-aware behavior via react-device-detect**  
   The project uses `react-device-detect` ([npm](https://www.npmjs.com/package/react-device-detect)) to adapt behavior or messaging based on device characteristics where needed.

- **React GitHub button integration**  
   `react-github-btn` ([npm](https://www.npmjs.com/package/react-github-btn)) is used to embed interactive GitHub buttons without hand-rolling iframes.

- **Syntax-highlighted code blocks**  
   `react-syntax-highlighter` ([npm](https://www.npmjs.com/package/react-syntax-highlighter)) is included for rendering highlighted code blocks in documentation or demo views.

- **RAG vocabulary correction pipeline**
   The RAG system uses several external services and libraries to correct domain-specific terms in real time:
   - **Upstash Vector** ([docs](https://upstash.com/docs/vector/overall/getstarted)) – serverless vector database for storing and searching term embeddings, with per-session namespace isolation.
   - **Jina AI Embeddings** ([website](https://jina.ai/embeddings/)) – generates 768-dimensional vectors using the `jina-embeddings-v3` model, with LRU caching and hash-based fallback.
   - **Groq** ([website](https://groq.com)) – fast LLM inference using `llama-3.3-70b-versatile` for context-aware correction decisions at temperature 0.1.
   - **soundex-code** ([npm](https://www.npmjs.com/package/soundex-code)) – Soundex phonetic encoding for sound-alike matching, combined with a custom Metaphone implementation.
   - **unpdf** ([npm](https://www.npmjs.com/package/unpdf)) – PDF text extraction.
   - **mammoth** ([npm](https://www.npmjs.com/package/mammoth)) – DOCX to text conversion.
   - **JSZip** ([npm](https://www.npmjs.com/package/jszip)) – PPTX parsing by reading slide XML and speaker notes from the ZIP archive.
   - **lru-cache** ([npm](https://www.npmjs.com/package/lru-cache)) – caching for embedding results with 24-hour TTL.

- **Testing with Jest**
   - **Jest** ([website](https://jestjs.io/)) with **ts-jest** for TypeScript support.
   - **@testing-library/react** and **@testing-library/jest-dom** for component testing.
   - Comprehensive test suites covering RAG modules (phonetic matching, term extraction, document parsing, correction pipeline) and integration tests.

- **Commit linting and automated release tooling**
   - `@commitlint/cli` and `@commitlint/config-conventional` ([website](https://commitlint.js.org/)) enforce conventional commit messages.
   - `semantic-release` plugins such as `@semantic-release/changelog` and `@semantic-release/git` ([website](https://semantic-release.gitbook.io/semantic-release/)) automate changelog updates and tagging.
   - `husky` ([npm](https://www.npmjs.com/package/husky)) and `pretty-quick` ([npm](https://www.npmjs.com/package/pretty-quick)) manage pre-commit formatting and commit hooks.

---

## Project Structure

```text
.
├── CHANGELOG.md
├── CODEBASE_WALKTHROUGH.md
├── IMPLEMENTATION_STATUS.md
├── KNOWN_ISSUES.md
├── MULTI_LANGUAGE_ARCHITECTURE.md
├── README.md
├── TECHNICAL_DOCUMENTATION.md
├── app/
│   ├── api/
│   │   ├── authenticate/     # Deepgram key provisioning
│   │   ├── cache/            # Translation cache management
│   │   ├── rag/
│   │   │   ├── correct/      # Transcript correction endpoint
│   │   │   ├── session/      # RAG session management
│   │   │   ├── upload/       # Document upload and indexing
│   │   │   └── upload-stream/ # Streaming upload with SSE progress
│   │   ├── translate/        # Translation endpoints
│   │   └── ...
│   ├── app/
│   ├── components/
│   ├── context/
│   ├── fonts/
│   ├── hooks/
│   │   └── useRAG.ts         # React hook for RAG state management
│   ├── lib/
│   │   ├── corrector.ts      # RAG correction orchestrator
│   │   ├── documentParser.ts # PDF/DOCX/PPTX/TXT/MD parser
│   │   ├── embeddingsService.ts # Jina AI embeddings with caching
│   │   ├── llmCorrection.ts  # Groq LLM correction integration
│   │   ├── phoneticMatcher.ts # Soundex + Metaphone matching
│   │   ├── termExtractor.ts  # Term extraction and categorization
│   │   ├── vectorStore.ts    # Upstash Vector DB integration
│   │   └── ...
│   ├── services/
│   │   ├── ragService.ts     # Client-side RAG API wrapper
│   │   └── ...
│   ├── types/
│   │   ├── rag.ts            # RAG type definitions
│   │   └── ...
│   └── utils/
├── public/
├── middleware.ts
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

Key directories:

- [app](app)  
   Next.js App Router root. Contains all pages, API routes, components, and runtime wiring.

- [app/app](app/app)  
   Page shell and layout for the main application under `/app`, embedding the core runtime component and shared UI chrome.

- [app/components](app/components)  
   UI components, including the primary orchestrator [app/components/App.tsx](app/components/App.tsx) and smaller pieces like selectors, toggles, footer, and visualizer.

- [app/context](app/context)  
   React context providers for microphone access, Deepgram connections (single and multi-language), dark mode, and multi-deepgram orchestration.

- [app/api](app/api)
   Backend route handlers for authentication ([app/api/authenticate/route.ts](app/api/authenticate/route.ts)), translation ([app/api/translate/route.ts](app/api/translate/route.ts)), cache management ([app/api/cache/route.ts](app/api/cache/route.ts)), RAG operations ([app/api/rag](app/api/rag)), and test utilities.

- [app/lib](app/lib)
   Server-side utilities, including the in-memory translation cache in [app/lib/translationCache.ts](app/lib/translationCache.ts) and the RAG pipeline modules (document parsing, term extraction, embeddings, phonetic matching, vector store, LLM correction).

- [app/hooks](app/hooks)
   React hooks, including [app/hooks/useRAG.ts](app/hooks/useRAG.ts) for managing RAG session state in components.

- [app/types](app/types)
   TypeScript type definitions, including [app/types/rag.ts](app/types/rag.ts) for all RAG-related interfaces and configuration.

- [app/services](app/services)  
   Client-side services such as [app/services/translationService.ts](app/services/translationService.ts), which wraps the translation API and handles sentence-based batching.

- [app/utils](app/utils)  
   Small, focused helpers (for example, for audio duplication and confidence comparison) used by the multi-language orchestration and other components.

- [app/fonts](app/fonts)  
   Local font files (ABCFavorit-Bold) used by the UI.

- [public](public)  
   Static assets such as images and the main UI screenshot referenced from the README.

- [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md)  
   Single, in-depth guide covering system architecture, multi-language design, data flow, and an end-to-end code walkthrough.

---

## Further Reading

- [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md) – consolidated system overview, architecture, multi-language design, RAG system, and runtime walkthrough.
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) – book-style walkthrough for developers new to the codebase.
- [TESTING.md](TESTING.md) – RAG test suite documentation and usage.
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) – current limitations and open issues.
- [CHANGELOG.md](CHANGELOG.md) – release history and notable changes.


Then open:

- `http://localhost:3000/` – landing page.
- `http://localhost:3000/app` – main transcription and translation UI.

---

## Usage

1. Open `/app` in your browser.
2. Allow microphone access when the browser prompts you.
3. Choose one or more spoken languages and one or more display (target) languages.
4. **(Optional) Upload context documents** – If you are presenting on a specific topic, upload your slides or notes (PDF, PPTX, DOCX, TXT, or MD) using the RAG upload panel. The system will extract domain-specific terms and use them to correct transcription errors in real time.
5. Start speaking. You will see:
    - Interim text for the current utterance.
    - Stable transcript blocks where each block contains the original sentence and all translations.
    - If RAG is enabled and context documents have been uploaded, low-confidence words will be automatically corrected using your vocabulary.
6. Use the fullscreen mode and dark mode when projecting to an audience.

The visualizer at the bottom of the screen gives quick feedback on audio input levels.

---

## Configuration

Most configuration lives in the context providers and services:

- Deepgram options (model, endpointing, interim results):
   - `app/context/DeepgramContextProvider.tsx`
   - `app/context/MultiDeepgramContextProvider.tsx`

- Sentence detection and translation behavior:
   - `app/services/translationService.ts`

- Translation cache settings (TTL, size, preloaded phrases):
   - `app/lib/translationCache.ts`

- RAG vocabulary correction settings:
   - `app/types/rag.ts` – default configuration (`DEFAULT_RAG_CONFIG`)
   - `app/lib/corrector.ts` – correction orchestration and thresholds
   - `app/lib/vectorStore.ts` – vector search weights and batch sizes
   - `app/lib/llmCorrection.ts` – LLM model, temperature, and timeout

Key RAG configuration defaults (from `app/types/rag.ts`):

| Setting | Default | Description |
|---------|---------|-------------|
| `confidenceThreshold` | 0.7 | Words below this Deepgram confidence get flagged for correction |
| `similarityThreshold` | 0.75 | Minimum combined match score to consider a replacement |
| `maxTermsToRetrieve` | 10 | Top-K results from vector search per query |
| `phoneticWeight` | 0.3 | Weight of phonetic similarity in the hybrid score |
| `semanticWeight` | 0.7 | Weight of semantic similarity in the hybrid score |
| `useLLMCorrection` | true | Whether to use Groq LLM for final correction decisions |
| `llmModel` | llama-3.3-70b-versatile | Groq model used for corrections |
| `batchSize` | 5 | Low-confidence words processed per batch |
| `timeoutMs` | 3000 | Timeout for each correction operation |

Environment variables are documented in `sample.env.local` and in [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md).

### RAG Environment Variables

The RAG system requires the following environment variables (all optional; set `RAG_ENABLED=true` to activate):

```bash
RAG_ENABLED=true                          # Enable the RAG correction system
UPSTASH_VECTOR_REST_URL=https://...       # Upstash Vector database URL
UPSTASH_VECTOR_REST_TOKEN=...             # Upstash Vector authentication token
JINA_API_KEY=jina_...                     # Jina AI API key for embeddings
GROQ_API_KEY=gsk_...                      # Groq API key for LLM corrections
RAG_CONFIDENCE_THRESHOLD=0.7              # Optional: override default threshold
```

---

## Performance Characteristics

The system is optimized for low end-to-end latency by:

- Sending 100 ms audio chunks to Deepgram.
- Using interim transcripts for immediate feedback and buffering for stable sentences.
- Decoupling translation from transcription via an internal translation queue.
- Optionally warming and using a server-side translation cache for common phrases.

Empirically, under normal network conditions, the system targets:

- Speech-to-text latency on the order of 100 ms.
- Translation latency in the range of 200–500 ms (faster on cache hits).

Actual performance depends on network conditions and external provider behavior; see [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md) for more detail.

---

## Development

- The app uses the Next.js App Router (directory `app/`).
- All real-time behavior is implemented in client components and React contexts.
- TypeScript is used throughout the codebase.
- Tailwind CSS is used for styling.

Codebase-level documentation:
[ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md) All the technical stuff explained here
---

## Known Issues

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the current list of limitations and open items.

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch (for example, `feature/mode-toggle`).
3. Make your changes and add tests or documentation as appropriate.
4. Run the application locally to verify behavior.
5. Open a pull request with a clear description of the changes.

---

## Acknowledgements

- [Deepgram](https://deepgram.com) for the speech recognition API.
- [DeepL](https://deepl.com) and Google Translate for translation.
- [Upstash](https://upstash.com) for the serverless vector database.
- [Jina AI](https://jina.ai) for text embeddings.
- [Groq](https://groq.com) for fast LLM inference.
- [Next.js](https://nextjs.org) and the React ecosystem.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a history of notable changes.

