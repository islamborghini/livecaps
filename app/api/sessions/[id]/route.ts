import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";

// PATCH /api/sessions/[id] — end a session (called when mic stops)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { durationSeconds } = await req.json();

    const session = await prisma.session.updateMany({
      where: { id: params.id, userId: payload.userId },
      data: {
        durationSeconds: Math.round(durationSeconds || 0),
        endedAt: new Date(),
      },
    });

    if (session.count === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Session update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
