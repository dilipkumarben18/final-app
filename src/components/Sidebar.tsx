'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { can, PermissionKey } from '@/lib/permissions';
import {
  LayoutDashboard,
  ShoppingCart,
  Factory,
  Warehouse,
  Receipt,
  Users,
  Wallet,
  AlertTriangle,
  BarChart3,
  LogOut,
  Bell,
  PackageOpen,
  HandCoins,
  Grid3x3,
  Menu,
  X,
  ClipboardList,
  PackageSearch,
  BookOpen,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: PermissionKey;
  masterOnly?: boolean;
};

type NavGroup = {
  // null = no visible header (Dashboard sits alone at the top)
  label: string | null;
  items: NavItem[];
};

// Grouped by how the business actually works, not alphabetically or by when
// each feature shipped — Production is the physical warp-to-saree chain,
// Inventory is the stock view/transfer screen downstream of it, Buying &
// Selling is the money-in/money-out entry screens, Parties & Payments is the
// ledger side of those, and Insights/Admin are their own thing. Flattened
// (via NAV_GROUPS.flatMap) wherever a flat list is still needed — the mobile
// bottom tab bar and permission filtering don't care about grouping.
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Production',
    items: [
      { href: '/production', label: 'Warp Dyeing', icon: Factory, permission: 'production' },
      { href: '/weft-dyeing', label: 'Weft Dyeing', icon: Factory, permission: 'production' },
      { href: '/warp-alerts', label: 'Warp Alerts', icon: Bell, permission: 'warpAlerts' },
      { href: '/material-issue', label: 'Material Issue', icon: PackageOpen, permission: 'materialIssue' },
      { href: '/saree-receiving', label: 'Saree Receiving', icon: Grid3x3, permission: 'sareeReceiving' },
      { href: '/saree-book', label: 'Saree Book', icon: BookOpen, permission: 'sareeReceiving' },
      { href: '/production-batches', label: 'Production Batches', icon: ClipboardList, masterOnly: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/stock', label: 'Stock', icon: Warehouse, permission: 'stock' },
      { href: '/jari-lots', label: 'Jari Lots', icon: PackageSearch, permission: 'jariLots' },
    ],
  },
  {
    label: 'Buying & Selling',
    items: [
      { href: '/orders', label: 'Orders', icon: ClipboardList, permission: 'orders' },
      { href: '/purchases', label: 'Purchases', icon: ShoppingCart, permission: 'purchaseEntry' },
      { href: '/sales', label: 'Sales', icon: Receipt, permission: 'salesEntry' },
      { href: '/damage', label: 'Damage & Repair', icon: AlertTriangle, permission: 'damageEntry' },
    ],
  },
  {
    label: 'Parties & Payments',
    items: [
      { href: '/parties', label: 'Parties', icon: Users, permission: 'partyMaster' },
      { href: '/payments', label: 'Payments', icon: Wallet, permission: 'payments' },
      { href: '/wages', label: 'Weaver Wages & Advances', icon: HandCoins, permission: 'weaverWages' },
    ],
  },
  {
    label: 'Insights',
    items: [{ href: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports' }],
  },
  {
    label: 'Admin',
    items: [{ href: '/settings', label: 'Settings & Users', icon: Users, masterOnly: true }],
  },
];

// Bottom tab bar can't fit every role's full nav (Master has 13 items) — show
// the first few permitted items directly, everything else lives behind "More".
const BOTTOM_NAV_PRIMARY_COUNT = 4;

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!session) return null;
  const user = session.user;

  function isVisible(item: NavItem) {
    if (item.masterOnly) return user.role === 'MASTER';
    if (item.permission) return can(user, item.permission);
    return true;
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(isVisible) })).filter(
    (group) => group.items.length > 0
  );
  const visibleItems = visibleGroups.flatMap((group) => group.items);

  const primaryItems = visibleItems.slice(0, BOTTOM_NAV_PRIMARY_COUNT);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 flex-col border-r border-brand-100 bg-white md:flex">
        <div className="border-b border-brand-100 px-5 py-5">
          <p className="font-display text-lg font-semibold text-ink">Saree App</p>
          <p className="text-xs text-ink/50">{user.name} · {user.role}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className={gi > 0 ? 'mt-5' : ''}>
              {group.label && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive(item.href) ? 'bg-brand-500 text-white' : 'text-ink/70 hover:bg-brand-50 hover:text-ink'
                      }`}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 border-t border-brand-100 px-5 py-4 text-sm font-medium text-ink/60 hover:text-ink"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      {/* Mobile top bar (fixed — see globals.css for the body padding that clears it) */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-brand-100 bg-white px-4 md:hidden">
        <div>
          <p className="font-display text-base font-semibold text-ink">Saree App</p>
          <p className="text-xs text-ink/50">{user.name} · {user.role}</p>
        </div>
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="Open menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink/70 hover:bg-brand-50 active:bg-brand-100"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Mobile bottom tab bar — fixed height, see globals.css for the body padding that clears it */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-brand-100 bg-white md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? 'text-brand-700' : 'text-ink/50'
              }`}
            >
              <Icon size={22} />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-ink/50"
        >
          <Menu size={22} />
          <span>More</span>
        </button>
      </nav>

      {/* Full nav overlay (mobile "More" / hamburger target) */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center justify-between border-b border-brand-100 px-5 py-4">
            <div>
              <p className="font-display text-lg font-semibold text-ink">Saree App</p>
              <p className="text-xs text-ink/50">{user.name} · {user.role}</p>
            </div>
            <button
              onClick={() => setMoreOpen(false)}
              aria-label="Close menu"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink/70 hover:bg-brand-50 active:bg-brand-100"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {visibleGroups.map((group, gi) => (
              <div key={group.label ?? `group-${gi}`} className={gi > 0 ? 'mt-4' : ''}>
                {group.label && (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/35">
                    {group.label}
                  </p>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition ${
                          isActive(item.href) ? 'bg-brand-500 text-white' : 'text-ink/70 hover:bg-brand-50 hover:text-ink'
                        }`}
                      >
                        <Icon size={20} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 border-t border-brand-100 px-5 py-4 text-base font-medium text-ink/60 hover:text-ink"
          >
            <LogOut size={20} />
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
