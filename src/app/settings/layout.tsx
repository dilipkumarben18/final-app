import { requireMaster } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { SettingsTabs } from './SettingsTabs';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireMaster();

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Settings & Masters</h1>
        <p className="mt-1 text-sm text-ink/60">
          Firms, saree types, godowns, raw materials, weavers, and Worker accounts.
        </p>

        <SettingsTabs />

        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
