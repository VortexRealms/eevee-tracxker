import { requireAuth } from "../../lib/auth/guards";
import { SettingsPanel } from "../../components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAuth();

  return (
    <main className="page-stack">
      <SettingsPanel />
    </main>
  );
}
