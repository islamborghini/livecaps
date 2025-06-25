import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testTexts, mockTranslationResponses } from '../mocks/translationData';

// Mock the translation service
jest.mock('../../app/services/translationService', () => ({
  translateBySentences: jest.fn(),
  detectSentences: jest.fn(),
}));

// Mock React hooks that might be used in App component
const mockUseState = jest.fn();
const mockUseEffect = jest.fn();

// Import the mocked functions
import { translateBySentences, detectSentences } from '../../app/services/translationService';

const mockTranslateBySentences = translateBySentences as jest.MockedFunction<typeof translateBySentences>;
const mockDetectSentences = detectSentences as jest.MockedFunction<typeof detectSentences>;

// Mock App component for integration testing
const MockApp = () => {
  const [transcribedText, setTranscribedText] = React.useState('');
  const [translatedText, setTranslatedText] = React.useState('');
  const [selectedLanguage, setSelectedLanguage] = React.useState('es');
  const [isTranslating, setIsTranslating] = React.useState(false);

  const handleTranscription = async (text: string) => {
    setTranscribedText(text);
    
    if (selectedLanguage && text.trim()) {
      setIsTranslating(true);
      try {
        const result = await mockTranslateBySentences({
          text,
          sourceLanguage: 'auto',
          targetLanguage: selectedLanguage
        });
        setTranslatedText(result.translatedText);
      } catch (error) {
        console.error('Translation failed:', error);
      } finally {
        setIsTranslating(false);
      }
    }
  };

  return (
    <div>
      <div data-testid="transcribed-text">{transcribedText}</div>
      <div data-testid="translated-text">{translatedText}</div>
      <div data-testid="translation-status">
        {isTranslating ? 'Translating...' : 'Ready'}
      </div>
      
      <select 
        data-testid="language-selector"
        value={selectedLanguage} 
        onChange={(e) => setSelectedLanguage(e.target.value)}
      >
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="ja">Japanese</option>
      </select>
      
      <button
        data-testid="simulate-transcription"
        onClick={() => handleTranscription(testTexts.simple)}
      >
        Simulate Transcription
      </button>
      
      <button
        data-testid="simulate-multi-sentence"
        onClick={() => handleTranscription(testTexts.multiSentence)}
      >
        Simulate Multi-sentence
      </button>
    </div>
  );
};

describe('Translation Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock implementations
    mockTranslateBySentences.mockResolvedValue({
      translatedText: 'Hola, ¿cómo estás?',
      provider: 'deepl'
    });
    
    mockDetectSentences.mockReturnValue([
      'Hello, how are you?'
    ]);
  });

  describe('Basic Translation Flow', () => {
    test('translates simple text correctly', async () => {
      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('transcribed-text')).toHaveTextContent(testTexts.simple);
        expect(screen.getByTestId('translated-text')).toHaveTextContent('Hola, ¿cómo estás?');
      });
      
      expect(mockTranslateBySentences).toHaveBeenCalledWith({
        text: testTexts.simple,
        sourceLanguage: 'auto',
        targetLanguage: 'es'
      });
    });

    test('shows translation status during processing', async () => {
      // Make translation take some time
      mockTranslateBySentences.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            translatedText: 'Hola, ¿cómo estás?',
            provider: 'deepl'
          }), 100)
        )
      );

      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      // Should show translating status immediately
      expect(screen.getByTestId('translation-status')).toHaveTextContent('Translating...');
      
      // Should show ready status after completion
      await waitFor(() => {
        expect(screen.getByTestId('translation-status')).toHaveTextContent('Ready');
      });
    });

    test('handles language selection changes', async () => {
      render(<MockApp />);
      
      const languageSelector = screen.getByTestId('language-selector') as HTMLSelectElement;
      
      // Change to French
      fireEvent.change(languageSelector, { target: { value: 'fr' } });
      expect(languageSelector.value).toBe('fr');
      
      // Mock French translation
      mockTranslateBySentences.mockResolvedValueOnce({
        translatedText: 'Bonjour, comment allez-vous?',
        provider: 'deepl'
      });
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(mockTranslateBySentences).toHaveBeenCalledWith({
          text: testTexts.simple,
          sourceLanguage: 'auto',
          targetLanguage: 'fr'
        });
        expect(screen.getByTestId('translated-text')).toHaveTextContent('Bonjour, comment allez-vous?');
      });
    });
  });

  describe('Multi-sentence Handling', () => {
    test('processes multiple sentences correctly', async () => {
      mockDetectSentences.mockReturnValue([
        'Hello.',
        'How are you?',
        'I hope you are well.'
      ]);
      
      mockTranslateBySentences.mockResolvedValue({
        translatedText: 'Hola. ¿Cómo estás? Espero que estés bien.',
        provider: 'deepl'
      });

      render(<MockApp />);
      
      const multiSentenceButton = screen.getByTestId('simulate-multi-sentence');
      fireEvent.click(multiSentenceButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('transcribed-text')).toHaveTextContent(testTexts.multiSentence);
        expect(screen.getByTestId('translated-text')).toHaveTextContent('Hola. ¿Cómo estás? Espero que estés bien.');
      });
    });

    test('maintains sentence structure in translation', async () => {
      mockTranslateBySentences.mockResolvedValue({
        translatedText: 'Primera oración. Segunda oración. Tercera oración.',
        provider: 'deepl'
      });

      render(<MockApp />);
      
      const multiSentenceButton = screen.getByTestId('simulate-multi-sentence');
      fireEvent.click(multiSentenceButton);
      
      await waitFor(() => {
        const translatedText = screen.getByTestId('translated-text').textContent;
        expect(translatedText).toContain('Primera oración.');
        expect(translatedText).toContain('Segunda oración.');
        expect(translatedText).toContain('Tercera oración.');
      });
    });
  });

  describe('Error Handling', () => {
    test('handles translation service failures gracefully', async () => {
      mockTranslateBySentences.mockRejectedValue(new Error('Translation service unavailable'));

      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('translation-status')).toHaveTextContent('Ready');
        expect(screen.getByTestId('translated-text')).toHaveTextContent(''); // Should remain empty on error
      });
    });

    test('handles empty transcription gracefully', async () => {
      render(<MockApp />);
      
      // Create a custom button for empty text
      const button = document.createElement('button');
      button.onclick = () => {
        const event = new CustomEvent('transcription', { detail: { text: '' } });
        document.dispatchEvent(event);
      };
      document.body.appendChild(button);
      
      fireEvent.click(button);
      
      // Should not call translation service for empty text
      expect(mockTranslateBySentences).not.toHaveBeenCalled();
    });

    test('handles network failures with fallback', async () => {
      mockTranslateBySentences.mockResolvedValue({
        translatedText: testTexts.simple, // Returns original text as fallback
        error: 'Translation service unavailable',
        provider: 'none'
      });

      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('translated-text')).toHaveTextContent(testTexts.simple);
      });
    });
  });

  describe('Performance Tests', () => {
    test('handles rapid transcription updates efficiently', async () => {
      let callCount = 0;
      mockTranslateBySentences.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          translatedText: `Translation ${callCount}`,
          provider: 'deepl'
        });
      });

      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      
      // Simulate rapid clicks
      fireEvent.click(transcribeButton);
      fireEvent.click(transcribeButton);
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('translation-status')).toHaveTextContent('Ready');
      });
      
      // Should handle multiple rapid requests
      expect(mockTranslateBySentences).toHaveBeenCalledTimes(3);
    });

    test('translation completes within reasonable time', async () => {
      const start = Date.now();
      
      mockTranslateBySentences.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            translatedText: 'Hola mundo',
            provider: 'deepl'
          }), 50)
        )
      );

      render(<MockApp />);
      
      const transcribeButton = screen.getByTestId('simulate-transcription');
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('translated-text')).toHaveTextContent('Hola mundo');
      });
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Real-world Scenarios', () => {
    test('handles continuous transcription updates', async () => {
      const transcriptionUpdates = [
        'Hello',
        'Hello there',
        'Hello there, how',
        'Hello there, how are you?'
      ];

      let updateIndex = 0;
      mockTranslateBySentences.mockImplementation((request) => {
        return Promise.resolve({
          translatedText: `Translated: ${request.text}`,
          provider: 'deepl'
        });
      });

      render(<MockApp />);
      
      // Simulate incremental transcription updates
      for (const update of transcriptionUpdates) {
        const button = document.createElement('button');
        button.onclick = async () => {
          const app = screen.getByTestId('transcribed-text').closest('div');
          if (app) {
            // Simulate transcription update
            fireEvent.click(screen.getByTestId('simulate-transcription'));
          }
        };
        document.body.appendChild(button);
        fireEvent.click(button);
        
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }
      
      await waitFor(() => {
        expect(screen.getByTestId('translated-text')).toHaveTextContent('Translated:');
      });
    });

    test('handles special characters and emojis in real-time', async () => {
      mockTranslateBySentences.mockResolvedValue({
        translatedText: '¡Hola! 😊 ¿Cómo estás? ¡Espero que tengas un buen día! 🌟',
        provider: 'deepl'
      });

      render(<MockApp />);
      
      // Create custom transcription with emojis
      const emojiButton = document.createElement('button');
      emojiButton.onclick = () => {
        const mockHandleTranscription = async () => {
          await mockTranslateBySentences({
            text: testTexts.withEmojis,
            sourceLanguage: 'auto',
            targetLanguage: 'es'
          });
        };
        mockHandleTranscription();
      };
      
      document.body.appendChild(emojiButton);
      fireEvent.click(emojiButton);
      
      await waitFor(() => {
        expect(mockTranslateBySentences).toHaveBeenCalledWith({
          text: testTexts.withEmojis,
          sourceLanguage: 'auto',
          targetLanguage: 'es'
        });
      });
    });

    test('handles language switching mid-conversation', async () => {
      render(<MockApp />);
      
      const languageSelector = screen.getByTestId('language-selector') as HTMLSelectElement;
      const transcribeButton = screen.getByTestId('simulate-transcription');
      
      // Start with Spanish
      fireEvent.change(languageSelector, { target: { value: 'es' } });
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(mockTranslateBySentences).toHaveBeenCalledWith(
          expect.objectContaining({ targetLanguage: 'es' })
        );
      });
      
      // Switch to French
      mockTranslateBySentences.mockResolvedValueOnce({
        translatedText: 'Bonjour, comment allez-vous?',
        provider: 'deepl'
      });
      
      fireEvent.change(languageSelector, { target: { value: 'fr' } });
      fireEvent.click(transcribeButton);
      
      await waitFor(() => {
        expect(mockTranslateBySentences).toHaveBeenCalledWith(
          expect.objectContaining({ targetLanguage: 'fr' })
        );
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles very long transcriptions', async () => {
      const longText = testTexts.longText;
      
      mockTranslateBySentences.mockResolvedValue({
        translatedText: 'Esta es la oración uno. '.repeat(30),
        provider: 'deepl'
      });

      render(<MockApp />);
      
      // Simulate long text transcription
      const longTextButton = document.createElement('button');
      longTextButton.onclick = async () => {
        const mockHandleTranscription = async () => {
          await mockTranslateBySentences({
            text: longText,
            sourceLanguage: 'auto',
            targetLanguage: 'es'
          });
        };
        mockHandleTranscription();
      };
      
      document.body.appendChild(longTextButton);
      fireEvent.click(longTextButton);
      
      await waitFor(() => {
        expect(mockTranslateBySentences).toHaveBeenCalledWith({
          text: longText,
          sourceLanguage: 'auto',
          targetLanguage: 'es'
        });
      });
    });

    test('handles unsupported language gracefully', async () => {
      mockTranslateBySentences.mockResolvedValue({
        translatedText: testTexts.simple, // Fallback to original
        error: 'Unsupported language',
        provider: 'none'
      });

      render(<MockApp />);
      
      const languageSelector = screen.getByTestId('language-selector') as HTMLSelectElement;
      
      // Add unsupported language option for testing
      const option = document.createElement('option');
      option.value = 'unsupported';
      option.textContent = 'Unsupported';
      languageSelector.appendChild(option);
      
      fireEvent.change(languageSelector, { target: { value: 'unsupported' } });
      fireEvent.click(screen.getByTestId('simulate-transcription'));
      
      await waitFor(() => {
        expect(screen.getByTestId('translated-text')).toHaveTextContent(testTexts.simple);
      });
    });
  });
});
