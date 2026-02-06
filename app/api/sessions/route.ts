import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";

// GET /api/sessions — list user's sessions
export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Sessions list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/sessions — create a new session (called when mic starts)
export async function POST(req: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { spokenLanguages, displayLanguages } = await req.json();

    const session = await prisma.session.create({
      data: {
        userId: payload.userId,
        spokenLanguages: spokenLanguages || [],
        displayLanguages: displayLanguages || [],
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Session create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
