import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, createToken, setAuthCookie } from "@/app/lib/auth";

// POST /api/auth/upgrade — upgrade user tier
export async function POST(req: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { tier } = await req.json();

    if (!["PAID", "PRO"].includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be PAID or PRO" },
        { status: 400 }
      );
    }

    // In production, you'd verify payment here (Stripe, etc.)
    // For now, we just upgrade directly

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: { tier },
      select: { id: true, email: true, name: true, tier: true },
    });

    // Refresh JWT with new tier
    const token = await createToken({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      tier: updated.tier,
    });
    setAuthCookie(token);

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Upgrade error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
