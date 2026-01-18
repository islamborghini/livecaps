/**
 * Test script for Main Corrector Module
 * Run with: npx tsx app/lib/testCorrector.ts
 */

import {
  correctTranscript,
  correctSimpleTranscript,
  identifyLowConfidenceWords,
  buildSearchQueries,
  getCorrectionStats,
  resetCorrectionStats,
  isRAGEnabled,
  getRAGConfig,
} from "./corrector";
import { CorrectionRequest, WordConfidence, ExtractedTerm } from "../types/rag";

// Create test terms (simulating indexed user content)
const testTerms: ExtractedTerm[] = [
  {
    term: "Kubernetes",
    normalizedTerm: "kubernetes",
    context: "Kubernetes is an open-source container orchestration platform.",
    sourceFile: "presentation.md",
    phoneticCode: "K165",
    frequency: 5,
    isProperNoun: true,
    category: "technical",
  },
  {
    term: "PostgreSQL",
    normalizedTerm: "postgresql",
    context: "PostgreSQL is a powerful database system.",
    sourceFile: "presentation.md",
    phoneticCode: "P236",
    frequency: 4,
    isProperNoun: true,
    category: "technical",
  },
  {
    term: "OAuth",
    normalizedTerm: "oauth",
    context: "OAuth 2.0 is the standard for authorization.",
    sourceFile: "presentation.md",
    phoneticCode: "O30",
    frequency: 3,
    isProperNoun: false,
    category: "technical",
  },
  {
    term: "TensorFlow",
    normalizedTerm: "tensorflow",
    context: "TensorFlow is a machine learning platform.",
    sourceFile: "presentation.md",
    phoneticCode: "T526",
    frequency: 3,
    isProperNoun: true,
    category: "technical",
  },
];

async function testIdentifyLowConfidenceWords() {
  console.log("\n=== Test 1: Identify Low-Confidence Words ===\n");

  const wordConfidences: WordConfidence[] = [
    { word: "We", confidence: 0.95, start: 0, end: 0.2 },
    { word: "use", confidence: 0.92, start: 0.2, end: 0.4 },
    { word: "cooper", confidence: 0.35, start: 0.4, end: 0.6 },
    { word: "netties", confidence: 0.28, start: 0.6, end: 0.8 },
    { word: "for", confidence: 0.95, start: 0.8, end: 1.0 },
    { word: "containers", confidence: 0.88, start: 1.0, end: 1.3 },
  ];

  const lowConf = identifyLowConfidenceWords(wordConfidences, 0.7);

  console.log("Word confidences:");
  for (const wc of wordConfidences) {
    const isLow = wc.confidence < 0.7;
    console.log(`  "${wc.word}": ${(wc.confidence * 100).toFixed(0)}% ${isLow ? "← LOW" : ""}`);
  }

  console.log(`\nIdentified ${lowConf.length} low-confidence words:`);
  for (const lc of lowConf) {
    console.log(`  "${lc.word}" at position ${lc.position}`);
  }

  return lowConf.length === 2 && lowConf[0].word === "cooper" && lowConf[1].word === "netties";
}

async function testBuildSearchQueries() {
  console.log("\n=== Test 2: Build Search Queries ===\n");

  const allWords = ["We", "use", "cooper", "netties", "for", "containers"];
  const lowConfidenceWords = [
    { word: "cooper", position: 2 },
    { word: "netties", position: 3 },
  ];

  const queries = buildSearchQueries(lowConfidenceWords, allWords);

  console.log("All words:", allWords.join(" "));
  console.log("Low-confidence:", lowConfidenceWords.map(w => w.word).join(", "));
  console.log("\nGenerated queries:");
  for (const q of queries) {
    console.log(`  - "${q}"`);
  }

  // Should include "cooper netties" as a phrase
  const hasPhrase = queries.some(q => q.includes("cooper") && q.includes("netties"));
  console.log(`\n${hasPhrase ? "✅" : "❌"} Contains phrase query`);

  return hasPhrase;
}

async function testSimpleCorrection() {
  console.log("\n=== Test 3: Simple Transcript Correction ===\n");

  const transcript = "My presentation covers cooper netties";

  console.log(`Original: "${transcript}"`);
  console.log("Cached terms:", testTerms.map(t => t.term).join(", "));

  const corrected = await correctSimpleTranscript(
    transcript,
    "test-session-corrector",
    testTerms,
    {
      useLLMCorrection: !!process.env.GROQ_API_KEY,
      useHybridSearch: true,
      skipVectorSearch: true, // Use phonetic-only for testing
    }
  );

  console.log(`\nCorrected: "${corrected}"`);

  const hasKubernetes = corrected.toLowerCase().includes("kubernetes");
  console.log(`\n${hasKubernetes ? "✅ PASSED" : "❌ FAILED"}: Contains "Kubernetes"`);

  return hasKubernetes;
}

async function testFullCorrectionRequest() {
  console.log("\n=== Test 4: Full Correction Request ===\n");

  const transcript = "We're using post gres for data and oh auth for security";

  const words = transcript.split(/\s+/);
  const wordConfidences: WordConfidence[] = words.map((word, i) => {
    // Make specific words low confidence
    const lowConfWords = ["post", "gres", "oh", "auth"];
    const confidence = lowConfWords.includes(word.toLowerCase()) ? 0.4 : 0.95;
    return {
      word,
      confidence,
      start: i * 0.5,
      end: (i + 1) * 0.5,
    };
  });

  const request: CorrectionRequest = {
    transcript,
    wordConfidences,
    sessionId: "test-session-full",
    language: "en",
    isFinal: true,
    confidenceThreshold: 0.7,
  };

  console.log(`Original: "${transcript}"`);
  console.log("Low-confidence words: post, gres, oh, auth");

  const response = await correctTranscript(request, {
    cachedTerms: testTerms,
    useLLMCorrection: !!process.env.GROQ_API_KEY,
    skipVectorSearch: true, // Use phonetic-only for testing
  });

  console.log(`\nCorrected: "${response.correctedTranscript}"`);
  console.log(`Was Modified: ${response.wasModified}`);
  console.log(`Processing Time: ${response.processingTimeMs}ms`);
  console.log(`Terms Retrieved: ${response.termsRetrieved}`);

  if (response.corrections.length > 0) {
    console.log("\nCorrections:");
    for (const c of response.corrections) {
      console.log(`  - "${c.original}" → "${c.corrected}" (${c.matchType})`);
    }
  }

  const hasPostgres = response.correctedTranscript.toLowerCase().includes("postgresql");
  const hasOAuth = response.correctedTranscript.toLowerCase().includes("oauth");

  console.log(`\n${hasPostgres ? "✅" : "❌"} Contains "PostgreSQL"`);
  console.log(`${hasOAuth ? "✅" : "❌"} Contains "OAuth"`);

  return hasPostgres || hasOAuth;
}

async function testNoLowConfidenceWords() {
  console.log("\n=== Test 5: No Low-Confidence Words (Early Exit) ===\n");

  const transcript = "TensorFlow is great for machine learning";

  const words = transcript.split(/\s+/);
  const wordConfidences: WordConfidence[] = words.map((word, i) => ({
    word,
    confidence: 0.95, // All high confidence
    start: i * 0.5,
    end: (i + 1) * 0.5,
  }));

  const request: CorrectionRequest = {
    transcript,
    wordConfidences,
    sessionId: "test-session-high-conf",
    language: "en",
    isFinal: true,
    confidenceThreshold: 0.7,
  };

  console.log(`Original: "${transcript}"`);
  console.log("All words have high confidence (0.95)");

  const response = await correctTranscript(request, {
    cachedTerms: testTerms,
  });

  console.log(`\nCorrected: "${response.correctedTranscript}"`);
  console.log(`Was Modified: ${response.wasModified}`);
  console.log(`Processing Time: ${response.processingTimeMs}ms`);

  const unchanged = !response.wasModified && response.correctedTranscript === transcript;
  console.log(`\n${unchanged ? "✅ PASSED" : "❌ FAILED"}: Transcript unchanged (early exit)`);

  return unchanged;
}

async function testStats() {
  console.log("\n=== Test 6: Correction Statistics ===\n");

  const stats = getCorrectionStats();

  console.log("Current stats:");
  console.log(`  Total requests: ${stats.totalRequests}`);
  console.log(`  Total corrections: ${stats.totalCorrections}`);
  console.log(`  Avg processing time: ${stats.avgProcessingTimeMs.toFixed(2)}ms`);
  console.log(`  Avg terms retrieved: ${stats.avgTermsRetrieved.toFixed(2)}`);
  console.log(`  Error count: ${stats.errorCount}`);
  console.log(`  Last correction: ${stats.lastCorrectionAt}`);

  return stats.totalRequests > 0;
}

async function testRAGConfig() {
  console.log("\n=== Test 7: RAG Configuration ===\n");

  const enabled = isRAGEnabled();
  const config = getRAGConfig();

  console.log(`RAG Enabled: ${enabled}`);
  console.log("RAG Config:", JSON.stringify(config, null, 2));

  return true;
}

async function main() {
  console.log("🔧 Testing Main Corrector Module\n");
  console.log("=".repeat(60));
  console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log(`RAG_ENABLED: ${process.env.RAG_ENABLED || "not set"}`);

  resetCorrectionStats();

  const results = {
    identifyLowConf: await testIdentifyLowConfidenceWords(),
    buildQueries: await testBuildSearchQueries(),
    simpleCorrection: await testSimpleCorrection(),
    fullRequest: await testFullCorrectionRequest(),
    earlyExit: await testNoLowConfidenceWords(),
    stats: await testStats(),
    config: await testRAGConfig(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Test Results:\n");

  let passed = 0;
  for (const [name, success] of Object.entries(results)) {
    console.log(`  ${success ? "✅" : "❌"} ${name}`);
    if (success) passed++;
  }

  console.log(`\n${passed}/${Object.keys(results).length} tests passed`);
  console.log(`${passed === Object.keys(results).length ? "✅ All tests passed!" : "❌ Some tests failed"}\n`);
}

main().catch(console.error);
