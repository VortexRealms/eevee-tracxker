import { cookies } from "next/headers";
import { type NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  APP_PASSWORD,
  APP_USERNAME,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  SESSION_TTL_SECONDS
} from "./config";
import { ensureAppUser } from "../db/users";
import { requireAppUserId } from "../db/config";

export interface SessionUser {
  userId: string;
  username: string;
}

interface SessionPayload {
  userId: string;
  username: string;
  exp: number;
}

function getSigningKey(): Buffer {
  return Buffer.from(SESSION_SECRET || "dev-secret");
}

function signPayload(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const base = Buffer.from(json).toString("base64url");
  const hmac = createHmac("sha256", getSigningKey()).update(base).digest();
  const sig = hmac.toString("base64url");
  return `${base}.${sig}`;
}

function parseAndVerify(token: string): SessionPayload | null {
  const [base, sig] = token.split(".");
  if (!base || !sig) return null;

  const expected = createHmac("sha256", getSigningKey())
    .update(base)
    .digest();
  const provided = Buffer.from(sig, "base64url");

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const json = Buffer.from(base, "base64url").toString("utf8");
    const payload = JSON.parse(json) as SessionPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    if (!payload.userId || !payload.username) return null;
  return payload;
  } catch {
    return null;
  }
}

export function validateCredentials(
  username: string,
  password: string
): boolean {
  return username === APP_USERNAME && password === APP_PASSWORD;
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export async function buildSessionToken(username: string): Promise<string> {
  const userId = requireAppUserId();
  await ensureAppUser({ id: userId, username });

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { userId, username, exp };
  return signPayload(payload);
}

/** Attach session cookie to a Route Handler response (required for login redirects). */
export function attachSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export async function createSession(username: string): Promise<void> {
  const token = await buildSessionToken(username);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = parseAndVerify(token);
  if (!payload) return null;

  return { userId: payload.userId, username: payload.username };
}

