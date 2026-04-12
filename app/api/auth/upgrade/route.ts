/**
 * POST /api/auth/upgrade
 *
 * Legacy endpoint kept for backward compatibility. Direct tier upgrades are no
 * longer handled here — all billing goes through Stripe. Returns a 302-like
 * JSON response directing callers to /api/stripe/checkout.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

// POST /api/auth/upgrade — redirect to Stripe checkout for upgrade
// This route is kept for backward compatibility but now redirects to Stripe
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

    // Redirect to Stripe checkout instead of direct upgrade
    return NextResponse.json(
      { error: "Please use /api/stripe/checkout for upgrades", redirect: "/api/stripe/checkout" },
      { status: 302 }
    );
  } catch (error) {
    console.error("Upgrade error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
