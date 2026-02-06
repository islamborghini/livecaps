/**
 * RAG Session Management API Endpoint
 * 
 * Manage upload sessions for the RAG correction system:
 * - View session info and indexed content stats
 * - Clear session data when done
 * - List all active sessions (admin)
 * 
 * GET /api/rag/session?sessionId=xxx  - Get session info
 * DELETE /api/rag/session?sessionId=xxx - Clear session
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  getSessionStats, 
  hasSessionContent, 
  clearSession,
  getVectorStoreInfo,
} from "@/app/lib/vectorStore";
import { isRAGEnabled } from "@/app/lib/corrector";

/**
 * GET handler - Get session info or list sessions
 */
export async function GET(request: NextRequest) {
  // Check if RAG is enabled
  if (!isRAGEnabled()) {
    return NextResponse.json(
      { error: "RAG system is not enabled" },
      { status: 503 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const action = request.nextUrl.searchParams.get("action");

  // Get vector store info (for debugging/admin)
  if (action === "info") {
    try {
      const info = await getVectorStoreInfo();
      return NextResponse.json({
        status: "ready",
        vectorStore: info,
        ragEnabled: true,
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to get vector store info" },
        { status: 500 }
      );
    }
  }

  // Require sessionId for other operations
  if (!sessionId) {
    return NextResponse.json({
      error: "sessionId query parameter is required",
      usage: {
        getSession: "GET /api/rag/session?sessionId=xxx",
        deleteSession: "DELETE /api/rag/session?sessionId=xxx",
        vectorStoreInfo: "GET /api/rag/session?action=info",
      },
    }, { status: 400 });
  }

  try {
    // Check if session exists
    const hasContent = await hasSessionContent(sessionId);
    
    if (!hasContent) {
      return NextResponse.json({
        sessionId,
        exists: false,
        message: "Session not found or has no indexed content",
      }, { status: 404 });
    }

    // Get detailed session stats
    const stats = await getSessionStats(sessionId);

    return NextResponse.json({
      exists: true,
      ...stats,
      // Add human-readable last updated
      lastUpdatedFormatted: stats.lastUpdated 
        ? new Date(stats.lastUpdated).toISOString()
        : null,
    });

  } catch (error) {
    console.error("Session GET error:", error);
    return NextResponse.json(
      { 
        error: "Failed to get session info",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler - Clear session data
 */
export async function DELETE(request: NextRequest) {
  // Check if RAG is enabled
  if (!isRAGEnabled()) {
    return NextResponse.json(
      { error: "RAG system is not enabled" },
      { status: 503 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Check if session has content before deleting
    const hasContent = await hasSessionContent(sessionId);
    
    if (!hasContent) {
      return NextResponse.json({
        success: true,
        sessionId,
        deleted: 0,
        message: "Session was already empty or did not exist",
      });
    }

    // Get stats before deletion for reporting
    const statsBefore = await getSessionStats(sessionId);

    // Clear the session
    console.log(`🗑️ Clearing session ${sessionId}...`);
    const result = await clearSession(sessionId);

    console.log(`✅ Cleared ${result.deleted} vectors from session ${sessionId}`);

    return NextResponse.json({
      success: true,
      sessionId,
      deleted: result.deleted,
      previousStats: {
        totalTerms: statsBefore.totalTerms,
        documentCount: statsBefore.documentCount,
        categories: statsBefore.categoryBreakdown,
      },
      message: `Successfully cleared ${result.deleted} indexed terms`,
    });

  } catch (error) {
    console.error("Session DELETE error:", error);
    return NextResponse.json(
      { 
        error: "Failed to clear session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler - Could be used for session operations in the future
 * For now, just return method not allowed with helpful info
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    error: "Method not allowed",
    hint: "Use POST /api/rag/upload to upload content and create a session",
    available: {
      GET: "Get session info: GET /api/rag/session?sessionId=xxx",
      DELETE: "Clear session: DELETE /api/rag/session?sessionId=xxx",
    },
  }, { status: 405 });
}
