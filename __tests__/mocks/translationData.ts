// Mock data for translation tests
export const mockTranslationResponses = {
  deepl: {
    success: {
      translations: [{
        text: 'Hola, ¿cómo estás?',
        detected_source_language: 'EN'
      }]
    },
    multiSentence: {
      translations: [
        { text: 'Hola.' },
        { text: '¿Cómo estás?' },
        { text: 'Espero que estés bien.' }
      ]
    },
    withEmojis: {
      translations: [{
        text: '¡Hola! 😊 ¿Cómo estás? ¡Espero que tengas un buen día! 🌟'
      }]
    },
    withFormatting: {
      translations: [{
        text: 'Dr. Smith dice: "¡Hola, Sr. Johnson!" Cuesta $29,99.'
      }]
    },
    error429: {
      message: 'Too many requests',
      detail: 'Rate limit exceeded'
    }
  },
  
  google: {
    success: [
      [
        ['Hola, ¿cómo estás?', 'Hello, how are you?']
      ]
    ],
    multiSentence: [
      [
        ['Hola. ', 'Hello. '],
        ['¿Cómo estás? ', 'How are you? '],
        ['Espero que estés bien.', 'I hope you are well.']
      ]
    ],
    withEmojis: [
      [
        ['¡Hola! 😊 ¿Cómo estás? ¡Espero que tengas un buen día! 🌟', 'Hello! 😊 How are you? I hope you have a great day! 🌟']
      ]
    ],
    withFormatting: [
      [
        ['Dr. Smith dice: "¡Hola, Sr. Johnson!" Cuesta $29,99.', 'Dr. Smith says: "Hello, Mr. Johnson!" It costs $29.99.']
      ]
    ]
  }
};

export const mockLanguageCodes = {
  valid: ['es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'nl', 'pl'],
  invalid: ['invalid', 'xxx', 'unknown'],
  variations: {
    'en-US': 'EN-US',
    'en-GB': 'EN-GB', 
    'zh-CN': 'ZH',
    'pt-BR': 'PT-BR'
  }
};

export const testTexts = {
  simple: 'Hello, how are you?',
  multiSentence: 'Hello. How are you? I hope you are well.',
  withEmojis: 'Hello! 😊 How are you? I hope you have a great day! 🌟',
  withFormatting: 'Dr. Smith says: "Hello, Mr. Johnson!" It costs $29.99.',
  withAbbreviations: 'Dr. Jones works at Inc. Corp. on 5th St.',
  longText: 'This is sentence one. This is sentence two. This is sentence three.'.repeat(10),
  empty: '',
  whitespace: '   \n\t   ',
  specialChars: 'Testing: quotes "hello", apostrophes it\'s, and symbols @#$%',
  numbers: 'The price is $123.45 and the date is 01/15/2024.',
  mixed: 'Bonjour! How are you? ¿Cómo estás? 你好吗？'
};

export const mockApiErrors = {
  deepLNotConfigured: {
    message: 'DeepL API key not configured - using fallback'
  },
  deepLApiError: {
    message: 'DeepL API error: 401 - Unauthorized'
  },
  googleApiError: {
    message: 'Google Translation API error: 403'
  },
  networkError: {
    message: 'Network error'
  },
  timeout: {
    message: 'Request timeout'
  }
};
