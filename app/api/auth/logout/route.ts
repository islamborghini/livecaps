/**
 * POST /api/auth/logout
 *
 * Clears the auth cookie by overwriting it with an empty, zero-maxAge value.
 * Always succeeds — no auth check needed.
 */
import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/app/lib/auth";

export async function POST() {
  clearAuthCookie();
  return NextResponse.json({ success: true });
}
