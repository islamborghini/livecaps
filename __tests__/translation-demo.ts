/**
 * Translation Testing Demo
 * 
 * This file demonstrates the translation testing capabilities
 * Even if Jest configuration needs fixing, this shows the testing logic
 */

// Import the actual translation functions
import { detectSentences, processSentencesForTranslation } from '../app/services/translationService';

// Test data
const testCases = {
  simple: 'Hello, how are you?',
  multiSentence: 'Hello. How are you? I hope you are well.',
  withAbbreviations: 'Dr. Smith works at Inc. Corp. on Main St.',
  withEmojis: 'Hello! 😊 How are you? I hope you have a great day! 🌟',
  complex: 'Mr. John Smith Jr. said: "Hello there!" at 2:30 p.m.'
};

// Test functions
function testSentenceDetection() {
  console.log('🧪 Testing Sentence Detection...\n');
  
  Object.entries(testCases).forEach(([name, text]) => {
    try {
      const sentences = detectSentences(text);
      console.log(`✅ ${name}:`);
      console.log(`   Input: "${text}"`);
      console.log(`   Detected ${sentences.length} sentences:`);
      sentences.forEach((sentence, i) => {
        console.log(`   ${i + 1}. "${sentence}"`);
      });
      console.log('');
    } catch (error) {
      console.log(`❌ ${name}: Error - ${error.message}\n`);
    }
  });
}

function testTextProcessing() {
  console.log('🔄 Testing Text Processing...\n');
  
  Object.entries(testCases).forEach(([name, text]) => {
    try {
      const processed = processSentencesForTranslation(text);
      console.log(`✅ ${name}:`);
      console.log(`   Original: "${text}"`);
      console.log(`   Processed: "${processed}"`);
      console.log(`   Lines: ${processed.split('\n').filter(l => l.trim()).length}`);
      console.log('');
    } catch (error) {
      console.log(`❌ ${name}: Error - ${error.message}\n`);
    }
  });
}

async function testTranslationAPI() {
  console.log('🌐 Testing Translation API...\n');
  
  const testRequest = {
    text: 'Hello, how are you today?',
    targetLanguage: 'es'
  };
  
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRequest)
    });
    
    const data = await response.json();
    
    console.log('✅ Translation API Test:');
    console.log(`   Input: "${testRequest.text}"`);
    console.log(`   Target Language: ${testRequest.targetLanguage}`);
    console.log(`   Translated: "${data.translatedText}"`);
    console.log(`   Provider: ${data.provider}`);
    console.log(`   Status: ${response.status}`);
  } catch (error) {
    console.log(`❌ Translation API Error: ${error.message}`);
  }
}

// Validation functions
function validateTranslationQuality(original, translated, targetLanguage) {
  const validations = {
    notEmpty: translated && translated.trim().length > 0,
    differentFromOriginal: translated !== original,
    preservesPunctuation: /[.!?]$/.test(translated) === /[.!?]$/.test(original),
    preservesLength: Math.abs(translated.length - original.length) < original.length * 2,
  };
  
  return validations;
}

function runPerformanceTest() {
  console.log('⚡ Performance Testing...\n');
  
  const iterations = 100;
  const testText = 'This is a performance test sentence.';
  
  console.time('Sentence Detection Performance');
  for (let i = 0; i < iterations; i++) {
    detectSentences(testText);
  }
  console.timeEnd('Sentence Detection Performance');
  
  console.time('Text Processing Performance');
  for (let i = 0; i < iterations; i++) {
    processSentencesForTranslation(testText);
  }
  console.timeEnd('Text Processing Performance');
  
  console.log('');
}

// Export for potential use in actual tests
export {
  testSentenceDetection,
  testTextProcessing,
  testTranslationAPI,
  validateTranslationQuality,
  runPerformanceTest,
  testCases
};

// If running directly in Node.js
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  console.log('🚀 LiveCaps Translation Testing Suite\n');
  console.log('=====================================\n');
  
  testSentenceDetection();
  testTextProcessing();
  runPerformanceTest();
  
  console.log('✅ All tests completed!');
  console.log('\nNote: API tests require the server to be running.');
  console.log('Run: npm run dev and then test the API endpoints.\n');
}
