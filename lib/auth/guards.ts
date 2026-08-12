import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

export async function requireAuth(): Promise<void> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
}

/** For route handlers: return 401 JSON instead of redirecting (fetch cannot follow login HTML). */
export async function requireAuthApi(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

