# LiveCaps: Real-Time Speech Transcription and Translation

LiveCaps is a real-time speech transcription and translation system built on top of Deepgram’s Nova-3 streaming API and a multi-provider translation backend. It is designed for low-latency captioning in live environments such as talks, meetups, and hybrid events.

The application runs entirely in the browser on top of Next.js, with a thin set of API routes for authentication, translation, and caching. Audio is streamed in small chunks to Deepgram, converted into text, grouped into sentences, and then translated asynchronously into one or more target languages.

---

## Highlights and Techniques

- **Streaming audio capture in the browser**  
   Audio is captured via the MediaRecorder API ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)) in 100 ms chunks and streamed to Deepgram over a persistent WebSocket connection ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)). This keeps end‑to‑end latency low while avoiding excessive request overhead.

- **Web Audio–based visualization**  
   The audio visualizer is built on top of the Web Audio API ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)), giving users immediate feedback on input levels and signal presence.

- **Asynchronous translation queue on the client**  
   The main orchestrator in [app/components/App.tsx](app/components/App.tsx) maintains a queue of completed sentences and processes them asynchronously, so translation calls never block ongoing transcription. This decouples the “speech → text” loop from the “text → translation” loop.

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
│   ├── app/
│   ├── components/
│   ├── context/
│   ├── fonts/
│   ├── lib/
│   ├── services/
│   ├── types/
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
   Backend route handlers for authentication ([app/api/authenticate/route.ts](app/api/authenticate/route.ts)), translation ([app/api/translate/route.ts](app/api/translate/route.ts)), cache management ([app/api/cache/route.ts](app/api/cache/route.ts)), and test utilities.

- [app/lib](app/lib)  
   Server-side utilities, including the in-memory translation cache in [app/lib/translationCache.ts](app/lib/translationCache.ts).

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

- [ARCHITECTURE_AND_WALKTHROUGH.md](ARCHITECTURE_AND_WALKTHROUGH.md) – consolidated system overview, architecture, multi-language design, and runtime walkthrough.  
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) – current status of larger features and planned work.  
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
4. Start speaking. You will see:
    - Interim text for the current utterance.
    - Stable transcript blocks where each block contains the original sentence and all translations.
5. Use the fullscreen mode and dark mode when projecting to an audience.

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

Environment variables are documented in `sample.env.local` and in [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md).

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

Actual performance depends on network conditions and external provider behavior; see [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) for more detail.

---

## Development

- The app uses the Next.js App Router (directory `app/`).
- All real-time behavior is implemented in client components and React contexts.
- TypeScript is used throughout the codebase.
- Tailwind CSS is used for styling.

Codebase-level documentation:

- [CODEBASE_WALKTHROUGH.md](CODEBASE_WALKTHROUGH.md) – end-to-end narrative of the runtime.
- [MULTI_LANGUAGE_ARCHITECTURE.md](MULTI_LANGUAGE_ARCHITECTURE.md) – in-depth description of multi-language detection.
- [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) – system diagrams, caching, and deployment notes.

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
- [Next.js](https://nextjs.org) and the React ecosystem.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a history of notable changes.

