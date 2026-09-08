'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/firms', label: 'Firms' },
  { href: '/settings/saree-types', label: 'Saree Types' },
  { href: '/settings/locations', label: 'Godowns' },
  { href: '/settings/raw-materials', label: 'Raw Materials' },
  { href: '/settings/weavers', label: 'Weavers' },
  { href: '/settings/colours', label: 'Saree Colours' },
  { href: '/settings/jari-codes', label: 'Jari Codes' },
  { href: '/settings/users', label: 'Worker Accounts' },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b border-brand-100">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              active
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
