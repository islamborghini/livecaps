import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { hashPassword, createToken, setAuthCookie } from "@/app/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, inviteCode } = await req.json();

    if (!email || !password || !name || !inviteCode) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    if (inviteCode !== process.env.INVITE_CODE) {
      return NextResponse.json(
        { error: "Invalid invite code" },
        { status: 403 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
    });

    setAuthCookie(token);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
