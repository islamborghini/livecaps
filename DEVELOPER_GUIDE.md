# LiveCaps Developer Guide

A book-style walkthrough of how LiveCaps works, from the core ideas to the actual files in the repository.

This guide is written for someone who is comfortable with basic web development but may not know the specific technologies used here (like Next.js, React context, or WebSockets), and may not know this codebase at all.

---

## 1. What LiveCaps Is (In Plain Language)

LiveCaps is a web application that:

- Listens to your microphone.
- Streams your voice to an external speech recognition service (Deepgram).
- Receives text transcripts back in real time.
- Groups those transcripts into proper sentences.
- Sends sentences to translation services (DeepL and Google Translate).
- Shows one unified transcript where each sentence appears once, together with translations into one or more target languages.

You open a web page (`/app`), allow microphone access, and start talking. The app does the rest.

From a technical point of view, LiveCaps is:

- A **Next.js 14** application using the **App Router** (`app/` directory).
- Written in **TypeScript** and **React 18**.
- Styled with **Tailwind CSS**.
- Using **Deepgram** for streaming speech-to-text.
- Using **DeepL** + **Google Translate** for translations.

---

## 2. Core Technologies (with Definitions)

Before diving into the code, here are the main technologies used in this project, with short explanations.

### 2.1 Next.js

**Next.js** is a React framework for building web applications. It provides:

- File-based routing: files under `app/` define URLs.
- Server-side rendering and static generation (not the focus here, but available).
- Built-in support for API routes (server functions that run on requests).

In this project:

- The main pages live under `app/`.
- API endpoints live under `app/api/.../route.ts`.

### 2.2 React and Components

**React** is a JavaScript library for building UIs. You write **components** that describe what should appear on the screen, based on some **state**.

In this project, most components are **function components** that use **hooks**, like `useState` (for state) and `useEffect` (for side effects).

The main orchestrator component is:

- [app/components/App.tsx](app/components/App.tsx)

It glues together microphone access, Deepgram connections, translation calls, and the UI.

### 2.3 React Context

**React Context** is a way to share values (like current user, theme, or in our case, microphone and Deepgram connections) between many components without passing props manually at every level.

We have several context providers under [app/context](app/context):

- MicrophoneContextProvider: microphone and audio chunks.
- DeepgramContextProvider: single-language Deepgram connection.
- MultiDeepgramContextProvider: multiple Deepgram connections (multi-language mode).
- DarkModeContextProvider: theme state.

You wrap parts of the app in these providers so that any child component can call a hook like `useMicrophone()` or `useDeepgram()` to access shared functionality.

### 2.4 WebSocket (Important Concept)

A **WebSocket** is a persistent, two-way communication channel between a client (browser) and a server. Unlike regular HTTP requests, which are short-lived and one-directional, a WebSocket stays open and lets both sides send messages at any time.

In this app:

- The browser opens a WebSocket to Deepgram.
- The browser sends audio chunks over this WebSocket.
- Deepgram sends back transcript updates over the same WebSocket.

This is ideal for streaming use cases like speech recognition.

### 2.5 MediaDevices, getUserMedia, and MediaRecorder

To access your microphone, the browser exposes:

- `navigator.mediaDevices.getUserMedia({ audio: true })` – asks the user for permission and returns an audio stream.
- `MediaRecorder` – takes an audio stream and records it, emitting small blobs of encoded audio at intervals (e.g., every 100 ms).

In this app:

- The **MicrophoneContextProvider** calls `getUserMedia`.
- It constructs a `MediaRecorder` that emits `dataavailable` events every 100 ms.
- Each event contains a blob representing that short slice of audio.

### 2.6 HTTP API and JSON

The app also talks to our own backend routes, like `/api/translate` and `/api/authenticate`, using standard HTTP requests that send and receive **JSON**.

- `/api/authenticate` returns a short-lived Deepgram API key.
- `/api/translate` receives text and a target language, and returns a translated string.

### 2.7 Tailwind CSS

**Tailwind CSS** is a utility-first CSS framework. Instead of writing separate CSS files with class names, you compose small utility classes directly in your JSX, such as:

- `flex`, `items-center`, `justify-between`, `p-4`, etc.

This project’s styling happens mostly via Tailwind classes in JSX.

### 2.8 Deepgram, DeepL, and Google Translate

- **Deepgram**: streaming speech-to-text with models like Nova-3.
- **DeepL**: high-quality text-to-text translation service.
- **Google Translate**: used as a fallback HTTP translation service when DeepL is unavailable.

The app uses official or documented SDKs/APIs where appropriate and hides the details behind internal helpers and API routes.

---

## 3. Big Picture: How the App Runs

At runtime, LiveCaps is two loops running in parallel:

1. **Audio to Text loop**
   - Microphone → MediaRecorder → WebSocket → Deepgram → Transcript events.

2. **Text to Translation loop**
   - Transcript events → Sentence buffer → Translation queue → `/api/translate` → Translated text.

The **App component** sits in the middle:

- It subscribes to microphone and Deepgram events.
- It maintains a list of transcript blocks in React state.
- It manages a translation queue.
- It renders the UI.

Most of the work happens in response to events:

- Microphone emits an audio chunk.
- Deepgram emits a transcript update.
- The translation API responds with translated text.

Each time something happens, React state changes, and the UI re-renders accordingly.

---

## 4. Project Layout (Where Things Live)

Here is a simplified structure of the repository:

```text
.
├── ARCHITECTURE_AND_WALKTHROUGH.md
├── DEVELOPER_GUIDE.md  (this file)
├── README.md
├── app/
│   ├── api/
│   ├── app/
│   ├── components/
│   ├── context/
│   ├── fonts/
│   ├── lib/
│   ├── services/
│   ├── types/
│   └── utils/
└── public/
```

High-level meanings:

- [app](app) – main Next.js App Router directory.
- [app/app](app/app) – pages and layout for the `/app` route (the main UI).
- [app/components](app/components) – React components.
- [app/context](app/context) – context providers for microphone, Deepgram, etc.
- [app/api](app/api) – backend API routes.
- [app/lib](app/lib) – server-side utilities (e.g., translation cache).
- [app/services](app/services) – client-side services (e.g., translation helper functions).
- [public](public) – static assets (images, icons, etc.).

---

## 5. From Microphone to Text

In this section, we walk through exactly what happens from the moment you allow microphone access until you see text on the screen.

### 5.1 Microphone Context

File: [app/context/MicrophoneContextProvider.tsx](app/context/MicrophoneContextProvider.tsx)

Responsibilities:

- Request microphone permission using `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Create a `MediaRecorder` bound to the audio stream.
- Configure the recorder to emit a `dataavailable` event every 100 ms.
- Expose a React context so other components can:
  - Know if the mic is ready / recording / errored.
  - Subscribe to new audio chunks.

Why this matters:

- By centralizing microphone logic, only one piece of code deals with browser APIs and permissions.
- The rest of the app just says “startRecording” and “give me audio chunks.”

### 5.2 Connecting to Deepgram

File: [app/context/DeepgramContextProvider.tsx](app/context/DeepgramContextProvider.tsx)

Responsibilities:

1. **Get an API key**
   - Calls `/api/authenticate` (see below) to obtain a short-lived key.

2. **Create a WebSocket connection**
   - Uses the Deepgram SDK (`@deepgram/sdk`) to open a live connection to the Deepgram server.
   - Configures options such as language, model (`nova-3`), and whether to receive interim results.

3. **Listen for events**
   - **Open**: when the connection is ready.
   - **Transcription events**: when text updates arrive.
   - **Error/Close**: when something goes wrong or the connection closes.

4. **Expose a React context**
   - Other components can call `useDeepgram()` to:
     - Get the connection state (`OPEN`, `CLOSED`, etc.).
     - Send audio data (blobs) into the connection.
     - Subscribe to transcript events.

### 5.3 Streaming Audio into Deepgram

Once both the microphone and Deepgram connection are ready:

- The App component tells the microphone context to start recording.
- Every 100 ms, the microphone context emits a new audio blob.
- The App component sends that blob to the Deepgram connection over the WebSocket.

Conceptually:

- Microphone → `MediaRecorder` → audio blob → `DeepgramContext` → WebSocket → Deepgram servers.

### 5.4 Receiving Transcript Events

Deepgram streams back transcription events. These events can contain:

- **Interim results**: quickly updated, not final, may change as more audio arrives.
- **Final results**: designated as stable segments once Deepgram is confident.

The Deepgram context forwards these events up to the App component, which then:

- Updates an **interim text** field for the current line.
- Appends final text fragments to an internal **buffer** used for sentence detection.

---

## 6. From Text to Translation

Now we have text; how do we translate it?

### 6.1 Sentence Buffering

Working with raw streaming text would be messy. Instead, the App component:

- Keeps a running **sentence buffer** (a string or array of tokens).
- Each time a final transcript fragment arrives, it is appended to the buffer.
- When the buffer contains a full sentence (e.g., ends with `.`, `!`, or `?`), that sentence is extracted.

The logic that decides “this is a complete sentence” is implemented in helpers in:

- [app/services/translationService.ts](app/services/translationService.ts)

This helper also tries to avoid splitting on abbreviations (like "Dr.") or other false positives.

### 6.2 Translation Queue

We never call the translation API directly from each transcript event. Instead, the App component:

- Maintains a **queue** of sentences waiting to be translated.
- Starts a **worker loop** that:
  - Takes the next sentence from the queue.
  - Calls `/api/translate` with that sentence and the selected target language(s).
  - Updates the transcript block with the translated text.

Why a queue?

- Translation is slower than speech recognition.
- If we did everything synchronously, the UI could lag or freeze while waiting for translations.
- The queue guarantees that transcription can continue even if translation is temporarily slow.

### 6.3 Unified Transcript Blocks

Instead of maintaining separate arrays for “original text” and “translated text,” the App component uses a **unified transcript block** structure.

Each block might look conceptually like:

- `original: "Hello, everyone."`
- `translations: { fr: "Bonjour à tous.", es: "Hola a todos." }`

This is easier to render and reason about:

- Every sentence appears as a single block.
- All translations for that sentence live together.
- Adding or removing languages doesn’t break the basic structure.

---

## 7. Multi-Language Mode (Multiple Spoken Languages)

So far, we assumed the speaker uses one language. Multi-language mode handles cases where:

- The speaker might switch between languages.
- You are not sure what language will be spoken.

### 7.1 Idea

Instead of guessing the language once and hoping it is correct, we:

- Open **one Deepgram connection per candidate language** (e.g., English, Russian, Korean).
- Send the **same audio** to each connection.
- Receive transcripts and confidence scores from each.
- Pick the “winner” transcript per time window based on model confidence.
- Feed only the winning transcript into the normal sentence and translation pipeline.

### 7.2 Implementation Pieces

File: [app/context/MultiDeepgramContextProvider.tsx](app/context/MultiDeepgramContextProvider.tsx)

Responsibilities:

- Create a Deepgram live client per chosen language.
- Maintain a map from language to connection state and latest transcripts.
- Duplicate each audio blob to all active connections.
- Collect transcripts and confidences from each stream.
- Run a **winner selection** function that decides which transcript is most likely correct.
- Expose a simplified interface to the App component:
  - It just receives “winner transcripts” as if they came from a single source.

### 7.3 Audio Duplication

We cannot send the same JavaScript object to multiple WebSockets if it will be consumed or mutated. A helper in [app/utils](app/utils) duplicates the audio blob safely so each Deepgram connection receives a valid copy.

This is important because the browser and underlying APIs may treat blobs as streams that can be consumed only once.

### 7.4 Winner Selection (Conceptually)

For each time window (for example, a few hundred milliseconds), the MultiDeepgram context might:

- Look at all transcripts produced by each language connection.
- Consider their confidence scores.
- Pick the one with the highest confidence (above some threshold).
- Emit that as the “winner transcript” to the App component.

From the App’s perspective, it does not need to know how many languages are involved. It just receives a single stream of winner transcripts and continues sentence detection and translation as usual.

---

## 8. Backend API Routes

All server-side logic lives under [app/api](app/api). These are not separate servers; they are functions deployed as serverless handlers or Node handlers by Next.js.

### 8.1 /api/authenticate

File: [app/api/authenticate/route.ts](app/api/authenticate/route.ts)

Purpose:

- Return a short-lived Deepgram API key to the browser.

Why not send the API key directly to the client via environment variables?

- Because environment variables are secret.
- API keys should never be exposed to client bundles or source code.
- This route can implement additional checks, rate limiting, or other logic if needed.

### 8.2 /api/translate

File: [app/api/translate/route.ts](app/api/translate/route.ts)

Purpose:

- Accept JSON input with:
  - `text`: the sentence to translate.
  - `targetLanguage`: the language code (e.g., `fr`, `es`).
- Try to translate with DeepL (if configured), otherwise fall back to Google Translate.
- Return JSON with:
  - `translatedText`.
  - Metadata about which provider was used.

This code also handles error cases gracefully and ensures that even partial failures do not crash the client.

### 8.3 /api/cache

File: [app/api/cache/route.ts](app/api/cache/route.ts)

Purpose:

- Provide visibility into the **server-side translation cache**.
- Expose endpoints to:
  - Get cache statistics.
  - Clear the cache.
  - Preload common phrases for a specific language.

This is mainly used for performance tuning and diagnostics, not by end-users.

---

## 9. Server-Side Translation Cache

File: [app/lib/translationCache.ts](app/lib/translationCache.ts)

This file defines a singleton cache object that lives on the server side.

### 9.1 What It Stores

- Key: combination of `originalText` + `targetLanguage`.
- Value: translated text and metadata.

### 9.2 Why Cache?

- Many events and talks use repeated phrases ("Welcome", "Thank you", etc.).
- Translation providers cost money and add latency.
- If we have translated the same phrase before, we can serve it from memory almost instantly.

### 9.3 Characteristics

- Bounded size (e.g., up to N entries).
- Entries expire after a certain **time-to-live (TTL)**.
- Periodic cleanup to remove old or unused entries.
- Statistics such as hit rate, number of entries, etc.

---

## 10. Configuration, Environment, and Local Setup

Configuration is mostly done through environment variables and a few config files.

### 10.1 Environment Variables

File: [sample.env.local](sample.env.local)

This file lists the variables you should define in `.env.local` for local development, such as:

- `DEEPGRAM_API_KEY` – your Deepgram key.
- `DEEPGRAM_ENV` – environment label (e.g., `development`).
- `DEEPL_API_KEY` – optional; enables DeepL translations.

### 10.2 Local Development Loop

Typical steps to run locally:

1. Copy `sample.env.local` to `.env.local` and fill in the keys.
2. Install dependencies: `npm install`.
3. Start dev server: `npm run dev`.
4. Open `http://localhost:3000/app` in your browser.

From there, you can:

- Try speaking and watch the transcript.
- Toggle languages.
- Switch between single and multi-language modes.

---

## 11. Reading and Modifying the Code

If you want to extend or modify LiveCaps, it helps to know where to start.

### 11.1 I want to change the UI layout

Look in:

- [app/app/page.tsx](app/app/page.tsx) – the page shell for `/app`.
- [app/components/App.tsx](app/components/App.tsx) – the main runtime component.
- [app/components](app/components) – specific UI pieces (selectors, toggles, footers, etc.).

### 11.2 I want to change how Deepgram is used

Look in:

- [app/context/DeepgramContextProvider.tsx](app/context/DeepgramContextProvider.tsx)
- [app/context/MultiDeepgramContextProvider.tsx](app/context/MultiDeepgramContextProvider.tsx)

You can change:

- Model (`nova-3` vs other models Deepgram provides).
- Whether you use interim results.
- Endpointing / utterance settings.

### 11.3 I want to change translation behavior

Look in:

- [app/api/translate/route.ts](app/api/translate/route.ts) – to adjust providers or add new ones.
- [app/services/translationService.ts](app/services/translationService.ts) – to change sentence splitting, batching, or error handling.
- [app/lib/translationCache.ts](app/lib/translationCache.ts) – to change cache size or TTL.

### 11.4 I want to add a new context or shared service

You can follow existing patterns in [app/context](app/context) and [app/services](app/services):

- Create a new context provider that holds your shared state.
- Wrap your pages/components with this provider.
- Expose a custom hook (e.g., `useMyFeature()`) for components to access it.

---

## 12. Glossary of Key Terms

A small glossary for quick reference:

- **WebSocket** – A persistent, two-way connection between browser and server that allows sending messages at any time in both directions. Used here to stream audio to Deepgram and receive transcripts.

- **MediaRecorder** – A browser API that records audio or video from a media stream and outputs chunks (blobs) at defined intervals.

- **Blob** – A binary large object representing raw data (e.g., encoded audio for 100 ms).

- **API Route (Next.js)** – A server function defined under `app/api/.../route.ts` that handles HTTP requests and returns responses, similar to a small backend endpoint.

- **Context (React)** – A mechanism for passing data through the component tree without manually passing props at every level.

- **Hook (React)** – A special function like `useState` or `useEffect` that lets you use React features in function components.

- **TTL (Time-To-Live)** – The amount of time a cache entry remains valid before expiring.

- **Singleton** – A module or object that is instantiated once and reused everywhere, such as the translation cache.

- **Client vs Server** – Client code runs in the browser; server code runs in the Node.js / serverless environment. In this project, context providers and components run on the client; API routes and `lib` helpers run on the server.

---

## 13. Final Notes

This guide is meant to be a narrative companion to the more compact technical reference in:

- [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md)

Use this file when you want to understand “why” and “how” at a slower pace. Use the architecture file when you want a quick reminder of where things are and how they connect.
