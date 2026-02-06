import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "livecaps_token";

// --- CORS config (preserved from original) ---
const corsOptions = {
  allowedMethods: (process.env?.ALLOWED_METHODS || "").split(","),
  allowedOrigins: (process.env?.ALLOWED_ORIGIN || "").split(","),
  allowedHeaders: (process.env?.ALLOWED_HEADERS || "").split(","),
  exposedHeaders: (process.env?.EXPOSED_HEADERS || "").split(","),
  maxAge:
    (process.env?.PREFLIGHT_MAX_AGE &&
      parseInt(process.env?.PREFLIGHT_MAX_AGE)) ||
    undefined,
  credentials: process.env?.CREDENTIALS == "true",
};

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin") ?? "";
  if (
    corsOptions.allowedOrigins.includes("*") ||
    corsOptions.allowedOrigins.includes(origin)
  ) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set(
    "Access-Control-Allow-Credentials",
    corsOptions.credentials.toString()
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    corsOptions.allowedMethods.join(",")
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    corsOptions.allowedHeaders.join(",")
  );
  response.headers.set(
    "Access-Control-Expose-Headers",
    corsOptions.exposedHeaders.join(",")
  );
  response.headers.set(
    "Access-Control-Max-Age",
    corsOptions.maxAge?.toString() ?? ""
  );
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- CORS for /api/authenticate (preserve existing behavior) ---
  if (pathname === "/api/authenticate") {
    const response = NextResponse.next();
    applyCors(request, response);
    return response;
  }

  // --- Public auth endpoints: just pass through ---
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/signup" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next();
  }

  // --- Protected API routes: 401 if not authenticated ---
  if (
    pathname === "/api/auth/me" ||
    pathname.startsWith("/api/usage/") ||
    pathname.startsWith("/api/sessions") ||
    pathname === "/api/auth/profile" ||
    pathname === "/api/auth/upgrade"
  ) {
    const authed = await isAuthenticated(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // --- /login, /signup: redirect to /app if already authenticated ---
  if (pathname === "/login" || pathname === "/signup") {
    const authed = await isAuthenticated(request);
    if (authed) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  // --- /profile, /app/*: redirect to /login if not authenticated ---
  if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
    const authed = await isAuthenticated(request);
    if (!authed) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/profile/:path*",
    "/login",
    "/signup",
    "/api/authenticate",
    "/api/auth/:path*",
    "/api/usage/:path*",
    "/api/sessions/:path*",
  ],
};
