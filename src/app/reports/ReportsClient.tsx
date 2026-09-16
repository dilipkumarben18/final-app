'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { recordExpense } from '@/lib/actions/expenses';

const BRAND = '#c46a2f';
const BRAND_DARK = '#8f4a1e';
const BRAND_LIGHT = '#e4a56f';
const GOOD = '#4a8f5c';
const WARN = '#c47a2f';
const BAD = '#c4452f';
const PIE_COLORS = ['#c46a2f', '#8f4a1e', '#e4a56f', '#4a8f5c', '#c4452f', '#5c6b8f', '#c49a2f', '#8f5c8f'];

function formatMoney(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function pctChange(current: number, prior: number): string | null {
  if (prior === 0) return null;
  const change = ((current - prior) / prior) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}% vs last month`;
}

type Kpis = {
  salesThisMonth: number;
  salesLastMonth: number;
  purchasesThisMonth: number;
  purchasesLastMonth: number;
  totalReceivable: number;
  totalPayable: number;
  openDamage: number;
  lowStockCount: number;
  inProgressWarps: number;
};

type TrendRow = { month: string; sales: number; purchases: number };
type NamedAmount = { name: string; amount: number };
type NamedQty = { name: string; quantity: number };
type StockRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  lowStockLevel: number | null;
  low: boolean;
};
type LocationStockRow = { location: string; normal: number; damaged: number; inRepair: number };
type DamageTypeRow = { type: string; count: number };
type DamageStatus = { total: number; open: number; resolved: number; nonRepairable: number };
type WeaverRow = {
  id: string;
  name: string;
  totalSarees: number;
  completedWarps: number;
  damageCount: number;
  damageRate: number;
};
type PartyRow = { id: string; name: string; balance: number };
type Pnl = { sales: number; purchases: number; wages: number; expenses: number; netMargin: number };
type Firm = { id: string; name: string };
type Filters = { from: string; to: string; firmId: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsClient({
  kpis,
  trend,
  salesByFirm,
  topSareeTypes,
  stockRows,
  stockByLocation,
  godownProduction,
  godownNames,
  damageTypeRows,
  damageStatus,
  weaverRows,
  receivables,
  payables,
  pnl,
  firms,
  filters,
}: {
  kpis: Kpis;
  trend: TrendRow[];
  salesByFirm: NamedAmount[];
  topSareeTypes: NamedQty[];
  stockRows: StockRow[];
  stockByLocation: LocationStockRow[];
  godownProduction: Record<string, string | number>[];
  godownNames: string[];
  damageTypeRows: DamageTypeRow[];
  damageStatus: DamageStatus;
  weaverRows: WeaverRow[];
  receivables: PartyRow[];
  payables: PartyRow[];
  pnl: Pnl;
  firms: Firm[];
  filters: Filters;
}) {
  const router = useRouter();
  const salesChange = pctChange(kpis.salesThisMonth, kpis.salesLastMonth);
  const purchasesChange = pctChange(kpis.purchasesThisMonth, kpis.purchasesLastMonth);

  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [firmId, setFirmId] = useState(filters.firmId);

  function applyFilters() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (firmId) params.set('firmId', firmId);
    router.push(`/reports${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function clearFilters() {
    router.push('/reports');
  }

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [expenseCategory, setExpenseCategory] = useState<'MANUFACTURING' | 'OTHER'>('MANUFACTURING');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseFirmId, setExpenseFirmId] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);

  function openExpense() {
    setExpenseDate(todayStr());
    setExpenseCategory('MANUFACTURING');
    setExpenseAmount('');
    setExpenseFirmId('');
    setExpenseNotes('');
    setExpenseOpen(true);
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExpenseSaving(true);
    const result = await recordExpense({
      date: expenseDate,
      category: expenseCategory,
      amount: expenseAmount,
      firmId: expenseFirmId || undefined,
      notes: expenseNotes,
    });
    setExpenseSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Expense recorded');
    setExpenseOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Date range + firm filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <Field label="From">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Business">
          <Select value={firmId} onChange={(e) => setFirmId(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">All businesses</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <PrimaryButton onClick={applyFilters}>Apply</PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Reset to last 12 months</SecondaryButton>
        <p className="ml-auto text-xs text-ink/40">
          Filters trend, sales-by-firm, top saree types, and P&amp;L below. KPI cards and all-time snapshots are
          unaffected.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sales this month" value={`₹${formatMoney(kpis.salesThisMonth)}`} sub={salesChange} />
        <KpiCard label="Purchases this month" value={`₹${formatMoney(kpis.purchasesThisMonth)}`} sub={purchasesChange} />
        <KpiCard label="Total receivable" value={`₹${formatMoney(kpis.totalReceivable)}`} sub="owed to you, across parties" tone="good" />
        <KpiCard label="Total payable" value={`₹${formatMoney(kpis.totalPayable)}`} sub="you owe, across parties" tone="bad" />
        <KpiCard label="Open damage entries" value={String(kpis.openDamage)} sub={`${damageStatus.total} total recorded`} tone={kpis.openDamage > 0 ? 'warn' : undefined} />
        <KpiCard label="Raw materials low on stock" value={String(kpis.lowStockCount)} tone={kpis.lowStockCount > 0 ? 'bad' : 'good'} />
        <KpiCard label="Warps in progress" value={String(kpis.inProgressWarps)} sub="across all active weavers" />
        <KpiCard label="Repair rate" value={damageStatus.total > 0 ? `${((damageStatus.resolved / damageStatus.total) * 100).toFixed(0)}%` : '—'} sub="resolved of all recorded" />
      </div>

      {/* Sales & Purchases trend */}
      <Section title="Sales & Purchases — last 12 months" subtitle="Monthly totals, ₹">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f8e5d8" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={{ stroke: '#f8e5d8' }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${formatMoney(v)}`} width={70} />
            <Tooltip formatter={(v: number) => `₹${formatMoney(v)}`} contentStyle={{ borderRadius: 12, borderColor: '#f8e5d8' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sales" name="Sales" fill={BRAND} radius={[4, 4, 0, 0]} />
            <Bar dataKey="purchases" name="Purchases" fill={BRAND_LIGHT} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Profit & Loss (simplified) */}
      <Section title="Profit & Loss" subtitle="Sales − Purchases − Wages − Expenses, over the filtered period above">
        <p className="mb-3 text-xs text-amber-700">
          Simplified, cash-basis — not full accrual or per-item COGS costing.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <PnlTile label="Sales" value={pnl.sales} sign="+" />
          <PnlTile label="Purchases" value={pnl.purchases} sign="−" />
          <PnlTile label="Wages" value={pnl.wages} sign="−" />
          <PnlTile label="Expenses" value={pnl.expenses} sign="−" />
          <PnlTile label="Net Margin" value={pnl.netMargin} tone={pnl.netMargin >= 0 ? 'good' : 'bad'} emphasize />
        </div>
        <div className="mt-4 flex justify-end">
          <SecondaryButton onClick={openExpense}>Record Expense</SecondaryButton>
        </div>
      </Section>

      {/* Sales by firm + top saree types */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Sales by firm" subtitle="Last 12 months, ₹">
          {salesByFirm.length === 0 ? (
            <EmptyState text="No sales recorded in the last 12 months." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={salesByFirm} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8e5d8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${formatMoney(v)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} width={110} />
                <Tooltip formatter={(v: number) => `₹${formatMoney(v)}`} contentStyle={{ borderRadius: 12, borderColor: '#f8e5d8' }} />
                <Bar dataKey="amount" name="Sales" fill={BRAND} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Top saree types sold" subtitle="Last 12 months, quantity">
          {topSareeTypes.length === 0 ? (
            <EmptyState text="No sales recorded in the last 12 months." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topSareeTypes} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8e5d8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#f8e5d8' }} />
                <Bar dataKey="quantity" name="Qty sold" fill={BRAND_DARK} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* Raw material stock status */}
      <Section title="Raw material stock status" subtitle="Current stock vs low-stock threshold">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink/50">
              <tr>
                <th className="px-2 py-2">Material</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Current stock</th>
                <th className="px-2 py-2">Low-stock level</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...stockRows]
                .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name))
                .map((r) => (
                  <tr key={r.id} className="border-t border-brand-50">
                    <td className="px-2 py-2 font-medium text-ink">{r.name}</td>
                    <td className="px-2 py-2 text-ink/60">{r.category}</td>
                    <td className="px-2 py-2 tabular-nums text-ink/70">
                      {r.currentStock.toLocaleString('en-IN')} {r.unit}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-ink/50">
                      {r.lowStockLevel !== null ? `${r.lowStockLevel.toLocaleString('en-IN')} ${r.unit}` : '—'}
                    </td>
                    <td className="px-2 py-2">
                      {r.lowStockLevel === null ? (
                        <span className="text-ink/40">not tracked</span>
                      ) : r.low ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Low</span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              {stockRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-ink/40">
                    No raw materials yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Finished stock by location */}
      <Section title="Finished stock by location" subtitle="Sarees currently on hand, by state">
        {stockByLocation.length === 0 ? (
          <EmptyState text="No finished stock recorded yet." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, stockByLocation.length * 44)}>
            <BarChart data={stockByLocation} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f8e5d8" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="location" tick={{ fontSize: 12, fill: '#211a15' }} axisLine={false} tickLine={false} width={140} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#f8e5d8' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="normal" name="Normal" stackId="s" fill={GOOD} radius={[0, 0, 0, 0]} />
              <Bar dataKey="inRepair" name="In repair" stackId="s" fill={WARN} radius={[0, 0, 0, 0]} />
              <Bar dataKey="damaged" name="Damaged" stackId="s" fill={BAD} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Godown production */}
      <Section
        title="Godown production"
        subtitle="Sarees received per godown, by month — godowns aren't a stock location anymore, so this is the only place production-by-godown still shows up"
      >
        {godownNames.length === 0 ? (
          <EmptyState text="No sarees received in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-2 py-2">Month</th>
                  {godownNames.map((name) => (
                    <th key={name} className="px-2 py-2">
                      {name}
                    </th>
                  ))}
                  <th className="px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {godownProduction.map((row) => {
                  const total = godownNames.reduce((sum, name) => sum + Number(row[name] || 0), 0);
                  return (
                    <tr key={row.month as string} className="border-t border-brand-50">
                      <td className="px-2 py-2 font-medium text-ink">{row.month}</td>
                      {godownNames.map((name) => (
                        <td key={name} className="px-2 py-2 text-ink/70">
                          {row[name]}
                        </td>
                      ))}
                      <td className="px-2 py-2 font-medium text-ink">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Damage breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Damage by type" subtitle="All-time">
          {damageTypeRows.length === 0 ? (
            <EmptyState text="No damage recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={damageTypeRows} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={85} label={(d) => `${d.type} (${d.count})`}>
                  {damageTypeRows.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#f8e5d8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Damage status" subtitle="All-time">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Open (unresolved)" value={damageStatus.open} tone="warn" />
            <MiniStat label="Repaired / back to stock" value={damageStatus.resolved} tone="good" />
            <MiniStat label="Non-repairable (written off)" value={damageStatus.nonRepairable} tone="bad" />
            <MiniStat label="Total recorded" value={damageStatus.total} />
          </div>
        </Section>
      </div>

      {/* Weaver leaderboard */}
      <Section title="Weaver leaderboard" subtitle="Top 10 by sarees received, all-time">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink/50">
              <tr>
                <th className="px-2 py-2">Weaver</th>
                <th className="px-2 py-2">Sarees received</th>
                <th className="px-2 py-2">Completed warps</th>
                <th className="px-2 py-2">Damage count</th>
                <th className="px-2 py-2">Damage rate</th>
              </tr>
            </thead>
            <tbody>
              {weaverRows.map((w) => (
                <tr key={w.id} className="border-t border-brand-50">
                  <td className="px-2 py-2 font-medium text-ink">
                    <Link href={`/settings/weavers/${w.id}`} className="hover:text-brand-700 hover:underline">
                      {w.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-ink/70">{w.totalSarees}</td>
                  <td className="px-2 py-2 tabular-nums text-ink/70">{w.completedWarps}</td>
                  <td className="px-2 py-2 tabular-nums text-ink/70">{w.damageCount}</td>
                  <td className="px-2 py-2 tabular-nums text-ink/70">{w.damageRate.toFixed(1)}%</td>
                </tr>
              ))}
              {weaverRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-ink/40">
                    No completed weaver activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Party outstanding */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Top receivables" subtitle="Parties who owe you the most">
          <PartyList rows={receivables} tone="good" emptyText="No outstanding receivables." />
        </Section>
        <Section title="Top payables" subtitle="Parties you owe the most">
          <PartyList rows={payables} tone="bad" emptyText="No outstanding payables." />
        </Section>
      </div>

      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Record expense">
        <form onSubmit={handleExpenseSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
            </Field>
            <Field label="Category">
              <Select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value as 'MANUFACTURING' | 'OTHER')} required>
                <option value="MANUFACTURING">Manufacturing Cost</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)">
              <TextInput type="number" min={0.01} step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} required />
            </Field>
            <Field label="Business (optional)">
              <Select value={expenseFirmId} onChange={(e) => setExpenseFirmId(e.target.value)}>
                <option value="">Not specified</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <TextArea rows={2} value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setExpenseOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={expenseSaving}>
              {expenseSaving ? 'Saving…' : 'Record expense'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function PnlTile({
  label,
  value,
  sign,
  tone,
  emphasize,
}: {
  label: string;
  value: number;
  sign?: '+' | '−';
  tone?: 'good' | 'bad';
  emphasize?: boolean;
}) {
  const toneClass = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-ink';
  return (
    <div className={`rounded-xl border p-4 ${emphasize ? 'border-brand-200 bg-brand-50/50' : 'border-brand-50 bg-brand-50/20'}`}>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>
        {sign ? `${sign} ` : ''}₹{formatMoney(Math.abs(value))}
      </p>
      <p className="mt-1 text-xs text-ink/60">{label}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const toneClass = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-brand-700';
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-sm text-ink/60">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-ink';
  return (
    <div className="rounded-xl border border-brand-50 bg-brand-50/40 p-4">
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-ink/60">{label}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink/50">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-ink/40">{text}</p>;
}

function PartyList({ rows, tone, emptyText }: { rows: PartyRow[]; tone: 'good' | 'bad'; emptyText: string }) {
  if (rows.length === 0) return <EmptyState text={emptyText} />;
  return (
    <ul className="space-y-2">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center justify-between rounded-xl border border-brand-50 px-3 py-2">
          <Link href={`/payments/${p.id}`} className="text-sm font-medium text-ink hover:text-brand-700 hover:underline">
            {p.name}
          </Link>
          <span className={`text-sm font-medium tabular-nums ${tone === 'good' ? 'text-green-700' : 'text-red-600'}`}>
            ₹{formatMoney(Math.abs(p.balance))}
          </span>
        </li>
      ))}
    </ul>
  );
}
