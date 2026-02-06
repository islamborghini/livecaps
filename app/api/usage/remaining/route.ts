import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth";
import { TIER_LIMITS, getTodayUTC } from "@/app/lib/usage";

export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const today = getTodayUTC();

    // Get today's usage record (may not exist yet)
    const record = await prisma.usageRecord.findUnique({
      where: { userId_date: { userId: payload.userId, date: today } },
    });

    // Fetch fresh tier from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tier: true },
    });

    const tier = user?.tier || payload.tier;
    const dailyLimit = TIER_LIMITS[tier];
    const secondsUsed = record?.secondsUsed || 0;
    const remaining = Math.max(0, dailyLimit - secondsUsed);

    return NextResponse.json({
      secondsUsed,
      secondsRemaining: isFinite(remaining) ? remaining : null,
      dailyLimit: isFinite(dailyLimit) ? dailyLimit : null,
      tier,
    });
  } catch (error) {
    console.error("Usage remaining error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
