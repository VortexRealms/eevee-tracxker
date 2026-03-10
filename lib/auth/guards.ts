import { redirect } from "next/navigation";
import { getSessionUser } from "./session";

export async function requireAuth(): Promise<void> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
}

