import { NextResponse } from "next/server";
import { createSession, validateCredentials } from "../../../../lib/auth/session";

export async function POST(req: Request) {
  const formData = await req.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!validateCredentials(username, password)) {
    // Very simple error handling: redirect back to login.
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }

  await createSession(username);

  // Use 303 so the browser follows up with GET /checklist after POST /login.
  return NextResponse.redirect(new URL("/checklist", req.url), 303);
}

