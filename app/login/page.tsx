import { LoginShell } from "../../components/auth/LoginShell";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const showError = searchParams?.error === "invalid";
  const showSessionError = searchParams?.error === "session";
  return <LoginShell showError={showError} showSessionError={showSessionError} />;
}
