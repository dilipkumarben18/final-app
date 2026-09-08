'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Camera, ImageOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, TextArea, Select, PrimaryButton, SecondaryButton } from '@/components/ui/Form';
import {
  reportDamage,
  sendForRepair,
  markUnderRepair,
  markRepaired,
  markNonRepairable,
  returnToStock,
  uploadDamagePhotos,
} from '@/lib/actions/damage';

type DamageType = 'WEAVING_DEFECT' | 'COLOUR_ISSUE' | 'JARI_ISSUE' | 'BORDER_ISSUE' | 'TEAR_CUT' | 'STAIN' | 'OTHER';
type DamageStatus =
  | 'DAMAGED'
  | 'SENT_FOR_REPAIR'
  | 'UNDER_REPAIR'
  | 'REPAIRED'
  | 'NON_REPAIRABLE'
  | 'BACK_TO_NORMAL_STOCK';

type Entry = {
  id: string;
  damageNumber: string;
  serialNumber: string | null;
  sareeTypeName: string;
  locationName: string;
  weaverName: string | null;
  damageType: DamageType;
  description: string | null;
  status: DamageStatus;
  damageDate: string;
  repairable: boolean | null;
  repairer: string | null;
  repairAmount: string | null;
  sentOutDate: string | null;
  repairedDate: string | null;
  photoUrls: string[];
};

type Option = { id: string; name: string };

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  WEAVING_DEFECT: 'Weaving defect',
  COLOUR_ISSUE: 'Colour issue',
  JARI_ISSUE: 'Jari issue',
  BORDER_ISSUE: 'Border issue',
  TEAR_CUT: 'Tear / cut',
  STAIN: 'Stain',
  OTHER: 'Other',
};

const STATUS_LABELS: Record<DamageStatus, string> = {
  DAMAGED: 'Damaged',
  SENT_FOR_REPAIR: 'Sent for repair',
  UNDER_REPAIR: 'Under repair',
  REPAIRED: 'Repaired',
  NON_REPAIRABLE: 'Non-repairable',
  BACK_TO_NORMAL_STOCK: 'Back to stock',
};

const STATUS_COLORS: Record<DamageStatus, string> = {
  DAMAGED: 'bg-red-100 text-red-700',
  SENT_FOR_REPAIR: 'bg-amber-100 text-amber-700',
  UNDER_REPAIR: 'bg-amber-100 text-amber-700',
  REPAIRED: 'bg-blue-100 text-blue-700',
  NON_REPAIRABLE: 'bg-ink/10 text-ink/50',
  BACK_TO_NORMAL_STOCK: 'bg-green-100 text-green-700',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyReportForm = {
  locationId: '',
  sareeTypeId: '',
  weaverId: '',
  damageType: 'WEAVING_DEFECT' as DamageType,
  description: '',
  repairable: '' as 'YES' | 'NO' | '',
};

export function DamageClient({
  entries,
  sareeTypes,
  locations,
  weavers,
}: {
  entries: Entry[];
  sareeTypes: Option[];
  locations: Option[];
  weavers: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    ...emptyReportForm,
    locationId: locations[0]?.id ?? '',
    sareeTypeId: sareeTypes[0]?.id ?? '',
  });
  const [reportFiles, setReportFiles] = useState<FileList | null>(null);
  const reportFileInputRef = useRef<HTMLInputElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Arriving from Saree Receiving's "Mark as Damaged" (a mis-ticked saree
  // that's actually damaged) pre-fills and opens the report form with the
  // same weaver/saree type/location instead of making the user re-pick them.
  useEffect(() => {
    const locationId = searchParams.get('locationId');
    const sareeTypeId = searchParams.get('sareeTypeId');
    const weaverId = searchParams.get('weaverId');
    if (!locationId && !sareeTypeId && !weaverId) return;

    setReportForm((prev) => ({
      ...prev,
      locationId: locationId || prev.locationId,
      sareeTypeId: sareeTypeId || prev.sareeTypeId,
      weaverId: weaverId || prev.weaverId,
    }));
    setReportOpen(true);
    router.replace('/damage');
    // Only consume the params present on the initial navigation in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sendRepairFor, setSendRepairFor] = useState<Entry | null>(null);
  const [repairer, setRepairer] = useState('');
  const [sentOutDate, setSentOutDate] = useState(todayStr());

  const [markRepairedForFor, setMarkRepairedFor] = useState<Entry | null>(null);
  const [repairedDate, setRepairedDate] = useState(todayStr());
  const [repairAmount, setRepairAmount] = useState('');

  const [photosFor, setPhotosFor] = useState<Entry | null>(null);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusyId('report');
    const result = await reportDamage(reportForm);
    if (result.error) {
      setBusyId(null);
      toast.error(result.error);
      return;
    }
    if (reportFiles && reportFiles.length > 0 && result.id) {
      const formData = new FormData();
      for (const file of Array.from(reportFiles)) formData.append('photos', file);
      const uploadResult = await uploadDamagePhotos(result.id, formData);
      if (uploadResult.error) toast.error(`Damage recorded, but photo upload failed: ${uploadResult.error}`);
    }
    setBusyId(null);
    toast.success('Damage recorded');
    setReportOpen(false);
    setReportForm({ ...emptyReportForm, locationId: locations[0]?.id ?? '', sareeTypeId: sareeTypes[0]?.id ?? '' });
    setReportFiles(null);
    if (reportFileInputRef.current) reportFileInputRef.current.value = '';
  }

  async function handleUnderRepair(entry: Entry) {
    setBusyId(entry.id);
    const result = await markUnderRepair(entry.id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Marked under repair');
  }

  async function handleNonRepairable(entry: Entry) {
    setBusyId(entry.id);
    const result = await markNonRepairable(entry.id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Marked non-repairable');
  }

  async function handleReturnToStock(entry: Entry) {
    setBusyId(entry.id);
    const result = await returnToStock(entry.id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Back in sellable stock');
  }

  function openSendRepair(entry: Entry) {
    setSendRepairFor(entry);
    setRepairer('');
    setSentOutDate(todayStr());
  }

  async function handleSendRepairSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sendRepairFor) return;
    setBusyId(sendRepairFor.id);
    const result = await sendForRepair({ id: sendRepairFor.id, repairer, sentOutDate });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Sent for repair');
    setSendRepairFor(null);
  }

  function openMarkRepaired(entry: Entry) {
    setMarkRepairedFor(entry);
    setRepairedDate(todayStr());
    setRepairAmount('');
  }

  async function handleMarkRepairedSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!markRepairedForFor) return;
    setBusyId(markRepairedForFor.id);
    const result = await markRepaired({
      id: markRepairedForFor.id,
      repairedDate,
      repairAmount: repairAmount || undefined,
    });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Marked repaired');
    setMarkRepairedFor(null);
  }

  function openPhotos(entry: Entry) {
    setPhotosFor(entry);
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
    const result = await uploadDamagePhotos(photosFor.id, formData);
    setAddingPhotos(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Photos uploaded');
    setPhotosFor(null);
  }

  const canSendRepair = (s: DamageStatus) => s === 'DAMAGED';
  const canMarkNonRepairable = (s: DamageStatus) => s === 'DAMAGED' || s === 'SENT_FOR_REPAIR' || s === 'UNDER_REPAIR';

  return (
    <div>
      <div className="flex justify-end">
        <PrimaryButton onClick={() => setReportOpen(true)} className="flex items-center gap-1.5">
          <Plus size={16} /> Report damage
        </PrimaryButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-ink/50">
            <tr>
              <th className="px-4 py-3">Damage #</th>
              <th className="px-4 py-3">Serial #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Saree type</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Weaver</th>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Photos</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-medium text-ink">{entry.damageNumber}</td>
                <td className="px-4 py-3 text-ink/70">{entry.serialNumber ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{new Date(entry.damageDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink/70">{entry.sareeTypeName}</td>
                <td className="px-4 py-3 text-ink/70">{entry.locationName}</td>
                <td className="px-4 py-3 text-ink/70">{entry.weaverName ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{DAMAGE_TYPE_LABELS[entry.damageType]}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => openPhotos(entry)}
                    className="flex items-center gap-1 text-ink/50 hover:text-brand-700"
                    title={entry.photoUrls.length > 0 ? `${entry.photoUrls.length} photo(s)` : 'Add photos'}
                  >
                    {entry.photoUrls.length > 0 ? <Camera size={16} /> : <ImageOff size={16} />}
                    {entry.photoUrls.length > 0 && <span className="text-xs">{entry.photoUrls.length}</span>}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.status]}`}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canSendRepair(entry.status) && (
                    <button
                      onClick={() => openSendRepair(entry)}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                      disabled={busyId === entry.id}
                    >
                      Send for repair
                    </button>
                  )}
                  {entry.status === 'SENT_FOR_REPAIR' && (
                    <>
                      <button
                        onClick={() => handleUnderRepair(entry)}
                        className="text-ink/60 hover:underline disabled:opacity-50"
                        disabled={busyId === entry.id}
                      >
                        Under repair
                      </button>
                      <button
                        onClick={() => openMarkRepaired(entry)}
                        className="ml-3 text-brand-700 hover:underline disabled:opacity-50"
                        disabled={busyId === entry.id}
                      >
                        Mark repaired
                      </button>
                    </>
                  )}
                  {entry.status === 'UNDER_REPAIR' && (
                    <button
                      onClick={() => openMarkRepaired(entry)}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                      disabled={busyId === entry.id}
                    >
                      Mark repaired
                    </button>
                  )}
                  {canMarkNonRepairable(entry.status) && (
                    <button
                      onClick={() => handleNonRepairable(entry)}
                      className="ml-3 text-ink/50 hover:underline disabled:opacity-50"
                      disabled={busyId === entry.id}
                    >
                      Not repairable
                    </button>
                  )}
                  {entry.status === 'REPAIRED' && (
                    <button
                      onClick={() => handleReturnToStock(entry)}
                      className="text-brand-700 hover:underline disabled:opacity-50"
                      disabled={busyId === entry.id}
                    >
                      Return to stock
                    </button>
                  )}
                  {(entry.status === 'BACK_TO_NORMAL_STOCK' || entry.status === 'NON_REPAIRABLE') && (
                    <span className="text-ink/30">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-ink/40">
                  No damage entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report damage">
        <form onSubmit={handleReportSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <Select
                value={reportForm.locationId}
                onChange={(e) => setReportForm({ ...reportForm, locationId: e.target.value })}
                required
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Saree type">
              <Select
                value={reportForm.sareeTypeId}
                onChange={(e) => setReportForm({ ...reportForm, sareeTypeId: e.target.value })}
                required
              >
                {sareeTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Weaver (optional, if known)">
            <Select value={reportForm.weaverId} onChange={(e) => setReportForm({ ...reportForm, weaverId: e.target.value })}>
              <option value="">Unknown / not applicable</option>
              {weavers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type of damage">
            <Select
              value={reportForm.damageType}
              onChange={(e) => setReportForm({ ...reportForm, damageType: e.target.value as DamageType })}
              required
            >
              {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((key) => (
                <option key={key} value={key}>
                  {DAMAGE_TYPE_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Repairable? (optional, can decide later)">
            <Select
              value={reportForm.repairable}
              onChange={(e) => setReportForm({ ...reportForm, repairable: e.target.value as 'YES' | 'NO' | '' })}
            >
              <option value="">Not sure yet</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </Select>
          </Field>
          <Field label="Description (optional)">
            <TextArea
              rows={2}
              value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
            />
          </Field>
          <Field label="Photos (optional)">
            <input
              ref={reportFileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setReportFiles(e.target.files)}
              className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>
          <p className="text-xs text-ink/50">Moves 1 saree of this type at this location from normal to damaged stock.</p>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setReportOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busyId === 'report'}>
              {busyId === 'report' ? 'Saving…' : 'Record damage'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={!!sendRepairFor} onClose={() => setSendRepairFor(null)} title={`Send ${sendRepairFor?.damageNumber ?? ''} for repair`}>
        <form onSubmit={handleSendRepairSubmit} className="space-y-3">
          <Field label="Repairer">
            <TextInput value={repairer} onChange={(e) => setRepairer(e.target.value)} required />
          </Field>
          <Field label="Sent-out date">
            <TextInput type="date" value={sentOutDate} onChange={(e) => setSentOutDate(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setSendRepairFor(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busyId === sendRepairFor?.id}>
              {busyId === sendRepairFor?.id ? 'Saving…' : 'Send for repair'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!markRepairedForFor}
        onClose={() => setMarkRepairedFor(null)}
        title={`Mark ${markRepairedForFor?.damageNumber ?? ''} repaired`}
      >
        <form onSubmit={handleMarkRepairedSubmit} className="space-y-3">
          <Field label="Repaired date">
            <TextInput type="date" value={repairedDate} onChange={(e) => setRepairedDate(e.target.value)} required />
          </Field>
          <Field label="Repair amount (optional)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={repairAmount}
              onChange={(e) => setRepairAmount(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton type="button" onClick={() => setMarkRepairedFor(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busyId === markRepairedForFor?.id}>
              {busyId === markRepairedForFor?.id ? 'Saving…' : 'Mark repaired'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={!!photosFor} onClose={() => setPhotosFor(null)} title={`Photos — ${photosFor?.damageNumber ?? ''}`}>
        <div className="space-y-3">
          {photosFor && photosFor.photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photosFor.photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-brand-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Damage photo" className="h-24 w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {photosFor && photosFor.photoUrls.length === 0 && (
            <p className="text-sm text-ink/40">No photos yet.</p>
          )}
          <form onSubmit={handleAddPhotos} className="space-y-3 border-t border-brand-100 pt-3">
            <Field label="Add photos">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
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
    </div>
  );
}
