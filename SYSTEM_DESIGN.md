# LiveCaps — System Design

A real-time browser captioning and translation system with on-the-fly vocabulary correction via RAG.

This document describes the architecture, data flow, key components, and the design decisions behind them. It is the reference companion for understanding how the system fits together end to end.

---

## 1. One-paragraph overview

Audio is captured in the browser in 100 ms chunks and streamed over WebSocket to Deepgram (Nova-3). Word-level transcripts come back with confidence scores, are buffered into sentences, and emitted as `TranscriptBlock`s — the single source of truth for the UI. Each block is then enriched along two parallel, non-blocking paths: (1) a translation queue that fans out to N target languages via DeepL (with Google fallback), and (2) a RAG correction pipeline that retrieves the speaker's domain vocabulary from Upstash Vector using a hybrid semantic + phonetic search and asks a Groq-hosted LLM to apply targeted corrections to low-confidence words. Blocks update in place by ID, so the UI never blocks on the slow path.

---

## 2. System diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Next.js 14, React 18)                          │
│                                                                                  │
│   ┌──────────────┐   100ms chunks   ┌──────────────────────────────────────┐    │
│   │ MediaRecorder│ ───────────────► │   DeepgramContextProvider (single)   │    │
│   │  + WebAudio  │                  │   MultiDeepgramContextProvider (N)   │    │
│   │  Visualizer  │                  │     • parallel WebSockets / language │    │
│   └──────────────┘                  │     • confidence-based winner select │    │
│          │                          │     • circuit breaker per connection │    │
│          │                          └──────────────────┬───────────────────┘    │
│          │                                             │                        │
│          │                          interim + final transcripts (with           │
│          │                          word-level confidence + language tags)      │
│          │                                             ▼                        │
│          │                          ┌──────────────────────────────────────┐    │
│          │                          │       App.tsx — Orchestrator         │    │
│          │                          │  ┌────────────────────────────────┐  │    │
│          │                          │  │ Sentence buffer + boundary     │  │    │
│          │                          │  │ detection (Latin/Cyrillic/CJK) │  │    │
│          │                          │  └────────────────────────────────┘  │    │
│          │                          │  ┌────────────────────────────────┐  │    │
│          │                          │  │  TranscriptBlock[] (single     │  │    │
│          │                          │  │  source of truth keyed by id)  │  │    │
│          │                          │  └────────────────────────────────┘  │    │
│          │                          │      │                  │            │    │
│          │                          │      ▼                  ▼            │    │
│          │                          │ translationQueue   RAG correction    │    │
│          │                          │ (async, per-lang)  (async, per-block)│    │
│          │                          └─────┬─────────────────────┬──────────┘    │
│          │                                │                     │               │
│          │                                ▼                     ▼               │
│          │                       /api/translate         /api/rag/correct        │
│          │                       /api/rag/upload-stream (SSE)                   │
└──────────┼────────────────────────────────┼─────────────────────┼───────────────┘
           │                                │                     │
           │ JWT-cookie auth (jose)         │                     │
           │ middleware.ts route guard      │                     │
           ▼                                ▼                     ▼
┌──────────────────┐     ┌────────────────────┐    ┌────────────────────────────┐
│ /api/authenticate│     │  /api/translate    │    │   /api/rag/* (Node)        │
│ short-lived      │     │  DeepL → Google    │    │ ┌────────────────────────┐ │
│ Deepgram key     │     │  fallback chain    │    │ │ documentParser         │ │
│ (60s TTL)        │     │  + in-mem cache    │    │ │ unpdf / mammoth / JSZip│ │
└────────┬─────────┘     │  (singleton, TTL)  │    │ └────────────┬───────────┘ │
         │               └─────────┬──────────┘    │              ▼             │
         ▼                         │               │ ┌────────────────────────┐ │
   Deepgram Nova-3                 ▼               │ │ termExtractor          │ │
   (cloud ASR)              DeepL / Google         │ │ NER + Soundex codes    │ │
                                                   │ └────────────┬───────────┘ │
                                                   │              ▼             │
                                                   │ ┌────────────────────────┐ │
                                                   │ │ embeddingsService      │ │
                                                   │ │ Jina v3 (768d)         │ │
                                                   │ │ + LRU cache + fallback │ │
                                                   │ └────────────┬───────────┘ │
                                                   │              ▼             │
                                                   │ ┌────────────────────────┐ │
                                                   │ │ vectorStore.hybridSearch│ │
                                                   │ │ semantic ⊕ phonetic    │ │
                                                   │ │ session-namespaced     │ │
                                                   │ └────────────┬───────────┘ │
                                                   │              ▼             │
                                                   │ ┌────────────────────────┐ │
                                                   │ │ corrector → llmCorr    │ │
                                                   │ │ Groq Llama-3.3-70B     │ │
                                                   │ │ JSON-mode @ temp 0.1   │ │
                                                   │ │ rule-based fallback    │ │
                                                   │ └────────────────────────┘ │
                                                   └────────────┬───────────────┘
                                                                ▼
                                                   ┌────────────────────────────┐
                                                   │ Upstash Vector (serverless)│
                                                   │ filter: sessionId='...'    │
                                                   └────────────────────────────┘

   Auth/billing plane (separate, lighter):
   Postgres (Prisma) — User, Session, UsageRecord │ Stripe checkout/portal/webhook
```

---

## 3. The three nested loops (mental model)

The system is best understood as three decoupled loops operating at different time scales. Each loop produces work for the next without blocking it.

| Loop | Cadence | Input | Output | Owner |
|---|---|---|---|---|
| **Audio loop** | every 100 ms | mic samples | interim + final transcripts | `MediaRecorder` → `DeepgramContextProvider` |
| **Sentence loop** | every few seconds | transcript fragments | `TranscriptBlock` (committed to UI) | `App.tsx` buffer + boundary detector |
| **Enrichment loop** | async, fire-and-forget | committed block | translations + RAG corrections | `translationQueue` + `applyRAGCorrection` |

The enrichment loop **never blocks** the sentence loop, which **never blocks** the audio loop. Blocks are mutated in place by `id`, so a slow translation or RAG correction can resolve seconds later and still update the right caption without re-rendering history.

---

## 4. Component reference

### 4.1 Browser layer

| Component | File | Responsibility |
|---|---|---|
| `App.tsx` | `app/components/App.tsx` | Orchestrator. Owns `TranscriptBlock[]`, sentence buffer, translation queue, RAG dispatch. ~1670 lines because it owns the cross-loop state. |
| `DeepgramContextProvider` | `app/context/DeepgramContextProvider.tsx` | Single-language WebSocket connection to Deepgram. |
| `MultiDeepgramContextProvider` | `app/context/MultiDeepgramContextProvider.tsx` | N parallel WebSocket connections (one per candidate language) with confidence-based winner selection, early-exit at 0.85, and a circuit breaker that marks a connection unhealthy after 3 errors. |
| `MicrophoneContextProvider` | `app/context/MicrophoneContextProvider.tsx` | `MediaRecorder` lifecycle and audio stream events. |
| `useRAG` | `app/hooks/useRAG.ts` | React hook wrapping `RAGService`. Owns session ID, ready state, upload/correct/clear actions. |
| `RAGUpload` | `app/components/RAGUpload.tsx` | Drag-and-drop upload with SSE progress reporting. |

### 4.2 API routes (Next.js App Router)

| Route | File | Purpose |
|---|---|---|
| `GET /api/authenticate` | `app/api/authenticate/route.ts` | Issues a short-lived (60s) Deepgram key so long-lived credentials never reach the browser. |
| `POST /api/translate` | `app/api/translate/route.ts` | DeepL primary, Google Translate fallback. Backed by an in-memory singleton cache with TTL. |
| `POST /api/rag/upload-stream` | `app/api/rag/upload-stream/route.ts` | Multipart upload + SSE progress stream (parsing → extracting → indexing → complete). |
| `POST /api/rag/correct` | `app/api/rag/correct/route.ts` | Synchronous correction call with full word-confidence payload. |
| `GET/DELETE /api/rag/session` | `app/api/rag/session/route.ts` | Session info / cleanup. |
| `POST /api/auth/*` | `app/api/auth/*` | Email/password auth, JWT cookies via `jose`. |
| `POST /api/stripe/*` | `app/api/stripe/*` | Checkout, portal, webhook. |
| `middleware.ts` | root | Route guard: protected routes 401 if no valid JWT cookie; `/login` and `/signup` redirect away if already authed. |

### 4.3 Server-side libraries (`app/lib/`)

| Module | File | Responsibility |
|---|---|---|
| `documentParser` | `documentParser.ts` | Routes by MIME type → `unpdf` (PDF), `mammoth` (DOCX), `JSZip` (PPTX, reads `ppt/slides/*.xml` and notes), or raw text. |
| `termExtractor` | `termExtractor.ts` | Lightweight NER without a model: proper-noun detection, acronym/technical-term patterns, frequency weighting, category assignment, Soundex code per term. Pre-builds a word→sentence index for O(1) context lookup. |
| `embeddingsService` | `embeddingsService.ts` | Jina `jina-embeddings-v3` (768d). LRU cache (10k entries, 24h TTL). Hash-based deterministic fallback if the API fails so the pipeline still produces *something* indexable. |
| `vectorStore` | `vectorStore.ts` | Upstash Vector wrapper. Per-session namespace via `filter: sessionId = '...'`. Implements `hybridSearch` (semantic ⊕ phonetic), `searchSessionTerms` (semantic only with phonetic re-ranking), and `getSessionTerms` (bulk fetch for in-memory phonetic matching). |
| `phoneticMatcher` | `phoneticMatcher.ts` | Soundex + a custom Metaphone implementation. Combined phonetic similarity score in [0, 1]. |
| `corrector` | `corrector.ts` | Pipeline orchestrator: identify low-confidence words → build queries → fetch session terms → hybrid search → call LLM → return diff. Tracks global stats. |
| `llmCorrection` | `llmCorrection.ts` | Groq client (`llama-3.3-70b-versatile`, temp 0.1). Constrained JSON prompt. Regex-based parser with fallback for malformed JSON. **Rule-based fallback path** that runs the same candidate terms through phonetic-similarity matching when the LLM is unavailable. |
| `translationCache` | `translationCache.ts` | Singleton in-memory cache (max 2000 entries, 24h TTL) used by `/api/translate`. |

### 4.4 Persistence

| Store | Schema / Tables | Purpose |
|---|---|---|
| **Postgres** (Prisma) | `User`, `Session`, `UsageRecord` | Auth, session history, daily usage tracking for tiered billing. |
| **Upstash Vector** | single index, multi-tenant via `sessionId` filter | RAG term embeddings (768d). |
| **In-memory (singleton)** | translation cache, embedding LRU | Hot-path latency reduction, cleared on server restart. |

### 4.5 External services

| Service | Use | Failure mode |
|---|---|---|
| **Deepgram Nova-3** | Live streaming ASR | Per-connection circuit breaker; in multi-mode, other language streams continue. |
| **DeepL** | Primary translation | Falls back to Google Translate's HTTP endpoint. |
| **Google Translate** | Fallback translation | Returns original text on failure rather than throwing. |
| **Jina AI** | Text embeddings | Falls back to deterministic hash-based vectors so indexing never blocks. |
| **Groq (Llama 3.3 70B)** | LLM correction | Falls back to deterministic rule-based correction over the same candidate set. |
| **Upstash Vector** | Vector storage | Errors return empty result sets; correction returns the original transcript unchanged. |
| **Stripe** | Billing | Webhook-driven, signature-verified. |

---

## 5. Key data structures

### `TranscriptBlock` — the unit of UI state

Defined in `app/components/App.tsx`. Each spoken sentence becomes exactly one block, owned by the orchestrator.

```ts
type TranscriptBlock = {
  id: string;                  // unique key, used by translation/RAG to update in place
  original: {
    text: string;              // may be replaced by RAG correction
    language: string;          // dominant detected language (e.g. "en", "ko")
  };
  translations: {
    language: string;          // target language code (e.g. "es", "ja")
    text: string | null;       // null while pending
  }[];
  ragCorrected?: {
    originalText: string;      // pre-correction text, kept for hover-to-reveal UI
    correctedTerms: string[];  // list of replaced terms
  };
};
```

The single-source-of-truth shape was a deliberate refactor away from parallel `originalSentences[]` and `translatedSentences[]` arrays that kept desyncing.

### `WordConfidence` — what RAG keys off

Captured from Deepgram's word-level output, passed through to the corrector.

```ts
type WordConfidence = {
  word: string;
  confidence: number;  // 0..1
  start: number;       // seconds into the audio
  end: number;
};
```

### `ExtractedTerm` — what RAG retrieves over

Produced by `termExtractor`, stored as metadata on every Upstash Vector record.

```ts
type ExtractedTerm = {
  term: string;
  normalizedTerm: string;
  context: string;       // 2-3 surrounding sentences
  sourceFile: string;
  phoneticCode: string;  // Soundex code for fast phonetic matching
  frequency: number;
  isProperNoun: boolean;
  category: "person" | "organization" | "product" | "location"
          | "acronym" | "technical" | "heading" | "general";
};
```

---

## 6. End-to-end data flow

### 6.1 Session start

1. User opens `/app`. `middleware.ts` checks the JWT cookie; unauthenticated users are redirected to `/login`.
2. The browser fetches `GET /api/authenticate`, which provisions a 60-second Deepgram key. The long-lived key never leaves the server.
3. `MicrophoneContextProvider` requests mic access. `DeepgramContextProvider` (or `MultiDeepgramContextProvider` in multi-language mode) opens a WebSocket to Deepgram with `interim_results`, `smart_format`, `endpointing: 300`, `utterance_end_ms: 2500`, `vad_events: true`.

### 6.2 Document upload (RAG priming, optional)

1. User drops a PDF/PPTX/DOCX/TXT/MD onto `RAGUpload`.
2. `POST /api/rag/upload-stream` receives the file. The route streams progress over SSE.
3. `documentParser` extracts raw text via `unpdf` / `mammoth` / `JSZip`.
4. `termExtractor` builds a sentence index, runs proper-noun / acronym / technical-term detection, weights by frequency × category, generates a Soundex code per term, and returns `ExtractedTerm[]`.
5. The route caps to `MAX_TERMS_TO_INDEX = 150`, prioritizing proper nouns and high-frequency terms.
6. `embeddingsService.embedBatch` generates 768d Jina vectors (LRU-cached, hash-fallback on failure).
7. `vectorStore.indexSessionContent` upserts into Upstash Vector with `sessionId` in the metadata. Progress callbacks fire SSE events at every batch.
8. The route emits a `complete` event with the final session ID, term counts, and category breakdown. The browser stores `sessionId` in `useRAG`.

### 6.3 Speech in flight

1. `MediaRecorder` fires `dataavailable` every 100 ms. `App.tsx`'s `onData` handler ships the blob over the open Deepgram WebSocket (or to *all* connections in multi-mode).
2. Deepgram emits `Transcript` events. Interim results update `currentInterimText` for immediate visual feedback. Final results enter the sentence buffer.
3. The sentence buffer in `App.tsx` accumulates text and runs `detectCompleteSentences`, which requires ≥40 chars and ≥4 words and a clean boundary (`.!?` followed by capital, with Cyrillic and CJK ranges supported).
4. If no boundary appears within 3.5 s, `processBufferedText` falls back to clause-level splits (`,;–—` or conjunctions) in the last 30% of the buffer. This avoids fragmenting on brief pauses while still flushing eventually.
5. When a sentence is committed, `App.tsx` constructs a `TranscriptBlock` with one `null` translation slot per display language, appends it to state, and dispatches enrichment.

### 6.4 Translation enrichment (per block, per target language)

1. `queueTranslation(blockId, text, targetLang)` pushes onto `translationQueue.current`.
2. `processTranslationQueue` runs single-flight, popping one job at a time.
3. Each job calls `translateBySentences` → `POST /api/translate`.
4. The route checks the in-memory cache first; on miss it calls DeepL, falling back to Google's unofficial endpoint, returning the original text on total failure.
5. The orchestrator updates the block by `id`, swapping the matching `translations[].text` from `null` to the result. React re-renders only that block.

### 6.5 RAG enrichment (per block, fired in parallel with translation)

1. `applyRAGCorrection(blockId, text, wordConfidences, language)` runs only if `isRAGReady` and the block has any words below the confidence threshold (0.7).
2. `POST /api/rag/correct` validates the payload and calls `corrector.correctTranscript`.
3. `corrector` identifies low-confidence words, groups adjacent ones into phrases, builds search queries (including ±1 word context), and calls `vectorStore.hybridSearch`.
4. `hybridSearch` runs **semantic search** (Jina embedding → Upstash Vector query, filtered by `sessionId`) and **phonetic search** (Soundex/Metaphone over cached session terms) **in parallel**, then merges by normalized term with weighted scores: `0.7 * semantic + 0.3 * phonetic`. Phonetic-only matches use a relaxed threshold because that's exactly the misheard-word case.
5. The top candidates are passed to `llmCorrection.correctWithLLM`, which builds a constrained JSON prompt with the speaker's vocabulary and the low-confidence words, calls Groq (`llama-3.3-70b-versatile`, temp 0.1), and parses the response.
6. If the LLM is unavailable or returns malformed JSON, `applyRuleBasedCorrections` runs the same candidate set through a deterministic phonetic-match-and-replace path. The system **degrades, it does not fail**.
7. The corrector returns `{ correctedTranscript, corrections, wasModified }`.
8. If `wasModified`, the orchestrator updates the block's `original.text`, stores the pre-correction text under `ragCorrected`, resets all translations to `null`, and **re-queues translation against the corrected text**. Translations always reflect what the speaker actually said, not what Deepgram first heard.

### 6.6 Multi-language detection (optional mode)

When the user enables multi-language detection with N candidate spoken languages:

1. `MultiDeepgramContextProvider.connectToDeepgram(languages)` opens N WebSocket connections in parallel, one per language.
2. The audio data event broadcasts to all connections via `sendAudioToAll`.
3. Each connection emits final transcripts with confidence scores. Results enter a `TranscriptBuffer` keyed by time window.
4. **Early exit**: if any single connection returns a final result with confidence ≥ 0.85, that result wins immediately and the buffer is flushed without waiting for the others. (`HIGH_CONFIDENCE_EARLY_EXIT` in `confidenceComparison.ts`.)
5. Otherwise, after a short window (30 ms default, max 80 ms), the highest-confidence result among the connections wins.
6. The winner is emitted as a `WinnerTranscript` event, which `App.tsx`'s `handleWinnerTranscript` processes the same way as a single-mode final transcript — same buffer, same blocks, same enrichment paths.
7. **Circuit breaker**: a connection that errors 3+ times is marked unhealthy and excluded from comparison, but the others keep running.

---

## 7. Design decisions and tradeoffs

### 7.1 Decoupled enrichment loops

**Decision.** Translation and RAG correction run as fire-and-forget async work, never on the transcription path.

**Why.** The first version blocked rendering on the LLM call. The transcript would visibly freeze for ~1 s every time a sentence completed. Optimistic rendering — show the raw transcript immediately, update in place when the slow path resolves — is the only design that keeps the UI feeling live.

**Cost.** The user briefly sees the uncorrected transcript before RAG fixes it. This is acceptable because (a) the uncorrected version is usually intelligible, (b) the corrected version arrives within ~1–2 s, and (c) the alternative is a frozen UI, which is worse.

### 7.2 Single source of truth: `TranscriptBlock[]`

**Decision.** Each spoken sentence is one block that owns its text, language, all translations, and correction metadata.

**Why.** The first version had parallel `originalSentences[]` and `translatedSentences[]` arrays. They desynced constantly — translations arriving out of order, sentences being added on one side but not the other. Collapsing to one keyed structure killed an entire class of bugs.

**Cost.** A small amount of boilerplate to update blocks by ID via `prev.map(...)`. Worth it.

### 7.3 Hybrid retrieval: semantic ⊕ phonetic

**Decision.** Run Jina-embedding semantic search and Soundex/Metaphone phonetic search in parallel, then merge with weighted scores (0.7 semantic, 0.3 phonetic) — but use a relaxed threshold for phonetic-only matches.

**Why.** Pure semantic embeddings miss "cooper netties" → "Kubernetes" because they don't model pronunciation. Pure phonetic matching misses paraphrases. The misheard-word case is dominated by phonetic similarity, so phonetic-only matches are *not* penalized by the semantic weight.

**Cost.** Two index passes per query, but they run concurrently via `Promise.all` so latency is bounded by the slower of the two (semantic, ~100 ms typical).

### 7.4 LLM with rule-based fallback

**Decision.** The LLM (`llama-3.3-70b-versatile` at temperature 0.1) makes the final correction decision, with a deterministic phonetic-match-and-replace fallback if the LLM is unavailable or returns malformed JSON.

**Why.** Conservative correction matters more than aggressive correction — the cost of a wrong "fix" is higher than the cost of leaving a misheard word alone. The constrained JSON prompt explicitly tells the model to prefer not correcting. The rule-based path uses the same candidate set, so the system always produces *some* answer rather than failing.

**Cost.** Two code paths to maintain. The rule-based path is less context-aware than the LLM path. Acceptable because it only runs on failure.

### 7.5 Per-session vector namespacing

**Decision.** Multi-tenant from day one via `filter: sessionId = '<id>'` on every Upstash Vector query.

**Why.** Two simultaneous presenters would otherwise pollute each other's vocabulary. Filtering on metadata is cheaper than running separate indexes per session.

**Cost.** Filter queries are slightly slower than namespace-native isolation. Negligible at current scale.

### 7.6 Short-lived Deepgram keys

**Decision.** `/api/authenticate` provisions a 60-second scoped key per session. The long-lived API key stays on the server.

**Why.** Long-lived API keys in client bundles are an exfiltration risk. A 60-second key bounds the blast radius of a leak to one session.

**Cost.** One extra round-trip on connect. Cached aggressively at the response layer.

### 7.7 Sentence buffering with multi-stage fallback

**Decision.** Require ≥60 chars and ≥4 words before flushing. Try sentence boundaries first, fall back to clause boundaries (commas, conjunctions) only in the last 30% of the buffer, and time out at 3.5 s if neither appears.

**Why.** Naive sentence detection split mid-thought constantly, producing fragmented translations and broken corrections. The cost of waiting another second for a clean boundary is much smaller than the cost of translating "the quick" and then "brown fox" as two separate captions.

**Cost.** Up to ~3.5 s of latency on speech that lacks clean boundaries. Mitigated by the utterance-end signal from Deepgram, which flushes early if the speaker pauses.

### 7.8 In-memory caches over Redis

**Decision.** Translation cache and embedding LRU live in process memory, not Redis.

**Why.** Single-instance Vercel deployment, low coordination cost, zero external dependencies for the hot path. Cache loss on restart is acceptable because the cache warms back up within seconds.

**Cost.** Doesn't scale horizontally without sticky sessions. Acceptable for the current deployment model. Promotable to Redis later without changing the call sites — both modules expose a singleton interface.

---

## 8. Performance characteristics

| Stage | Typical latency | Notes |
|---|---|---|
| Audio chunk → Deepgram → first interim | ~100–200 ms | Bounded by network + Deepgram |
| Final transcript → `TranscriptBlock` rendered | ~0 ms | Same React tick |
| Block rendered → translation visible | ~200–500 ms | DeepL; cache hits are instant |
| Block rendered → RAG correction visible | ~500–1500 ms | Jina embedding + Upstash query + Groq inference |
| Multi-language winner selection | ≤30–80 ms after final | Or instant on early-exit at 0.85 |
| Document upload → indexed | ~3–10 s for a 20-slide deck | Dominated by Jina batch embedding |

The user-perceived latency budget is **transcription**, not enrichment. Enrichment is allowed to take its time as long as it never blocks transcription.

---

## 9. What is *not* in the system (deliberate omissions)

- **No model fine-tuning.** Vocabulary correction is an integration problem, not a training problem.
- **No persistent transcript storage.** Sessions are ephemeral; only billing-relevant metadata (`Session`, `UsageRecord`) is persisted in Postgres.
- **No queue infrastructure.** All async work is in-process. A real production deployment would put RAG correction behind a queue with retries, but for a single-instance app the in-process queue is sufficient and simpler.
- **No custom ASR.** Deepgram is treated as a black box; the system fixes its mistakes at the boundary instead of trying to replace it.
- **No semantic chunking on document upload.** Term-level extraction is sufficient because the retrieval target is *vocabulary*, not passages.

---

## 10. File map (where to look)

```
app/
├── components/
│   ├── App.tsx                          ← orchestrator, TranscriptBlock state, all enrichment dispatch
│   ├── RAGUpload.tsx                    ← drag-and-drop with SSE progress
│   ├── MultiLanguageSelector.tsx        ← spoken/display language picker
│   └── Visualizer.tsx                   ← Web Audio level meter
├── context/
│   ├── DeepgramContextProvider.tsx      ← single WebSocket
│   ├── MultiDeepgramContextProvider.tsx ← N parallel WebSockets + winner selection
│   └── MicrophoneContextProvider.tsx    ← MediaRecorder lifecycle
├── hooks/
│   └── useRAG.ts                        ← session state, upload/correct/clear
├── services/
│   ├── ragService.ts                    ← client wrapper for /api/rag/*
│   └── translationService.ts            ← client wrapper for /api/translate
├── api/
│   ├── authenticate/route.ts            ← short-lived Deepgram key
│   ├── translate/route.ts               ← DeepL → Google fallback + cache
│   └── rag/
│       ├── upload-stream/route.ts       ← multipart + SSE progress
│       ├── correct/route.ts             ← synchronous correction
│       └── session/route.ts             ← session info / cleanup
├── lib/
│   ├── corrector.ts                     ← pipeline orchestrator
│   ├── llmCorrection.ts                 ← Groq + rule-based fallback
│   ├── vectorStore.ts                   ← Upstash Vector + hybridSearch
│   ├── embeddingsService.ts             ← Jina + LRU + hash fallback
│   ├── phoneticMatcher.ts               ← Soundex + custom Metaphone
│   ├── termExtractor.ts                 ← lightweight NER + categorization
│   ├── documentParser.ts                ← PDF / DOCX / PPTX / TXT / MD
│   └── translationCache.ts              ← singleton in-memory cache
├── types/
│   ├── rag.ts                           ← RAG type definitions, DEFAULT_RAG_CONFIG
│   └── multiDeepgram.ts                 ← multi-connection types
└── utils/
    ├── confidenceComparison.ts          ← winner selection algorithm
    └── audioDuplication.ts              ← shared audio blob fan-out

middleware.ts                            ← JWT route guard
prisma/schema.prisma                     ← User, Session, UsageRecord
```
