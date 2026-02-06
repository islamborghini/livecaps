import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword, createToken, setAuthCookie } from "@/app/lib/auth";

// GET /api/auth/profile — full profile with usage stats
export async function GET() {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get total usage across all days
    const [totalUsage, sessionCount] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: { userId: payload.userId },
        _sum: { secondsUsed: true },
      }),
      prisma.session.count({
        where: { userId: payload.userId },
      }),
    ]);

    return NextResponse.json({
      user: {
        ...user,
        totalSecondsUsed: totalUsage._sum.secondsUsed || 0,
        totalSessions: sessionCount,
      },
    });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/auth/profile — update name or password
export async function PATCH(req: NextRequest) {
  try {
    const payload = await getCurrentUser();
    if (!payload) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { name, currentPassword, newPassword } = await req.json();

    const updateData: Record<string, string> = {};

    if (name && name.trim()) {
      updateData.name = name.trim();
    }

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }

      updateData.passwordHash = await hashPassword(newPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: updateData,
      select: { id: true, email: true, name: true, tier: true },
    });

    // Refresh JWT with new data
    const token = await createToken({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      tier: updated.tier,
    });
    setAuthCookie(token);

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
