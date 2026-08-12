import { LoginShell } from "../../components/auth/LoginShell";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const showError = params.error === "invalid";
  const showSessionError = params.error === "session";
  return <LoginShell showError={showError} showSessionError={showSessionError} />;
}
