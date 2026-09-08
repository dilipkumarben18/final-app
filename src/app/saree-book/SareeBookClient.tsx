'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, ImageOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import { updateSareeDetails, updateSareeStatus, uploadSareePhotos } from '@/lib/actions/sareeReceiving';
import { reportDamage } from '@/lib/actions/damage';

const DAMAGE_TYPE_LABELS = {
  WEAVING_DEFECT: 'Weaving defect',
  COLOUR_ISSUE: 'Colour issue',
  JARI_ISSUE: 'Jari issue',
  BORDER_ISSUE: 'Border issue',
  TEAR_CUT: 'Tear / cut',
  STAIN: 'Stain',
  OTHER: 'Other',
} as const;
type DamageType = keyof typeof DAMAGE_TYPE_LABELS;

type Entry = {
  id: string;
  serialNumber: string;
  sareeNumber: number;
  weaverName: string;
  sareeTypeName: string;
  weightGram: string | null;
  designName: string | null;
  warpColour: string | null;
  weftColour: string | null;
  jariColour: string | null;
  status: 'IN_STOCK' | 'SOLD' | 'DAMAGED';
  photoUrls: string[];
  receivedAt: string;
};

const STATUS_LABELS: Record<Entry['status'], string> = { IN_STOCK: 'In Stock', SOLD: 'Sold', DAMAGED: 'Damaged' };
const STATUS_COLORS: Record<Entry['status'], string> = {
  IN_STOCK: 'bg-green-100 text-green-700',
  SOLD: 'bg-blue-100 text-blue-700',
  DAMAGED: 'bg-red-100 text-red-700',
};

export function SareeBookClient({ entries: initialEntries }: { entries: Entry[] }) {
  const [entries, setEntries] = useState(initialEntries);

  const [editing, setEditing] = useState<Entry | null>(null);
  const [weightGram, setWeightGram] = useState('');
  const [designName, setDesignName] = useState('');
  const [warpColour, setWarpColour] = useState('');
  const [weftColour, setWeftColour] = useState('');
  const [jariColour, setJariColour] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [photosFor, setPhotosFor] = useState<Entry | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const [damageFor, setDamageFor] = useState<Entry | null>(null);
  const [damageType, setDamageType] = useState<DamageType>('OTHER');
  const [damageDescription, setDamageDescription] = useState('');
  const [savingDamage, setSavingDamage] = useState(false);

  const [sareeTypeFilter, setSareeTypeFilter] = useState('');
  const [weaverFilter, setWeaverFilter] = useState('');

  const sareeTypeOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.sareeTypeName))).sort(),
    [entries]
  );
  const weaverOptions = useMemo(() => Array.from(new Set(entries.map((e) => e.weaverName))).sort(), [entries]);

  const visibleEntries = entries.filter(
    (e) => (!sareeTypeFilter || e.sareeTypeName === sareeTypeFilter) && (!weaverFilter || e.weaverName === weaverFilter)
  );

  async function handleStatusChange(entry: Entry, status: Entry['status']) {
    if (status === 'DAMAGED') {
      // Damaged needs a real Damage Register entry (type, description,
      // photos, repair tracking) — not just a status flip — so open that
      // form instead of saving directly. The select will visually snap
      // back to the current status until the form is actually submitted.
      setDamageFor(entry);
      setDamageType('OTHER');
      setDamageDescription('');
      return;
    }
    setStatusSavingId(entry.id);
    const result = await updateSareeStatus({ id: entry.id, status });
    setStatusSavingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status } : e)));
  }

  async function handleReportDamage(e: React.FormEvent) {
    e.preventDefault();
    if (!damageFor) return;
    setSavingDamage(true);
    const result = await reportDamage({
      sareeReceivingEntryId: damageFor.id,
      damageType,
      description: damageDescription || undefined,
    });
    setSavingDamage(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === damageFor.id ? { ...e, status: 'DAMAGED' } : e)));
    toast.success('Damage recorded');
    setDamageFor(null);
  }

  function openEdit(entry: Entry) {
    setEditing(entry);
    setWeightGram(entry.weightGram ?? '');
    setDesignName(entry.designName ?? '');
    setWarpColour(entry.warpColour ?? '');
    setWeftColour(entry.weftColour ?? '');
    setJariColour(entry.jariColour ?? '');
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingDetails(true);
    const result = await updateSareeDetails({
      id: editing.id,
      weightGram: weightGram || undefined,
      designName,
      warpColour,
      weftColour,
      jariColour,
    });
    setSavingDetails(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.id === editing.id
          ? { ...e, weightGram: weightGram || null, designName, warpColour, weftColour, jariColour }
          : e
      )
    );
    toast.success('Saved');
    setEditing(null);
  }

  async function handleAddPhotos(e: React.FormEvent) {
    e.preventDefault();
    if (!photosFor || !photoInputRef.current?.files || photoInputRef.current.files.length === 0) {
      toast.error('Choose at least one photo.');
      return;
    }
    setAddingPhotos(true);
    const formData = new FormData();
    for (const file of Array.from(photoInputRef.current.files)) formData.append('photos', file);
    const result = await uploadSareePhotos(photosFor.id, formData);
    setAddingPhotos(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const newUrls = result.photoUrls ?? [];
    setEntries((prev) => prev.map((e) => (e.id === photosFor.id ? { ...e, photoUrls: newUrls } : e)));
    setPhotosFor((prev) => (prev ? { ...prev, photoUrls: newUrls } : prev));
    if (photoInputRef.current) photoInputRef.current.value = '';
    toast.success('Photos uploaded');
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <Field label="Saree type">
          <Select value={sareeTypeFilter} onChange={(e) => setSareeTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {sareeTypeOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Weaver">
          <Select value={weaverFilter} onChange={(e) => setWeaverFilter(e.target.value)}>
            <option value="">All weavers</option>
            {weaverOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        {(sareeTypeFilter || weaverFilter) && (
          <button
            onClick={() => {
              setSareeTypeFilter('');
              setWeaverFilter('');
            }}
            className="text-sm text-ink/50 hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-ink/50">
          {visibleEntries.length} of {entries.length} sarees
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Weaver</th>
              <th className="px-4 py-3">Saree type</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Design</th>
              <th className="px-4 py-3">Colours</th>
              <th className="px-4 py-3">Photos</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map((e) => (
              <tr key={e.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{e.serialNumber}</td>
                <td className="px-4 py-3 text-ink/70">{e.weaverName}</td>
                <td className="px-4 py-3 text-ink/70">{e.sareeTypeName}</td>
                <td className="px-4 py-3 text-ink/70">{e.weightGram ? `${e.weightGram} g` : '—'}</td>
                <td className="px-4 py-3 text-ink/70">{e.designName || '—'}</td>
                <td className="px-4 py-3 text-ink/70">
                  {[e.warpColour, e.weftColour, e.jariColour].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setPhotosFor(e)}
                    className="flex items-center gap-1 text-ink/50 hover:text-brand-700"
                    title={e.photoUrls.length > 0 ? `${e.photoUrls.length} photo(s)` : 'Add photos'}
                  >
                    {e.photoUrls.length > 0 ? <Camera size={16} /> : <ImageOff size={16} />}
                    {e.photoUrls.length > 0 && <span className="text-xs">{e.photoUrls.length}</span>}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={e.status}
                    disabled={statusSavingId === e.id}
                    onChange={(ev) => handleStatusChange(e, ev.target.value as Entry['status'])}
                    className={`!w-auto rounded-full border-0 px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[e.status]}`}
                  >
                    {(Object.keys(STATUS_LABELS) as Entry['status'][]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-3 text-ink/70">{new Date(e.receivedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(e)} className="text-brand-700 hover:underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-ink/40">
                  {entries.length === 0 ? 'No sarees received yet.' : 'No sarees match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit — ${editing.serialNumber}` : ''}>
        {editing && (
          <form onSubmit={handleSaveDetails} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (grams)">
                <TextInput type="number" min={0} step="1" value={weightGram} onChange={(e) => setWeightGram(e.target.value)} />
              </Field>
              <Field label="Design">
                <TextInput value={designName} onChange={(e) => setDesignName(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Warp colour">
                <TextInput value={warpColour} onChange={(e) => setWarpColour(e.target.value)} />
              </Field>
              <Field label="Weft colour">
                <TextInput value={weftColour} onChange={(e) => setWeftColour(e.target.value)} />
              </Field>
              <Field label="Jari colour">
                <TextInput value={jariColour} onChange={(e) => setJariColour(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setEditing(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={savingDetails}>
                {savingDetails ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!photosFor} onClose={() => setPhotosFor(null)} title={`Photos — ${photosFor?.serialNumber ?? ''}`}>
        <div className="space-y-3">
          {photosFor && photosFor.photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photosFor.photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-brand-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Saree" className="h-24 w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {photosFor && photosFor.photoUrls.length === 0 && <p className="text-sm text-ink/40">No photos yet.</p>}
          <form onSubmit={handleAddPhotos} className="space-y-3 border-t border-brand-100 pt-3">
            <Field label="Add photos">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setPhotosFor(null)}>
                Close
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={addingPhotos}>
                {addingPhotos ? 'Uploading…' : 'Upload'}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </Modal>

      <Modal open={!!damageFor} onClose={() => setDamageFor(null)} title={`Report damage — ${damageFor?.serialNumber ?? ''}`}>
        {damageFor && (
          <form onSubmit={handleReportDamage} className="space-y-3">
            <p className="text-sm text-ink/60">
              {damageFor.sareeTypeName} — woven by {damageFor.weaverName}
            </p>
            <Field label="What's wrong">
              <Select value={damageType} onChange={(e) => setDamageType(e.target.value as DamageType)}>
                {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((key) => (
                  <option key={key} value={key}>
                    {DAMAGE_TYPE_LABELS[key]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description (optional)">
              <TextInput value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
            </Field>
            <p className="text-xs text-ink/50">
              This creates a Damage Register entry linked to this exact serial number — add photos,
              repair status, etc. from the Damage page afterwards.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setDamageFor(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={savingDamage}>
                {savingDamage ? 'Saving…' : 'Report damage'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
