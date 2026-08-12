import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../../lib/auth/session";

export async function POST(req: Request) {
  const response = NextResponse.redirect(new URL("/login", req.url), 303);
  clearSessionCookie(response);
  return response;
}

