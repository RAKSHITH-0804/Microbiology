import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Ban, Inbox, Loader2, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/FormField';
import { createMasterRow, deactivateMasterRow, fetchMasterRows, fieldErrors, updateMasterRow } from '@/features/admin/api';
import { getErrorMessage } from '@/lib/api';
import type { MasterEntityKey, MasterRow } from '@/types/admin';

interface ColumnConfig {
  name: string;
  label: string;
  max: number;
  required: boolean;
  multiline?: boolean;
  /** Offer existing values of this column as suggestions. */
  suggest?: boolean;
  hint?: string;
}

interface EntityConfig {
  key: MasterEntityKey;
  label: string;
  singular: string;
  columns: ColumnConfig[];
}

const ENTITIES: EntityConfig[] = [
  {
    key: 'organisms',
    label: 'Organisms',
    singular: 'Organism',
    columns: [
      { name: 'category', label: 'Category', max: 100, required: true, suggest: true },
      { name: 'organism_name', label: 'Organism Name', max: 200, required: true },
    ],
  },
  {
    key: 'antibiotics',
    label: 'Antibiotics',
    singular: 'Antibiotic',
    columns: [
      { name: 'antibiotic_name', label: 'Antibiotic Name', max: 150, required: true },
      { name: 'short_code', label: 'Short Code', max: 20, required: false, hint: 'Optional, e.g. AK' },
    ],
  },
  {
    key: 'samples',
    label: 'Samples',
    singular: 'Sample Type',
    columns: [{ name: 'sample_name', label: 'Sample Name', max: 150, required: true }],
  },
  {
    key: 'templates',
    label: 'Finding Templates',
    singular: 'Finding Template',
    columns: [
      { name: 'test_name', label: 'Test Name', max: 200, required: true, suggest: true, hint: 'Phrases appear on reports for tests linked to this name' },
      { name: 'finding_text', label: 'Finding Text', max: 2000, required: true, multiline: true },
    ],
  },
];

type RowsByEntity = Record<MasterEntityKey, MasterRow[]>;
const EMPTY_ROWS: RowsByEntity = { organisms: [], antibiotics: [], samples: [], templates: [] };

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function EntryDialog({
  entity,
  row,
  rows,
  open,
  onOpenChange,
  onSaved,
}: {
  entity: EntityConfig;
  row: MasterRow | null;
  rows: MasterRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: MasterRow) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(entity.columns.map((c) => [c.name, row ? text(row[c.name]) : ''])));
    setErrors({});
  }, [open, row, entity]);

  const suggestions = useMemo(
    () =>
      Object.fromEntries(
        entity.columns
          .filter((c) => c.suggest)
          .map((c) => [c.name, [...new Set(rows.map((r) => text(r[c.name])).filter(Boolean))].sort()]),
      ),
    [rows, entity],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const c of entity.columns) {
      const v = (values[c.name] ?? '').trim();
      if (c.required && !v) nextErrors[c.name] = `${c.label} is required`;
      else if (v.length > c.max) nextErrors[c.name] = `${c.label} must be at most ${c.max} characters`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = Object.fromEntries(entity.columns.map((c) => [c.name, (values[c.name] ?? '').trim() || null]));
    setSaving(true);
    try {
      const saved = row ? await updateMasterRow(entity.key, row.id, payload) : await createMasterRow(entity.key, payload);
      toast.success(`${entity.singular} ${row ? 'updated' : 'added'}`);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(getErrorMessage(err, `Could not save the ${entity.singular.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className={entity.columns.some((c) => c.multiline) ? 'max-w-2xl' : undefined}>
        <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{row ? `Edit ${entity.singular}` : `Add ${entity.singular}`}</DialogTitle>
            <DialogDescription>
              {row
                ? 'Changes apply to new reports. Reports already saved keep the text they were saved with.'
                : `The new ${entity.singular.toLowerCase()} becomes available on the report screens immediately.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {entity.columns.map((c, i) => {
              const id = `master_${c.name}`;
              const listId = c.suggest ? `${id}_options` : undefined;
              return (
                <FormField key={c.name} label={c.label} htmlFor={id} required={c.required} error={errors[c.name]} hint={c.hint}>
                  {c.multiline ? (
                    <Textarea
                      id={id}
                      rows={5}
                      value={values[c.name] ?? ''}
                      aria-invalid={!!errors[c.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    />
                  ) : (
                    <>
                      <Input
                        id={id}
                        autoFocus={i === 0}
                        autoComplete="off"
                        list={listId}
                        value={values[c.name] ?? ''}
                        aria-invalid={!!errors[c.name]}
                        onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                      />
                      {listId && (
                        <datalist id={listId}>
                          {suggestions[c.name]?.map((s) => <option key={s} value={s} />)}
                        </datalist>
                      )}
                    </>
                  )}
                </FormField>
              );
            })}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? 'Saving...' : row ? 'Save Changes' : `Add ${entity.singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntityTable({
  entity,
  rows,
  onEdit,
  onSetActive,
  busyId,
}: {
  entity: EntityConfig;
  rows: MasterRow[];
  onEdit: (row: MasterRow) => void;
  onSetActive: (row: MasterRow, active: boolean) => void;
  busyId: number | null;
}) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const term = search.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (showInactive || r.is_active) &&
      (!term || entity.columns.some((c) => text(r[c.name]).toLowerCase().includes(term))),
  );
  const inactiveCount = rows.filter((r) => !r.is_active).length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${entity.label.toLowerCase()}...`}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id={`inactive_${entity.key}`} checked={showInactive} onCheckedChange={(c) => setShowInactive(c === true)} />
            <Label htmlFor={`inactive_${entity.key}`} className="cursor-pointer font-normal">
              Show deactivated ({inactiveCount})
            </Label>
          </div>
          <span className="text-sm text-muted-foreground">{visible.length} shown</span>
        </div>
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_theme(colors.slate.200)]">
                <th className="w-14 px-4 py-2.5">#</th>
                {entity.columns.map((c) => (
                  <th key={c.name} className="px-4 py-2.5">{c.label}</th>
                ))}
                <th className="w-28 px-4 py-2.5">Status</th>
                <th className="w-48 px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={entity.columns.length + 3} className="px-4 py-12 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    {term ? 'No entries match your search.' : 'No entries yet.'}
                  </td>
                </tr>
              )}
              {visible.map((r, i) => (
                <tr key={r.id} className={r.is_active ? 'hover:bg-slate-50/70' : 'bg-slate-50/60 text-slate-500'}>
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  {entity.columns.map((c) => (
                    <td key={c.name} className="px-4 py-2 align-top">
                      <span className={c.multiline ? 'line-clamp-2' : undefined} title={c.multiline ? text(r[c.name]) : undefined}>
                        {text(r[c.name]) || <span className="text-slate-400">-</span>}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    {r.is_active ? <Badge tone="emerald">Active</Badge> : <Badge tone="slate">Deactivated</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => onEdit(r)} disabled={busyId === r.id}>
                        <Pencil /> Edit
                      </Button>
                      {r.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => onSetActive(r, false)}
                          disabled={busyId === r.id}
                        >
                          <Ban /> Deactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => onSetActive(r, true)} disabled={busyId === r.id}>
                          <ArchiveRestore /> Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MasterDataPage() {
  const [rows, setRows] = useState<RowsByEntity>(EMPTY_ROWS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MasterEntityKey>('organisms');
  const [editing, setEditing] = useState<{ row: MasterRow | null } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(ENTITIES.map((e) => fetchMasterRows(e.key)));
      setRows(Object.fromEntries(ENTITIES.map((e, i) => [e.key, lists[i]])) as RowsByEntity);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load master data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entity = ENTITIES.find((e) => e.key === tab)!;

  const upsertRow = (key: MasterEntityKey, saved: MasterRow) =>
    setRows((current) => {
      const list = current[key];
      const exists = list.some((r) => r.id === saved.id);
      return { ...current, [key]: exists ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list] };
    });

  const setActive = async (key: MasterEntityKey, row: MasterRow, active: boolean) => {
    const config = ENTITIES.find((e) => e.key === key)!;
    const name = text(row[config.columns[config.columns.length - 1].name]);
    setBusyId(row.id);
    try {
      const saved = active
        ? await updateMasterRow(key, row.id, {
            ...Object.fromEntries(config.columns.map((c) => [c.name, (row[c.name] as string | null) ?? null])),
            is_active: true,
          })
        : await deactivateMasterRow(key, row.id);
      upsertRow(key, saved);
      toast.success(`${config.singular} ${active ? 'restored' : 'deactivated'}`, {
        description: name.length > 60 ? `${name.slice(0, 60)}...` : name,
        action: active ? undefined : { label: 'Undo', onClick: () => setActive(key, saved, true) },
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the status'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Administration</p>
          <h2 className="text-xl font-semibold text-foreground">Master Data Management</h2>
          <p className="text-sm text-muted-foreground">
            Deactivated entries disappear from the report screens but stay on reports already saved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
          </Button>
          <Button onClick={() => setEditing({ row: null })} disabled={loading}>
            <Plus /> Add {entity.singular}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as MasterEntityKey)}>
        <TabsList>
          {ENTITIES.map((e) => (
            <TabsTrigger key={e.key} value={e.key}>
              {e.label}
              <span className="rounded-full bg-slate-200/80 px-1.5 text-xs font-semibold text-slate-600">
                {loading ? '...' : rows[e.key].filter((r) => r.is_active).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {ENTITIES.map((e) => (
          <TabsContent key={e.key} value={e.key}>
            {loading && rows[e.key].length === 0 ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading {e.label.toLowerCase()}...
              </div>
            ) : (
              <EntityTable
                entity={e}
                rows={rows[e.key]}
                busyId={busyId}
                onEdit={(row) => setEditing({ row })}
                onSetActive={(row, active) => setActive(e.key, row, active)}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <EntryDialog
        entity={entity}
        row={editing?.row ?? null}
        rows={rows[entity.key]}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(saved) => upsertRow(entity.key, saved)}
      />
    </div>
  );
}
