#!/usr/bin/env node
/**
 * Live Translation API Test Suite
 * 
 * This script tests the actual running translation API
 * Run with: node live-api-tests.js (requires server to be running)
 */

const https = require('http');

class APITestRunner {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.passed = 0;
    this.failed = 0;
  }

  async makeRequest(endpoint, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: responseData });
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  async test(name, testFn) {
    try {
      await testFn();
      console.log(`✅ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      this.failed++;
    }
  }

  async runTests() {
    console.log('🌐 Live Translation API Tests\n');
    console.log('===============================\n');

    // Test 1: Basic English to Spanish translation
    await this.test('Basic English to Spanish translation', async () => {
      const response = await this.makeRequest('/api/translate', {
        text: 'Hello, how are you?',
        targetLanguage: 'es'
      });
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      if (!response.data.translatedText) {
        throw new Error('No translated text in response');
      }
      
      if (response.data.translatedText === 'Hello, how are you?') {
        throw new Error('Translation appears to be unchanged');
      }
      
      console.log(`   Original: "Hello, how are you?"`);
      console.log(`   Translated: "${response.data.translatedText}"`);
      console.log(`   Provider: ${response.data.provider}`);
    });

    // Test 2: Multi-sentence translation
    await this.test('Multi-sentence translation', async () => {
      const response = await this.makeRequest('/api/translate', {
        text: 'Hello. How are you? I hope you are well.',
        targetLanguage: 'fr'
      });
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      const translated = response.data.translatedText;
      const originalSentences = 3;
      const translatedSentences = (translated.match(/[.!?]/g) || []).length;
      
      if (translatedSentences < 2) {
        throw new Error(`Expected multiple sentences, got: ${translated}`);
      }
      
      console.log(`   Original sentences: ${originalSentences}`);
      console.log(`   Translated sentences: ${translatedSentences}`);
      console.log(`   Result: "${translated}"`);
    });

    // Test 3: Emoji and special character handling
    await this.test('Emoji and special character handling', async () => {
      const response = await this.makeRequest('/api/translate', {
        text: 'Hello! 😊 How are you? I hope you have a great day! 🌟',
        targetLanguage: 'ja'
      });
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      const translated = response.data.translatedText;
      
      if (!translated.includes('😊') || !translated.includes('🌟')) {
        throw new Error('Emojis not preserved in translation');
      }
      
      console.log(`   Original: "Hello! 😊 How are you? I hope you have a great day! 🌟"`);
      console.log(`   Translated: "${translated}"`);
    });

    // Test 4: Error handling - missing text
    await this.test('Error handling - missing text parameter', async () => {
      const response = await this.makeRequest('/api/translate', {
        targetLanguage: 'es'
      });
      
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
      
      if (!response.data.error) {
        throw new Error('Expected error message in response');
      }
      
      console.log(`   Error message: "${response.data.error}"`);
    });

    // Test 5: Error handling - missing target language
    await this.test('Error handling - missing target language', async () => {
      const response = await this.makeRequest('/api/translate', {
        text: 'Hello world'
      });
      
      if (response.status !== 400) {
        throw new Error(`Expected status 400, got ${response.status}`);
      }
      
      if (!response.data.error) {
        throw new Error('Expected error message in response');
      }
      
      console.log(`   Error message: "${response.data.error}"`);
    });

    // Test 6: Performance test
    await this.test('Performance - response time under 5 seconds', async () => {
      const start = Date.now();
      
      const response = await this.makeRequest('/api/translate', {
        text: 'This is a performance test to measure response time.',
        targetLanguage: 'de'
      });
      
      const duration = Date.now() - start;
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      if (duration > 5000) {
        throw new Error(`Response took ${duration}ms, expected under 5000ms`);
      }
      
      console.log(`   Response time: ${duration}ms`);
      console.log(`   Result: "${response.data.translatedText}"`);
    });

    // Test 7: Language variety test
    await this.test('Multiple language support', async () => {
      const languages = [
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' }, 
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' }
      ];
      
      const testText = 'Good morning, how can I help you today?';
      
      for (const lang of languages) {
        const response = await this.makeRequest('/api/translate', {
          text: testText,
          targetLanguage: lang.code
        });
        
        if (response.status !== 200) {
          throw new Error(`${lang.name} translation failed with status ${response.status}`);
        }
        
        console.log(`   ${lang.name} (${lang.code}): "${response.data.translatedText}"`);
      }
    });

    // Summary
    console.log('\n📊 Test Results');
    console.log('================');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.passed / (this.passed + this.failed)) * 100)}%`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All translation tests passed!');
      console.log('\nTranslation API is working correctly with:');
      console.log('• Multiple language support');
      console.log('• Multi-sentence handling');
      console.log('• Special character preservation');
      console.log('• Proper error handling');
      console.log('• Good performance');
    } else {
      console.log('\n⚠️  Some tests failed - check API configuration');
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    const runner = new APITestRunner();
    await runner.makeRequest('/api/translate', {
      text: 'test',
      targetLanguage: 'es'
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Live Translation API Tests...\n');
  
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ Server not running or not accessible');
    console.log('Please start the server with: npm run dev');
    console.log('Then run this test again.');
    process.exit(1);
  }
  
  const runner = new APITestRunner();
  await runner.runTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { APITestRunner };
