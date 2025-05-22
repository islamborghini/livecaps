# LiveCaps - Real-Time Speech Transcription and Translation


LiveCaps is a browser-based application that provides real-time speech transcription and translation, powered by [Deepgram](https://deepgram.com) for speech recognition and multiple translation services.

![LiveCaps Screenshot](/public/screenshot.png)
## Features

- **Real-time transcription** using Deepgram's Nova-3 model
- **Live translation** into multiple languages using DeepL (with Google Translate fallback)
- **Voice visualization** for audio input
- **Smart formatting** with sentence detection and proper paragraph structuring
- **Responsive design** that works on desktop and mobile devices
- **No server required** - operates entirely in the browser


## Demo

Visit [LiveCaps](https://livecaps.vercel.app/) to try the application without installation.

## Technology Stack

- **Next.js** - React framework for the frontend
- **Deepgram API** - For speech recognition
- **DeepL and Google Translate** - For translation services
- **TypeScript** - For type-safe code
- **Tailwind CSS** - For styling

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Deepgram API Key ([Get one here](https://console.deepgram.com/signup))
- DeepL API Key (optional, for better translation quality)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/livecaps.git
   cd livecaps
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env.local` file in the root directory with your API keys:
   ```
   DEEPGRAM_API_KEY=your_deepgram_api_key
   DEEPL_API_KEY=your_deepl_api_key
   ```

4. Start the development server
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser

## Usage

1. Allow microphone access when prompted
2. Start speaking to see real-time transcription in the "Original" panel
3. Select a target language from the dropdown menu to see translations in the right panel
4. The audio visualization at the bottom provides feedback on your audio input

## Configuration

You can configure the transcription behavior in the `app/context/DeepgramContextProvider.tsx` file:

- `model`: Change the Deepgram model (default: "nova-3")
- `smart_format`: Enable/disable smart formatting (default: true)
- `interim_results`: Enable/disable interim results (default: true)
- `utterance_end_ms`: Adjust the pause detection duration (default: 2000ms)

## Known Issues

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for a list of known issues.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Deepgram](https://deepgram.com) for their speech recognition API
- [DeepL](https://deepl.com) for their translation API
- [Next.js](https://nextjs.org) for the React framework

## Updates and Changelog

See [CHANGELOG.md](CHANGELOG.md) for details about changes and version updates.
