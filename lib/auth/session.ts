import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import {
  APP_PASSWORD,
  APP_USERNAME,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  SESSION_TTL_SECONDS
} from "./config";

export interface SessionUser {
  username: string;
}

interface SessionPayload {
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

export async function createSession(username: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { username, exp };
  const token = signPayload(payload);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = parseAndVerify(token);
  if (!payload) return null;

  return { username: payload.username };
}

