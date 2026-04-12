/**
 * Authentication utilities for LiveCaps.
 *
 * Handles password hashing (bcrypt), JWT creation/verification (jose, HS256,
 * 7-day expiry), and the HttpOnly cookie lifecycle. All auth state is stored
 * server-side in the cookie; the JWT payload includes userId, email, name, and
 * tier so most routes don't need an extra DB round-trip.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export type UserPayload = {
  userId: string;
  email: string;
  name: string;
  tier: "FREE" | "PAID" | "PRO";
};

const COOKIE_NAME = "livecaps_token";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/** Hashes a plaintext password using bcrypt with cost factor 12. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Returns true if the plaintext password matches the stored bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates a signed HS256 JWT containing the user payload, valid for 7 days. */
export async function createToken(payload: UserPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT and returns the decoded payload.
 * Returns null if the token is invalid or expired.
 */
export async function verifyToken(
  token: string
): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

/** Sets the HttpOnly auth cookie with a 7-day max-age. */
export function setAuthCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/** Reads the raw JWT string from the auth cookie, or undefined if absent. */
export function getAuthCookie(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}

/** Clears the auth cookie by overwriting it with an empty value and maxAge 0. */
export function clearAuthCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Reads the auth cookie and verifies the JWT.
 * Returns the decoded user payload, or null if unauthenticated or token invalid.
 */
export async function getCurrentUser(): Promise<UserPayload | null> {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}
