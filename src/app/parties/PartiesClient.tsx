'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { createParty, setPartyActive, updateParty, createBranch, updateBranch } from '@/lib/actions/parties';
import { Plus, FileClock } from 'lucide-react';

type PartyType = 'PURCHASE' | 'SALES' | 'BOTH' | 'TRANSPORTER' | 'DYEING' | 'AGENT' | 'JOB_WORKER';

type Branch = { id: string; name: string; address: string | null; phone: string | null };

type Party = {
  id: string;
  name: string;
  type: PartyType;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  openingBalance: string;
  creditLimit: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  branches: Branch[];
};

type PartyForm = {
  name: string;
  type: PartyType;
  mobile: string;
  email: string;
  address: string;
  gstNumber: string;
  openingBalance: string;
  creditLimit: string;
  paymentTerms: string;
};

const emptyForm: PartyForm = {
  name: '',
  type: 'BOTH',
  mobile: '',
  email: '',
  address: '',
  gstNumber: '',
  openingBalance: '0',
  creditLimit: '',
  paymentTerms: '',
};

const emptyBranchForm = { name: '', address: '', phone: '' };

export function PartiesClient({ parties, canEdit }: { parties: Party[]; canEdit: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState<PartyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PURCHASE' | 'SALES' | 'BOTH'>('ALL');
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(p: Party) {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      mobile: p.mobile ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      gstNumber: p.gstNumber ?? '',
      openingBalance: p.openingBalance,
      creditLimit: p.creditLimit ?? '',
      paymentTerms: p.paymentTerms ?? '',
    });
    setBranchForm(emptyBranchForm);
    setEditingBranch(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = editing ? await updateParty(editing.id, form) : await createParty(form);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? 'Party updated' : 'Party added');
    setModalOpen(false);
  }

  async function toggleActive(p: Party) {
    const result = await setPartyActive(p.id, !p.isActive);
    if (result.error) toast.error(result.error);
    else toast.success(p.isActive ? 'Marked inactive' : 'Marked active');
  }

  function openBranchEdit(b: Branch) {
    setEditingBranch(b);
    setBranchForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' });
  }

  async function handleBranchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingBranch(true);
    const result = editingBranch
      ? await updateBranch(editingBranch.id, branchForm)
      : await createBranch(editing.id, branchForm);
    setSavingBranch(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editingBranch ? 'Branch updated' : 'Branch added');
    setBranchForm(emptyBranchForm);
    setEditingBranch(null);
  }

  const visible = filter === 'ALL' ? parties : parties.filter((p) => p.type === filter || p.type === 'BOTH');

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['ALL', 'PURCHASE', 'SALES', 'BOTH'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 border border-brand-100'
              }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {canEdit && (
          <PrimaryButton onClick={openCreate} className="flex items-center gap-1.5">
            <Plus size={16} /> Add party
          </PrimaryButton>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">GST No.</th>
              <th className="px-4 py-3">Branches</th>
              <th className="px-4 py-3">Opening Bal.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3 text-ink/70">{p.type}</td>
                <td className="px-4 py-3 text-ink/70">{p.mobile || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{p.gstNumber || '—'}</td>
                <td className="px-4 py-3 text-ink/70">{p.branches.length || '—'}</td>
                <td className="px-4 py-3 text-ink/70">₹{p.openingBalance}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.isActive ? 'bg-green-100 text-green-700' : 'bg-ink/10 text-ink/50'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/payments/${p.id}`}
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <FileClock size={14} /> Statement
                  </Link>
                  {canEdit && (
                    <>
                      <button onClick={() => openEdit(p)} className="ml-3 text-brand-700 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(p)} className="ml-3 text-ink/50 hover:underline">
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink/40">
                  No parties yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit party' : 'Add party'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <TextInput
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as PartyType })}
            >
              <option value="PURCHASE">Purchase / Supplier</option>
              <option value="SALES">Sales / Customer</option>
              <option value="BOTH">Both</option>
              <option value="TRANSPORTER">Transporter</option>
              <option value="DYEING">Dyeing House</option>
              <option value="AGENT">Agent</option>
              <option value="JOB_WORKER">Job Worker</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile number">
              <TextInput
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </Field>
            <Field label="Email (optional)">
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Address">
            <TextInput
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="GST / tax number">
            <TextInput
              value={form.gstNumber}
              onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening balance">
              <TextInput
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
              />
            </Field>
            <Field label="Credit limit">
              <TextInput
                type="number"
                step="0.01"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Payment terms">
            <TextInput
              placeholder="e.g. Net 30"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
          </Field>

          {editing && (
            <div className="border-t border-brand-100 pt-3">
              <p className="text-sm font-medium text-ink/80">Branches</p>
              <div className="mt-2 space-y-1.5">
                {editing.branches.length === 0 && (
                  <p className="text-xs text-ink/40">No branches yet.</p>
                )}
                {editing.branches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-1.5 text-sm"
                  >
                    <div>
                      <span className="font-medium text-ink">{b.name}</span>
                      {b.address && <span className="ml-2 text-xs text-ink/50">{b.address}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => openBranchEdit(b)}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 rounded-lg border border-dashed border-brand-100 p-3">
                <p className="text-xs font-medium text-ink/60">
                  {editingBranch ? `Editing "${editingBranch.name}"` : 'Add a branch'}
                </p>
                <TextInput
                  placeholder="Branch name"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                />
                <TextInput
                  placeholder="Branch address"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                />
                <TextInput
                  placeholder="Branch phone"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
                <div className="flex justify-end gap-2">
                  {editingBranch && (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setEditingBranch(null);
                        setBranchForm(emptyBranchForm);
                      }}
                    >
                      Cancel
                    </SecondaryButton>
                  )}
                  <SecondaryButton type="button" disabled={savingBranch} onClick={handleBranchSubmit}>
                    {savingBranch ? 'Saving…' : editingBranch ? 'Save branch' : 'Add branch'}
                  </SecondaryButton>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add party'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
