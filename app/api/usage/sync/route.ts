import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";
import { TIER_LIMITS, getTodayUTC } from "@/app/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { secondsUsed } = await req.json();

    // Validate: accept 0-120 seconds per sync
    if (typeof secondsUsed !== "number" || secondsUsed < 0 || secondsUsed > 120) {
      return NextResponse.json(
        { error: "secondsUsed must be between 0 and 120" },
        { status: 400 }
      );
    }

    const today = getTodayUTC();

    // Upsert: create or increment usage record for today
    const record = await prisma.usageRecord.upsert({
      where: { userId_date: { userId: payload.userId, date: today } },
      create: {
        userId: payload.userId,
        date: today,
        secondsUsed: Math.round(secondsUsed),
      },
      update: {
        secondsUsed: { increment: Math.round(secondsUsed) },
        lastSyncedAt: new Date(),
      },
    });

    // Fetch fresh tier from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tier: true },
    });

    const tier = user?.tier || payload.tier;
    const dailyLimit = TIER_LIMITS[tier];
    const remaining = Math.max(0, dailyLimit - record.secondsUsed);

    return NextResponse.json({
      secondsUsed: record.secondsUsed,
      secondsRemaining: isFinite(remaining) ? remaining : null,
      dailyLimit: isFinite(dailyLimit) ? dailyLimit : null,
      tier,
    });
  } catch (error) {
    console.error("Usage sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
