// Central list of permission keys. Master always has every key; Worker has
// exactly the fixed set below — access is NOT configurable per worker.

export const PERMISSION_KEYS = [
  'sareeReceiving',
  'warpAlerts',
  'assignWarp',
  'materialIssue',
  'damageEntry',
  // Master-only keys below (never granted to a Worker) — kept in this list
  // so existing pages/nav items can gate on a single PermissionKey type.
  'purchaseEntry',
  'salesEntry',
  'stock',
  'godownToHomeTransfer',
  'payments',
  'reports',
  'partyMaster',
  'production',
  'orders',
  'jariLots',
  'weaverWages',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  sareeReceiving: 'Saree Receiving',
  warpAlerts: 'Warp Alerts',
  assignWarp: 'Assign Warp',
  materialIssue: 'Material Issue',
  damageEntry: 'Damage Entry',
  purchaseEntry: 'Purchase Entry',
  salesEntry: 'Sales Entry',
  stock: 'Stock (view & manage)',
  godownToHomeTransfer: 'Godown → Home Transfer',
  payments: 'Payments',
  reports: 'Reports',
  partyMaster: 'Party Master',
  production: 'Production & Weavers',
  orders: 'Orders',
  jariLots: 'Jari Lots',
  weaverWages: 'Weaver Wages & Advances',
};

// The fixed set of keys every Worker account can use. Not configurable —
// there is no per-worker checkbox UI anymore.
const WORKER_ALLOWED_KEYS: readonly PermissionKey[] = [
  'sareeReceiving',
  'warpAlerts',
  'assignWarp',
  'materialIssue',
  'damageEntry',
];

type SessionUserLike = {
  role: 'MASTER' | 'WORKER';
};

/**
 * Master always has full access. Worker has exactly the fixed operational
 * set above (Saree Receiving, Warp Alerts, Assign Warp, Material Issue,
 * Damage Entry) and nothing else — no purchases, sales, payments, GST,
 * reports, or master-data editing.
 */
export function can(user: SessionUserLike, key: PermissionKey): boolean {
  if (user.role === 'MASTER') return true;
  return WORKER_ALLOWED_KEYS.includes(key);
}
