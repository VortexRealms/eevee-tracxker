import { NextResponse } from "next/server";
import {
  attachSessionCookie,
  buildSessionToken,
  clearSessionCookie,
  validateCredentials,
} from "../../../../lib/auth/session";

function wantsJsonResponse(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const wantsJson = wantsJsonResponse(req);

  if (!validateCredentials(username, password)) {
    if (wantsJson) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login?error=invalid", req.url), 303);
  }

  try {
    const token = await buildSessionToken(username);

    if (wantsJson) {
      const response = NextResponse.json({ ok: true });
      clearSessionCookie(response);
      attachSessionCookie(response, token);
      return response;
    }

    const response = NextResponse.redirect(new URL("/checklist", req.url), 303);
    clearSessionCookie(response);
    attachSessionCookie(response, token);
    return response;
  } catch (err) {
    console.error("Login failed while creating session:", err);
    if (wantsJson) {
      return NextResponse.json({ error: "session" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/login?error=session", req.url), 303);
  }
}
