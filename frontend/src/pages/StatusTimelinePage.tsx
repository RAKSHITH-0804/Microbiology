import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Inbox, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { StatusPill } from '@/components/reports/StatusPill';
import {
  SampleProgressBar,
  SampleTimelineBody,
  useRequisitionTimeline,
} from '@/components/requisitions/SampleStatusDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { searchRequisitionStatus } from '@/features/requisitions/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StatusSearchResult } from '@/types/requisition';

const SEARCH_DEBOUNCE_MS = 300;

export default function StatusTimelinePage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [term, setTerm] = useState(search.trim());
  const [results, setResults] = useState<StatusSearchResult[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const idParam = Number(params.get('id'));
  const selectedId = Number.isInteger(idParam) && idParam > 0 ? idParam : null;
  const { timeline, error: timelineError, reload } = useRequisitionTimeline(selectedId);

  const setParam = (key: 'q' | 'id', value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setParam('q', term || null);
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    searchRequisitionStatus(term)
      .then((rows) => {
        if (cancelled) return;
        setResults(rows);
        // A search that pins down one sample opens it straight away.
        if (term && rows.length === 1) setParam('id', String(rows[0].id));
      })
      .catch((err) => !cancelled && setSearchError(getErrorMessage(err, 'Search failed')))
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [term, attempt]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Sample Tracking</p>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Activity className="h-5 w-5 text-primary" /> Status Timeline
        </h2>
        <p className="text-sm text-muted-foreground">
          Follow a sample from receipt through billing, result entry and verification.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Lab No, Receipt No or Patient Name"
          aria-label="Search samples"
          className="h-12 rounded-xl pl-12 pr-12 text-base shadow-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{term ? 'Search Results' : 'Recent Samples'}</CardTitle>
              <CardDescription>
                {results === null
                  ? 'Loading...'
                  : term
                    ? `${results.length} match(es)${results.length === 25 ? ' - showing the latest 25' : ''}`
                    : 'The 25 most recently received samples'}
              </CardDescription>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setAttempt((n) => n + 1)} disabled={searching} aria-label="Refresh">
              <RefreshCw className={searching ? 'animate-spin' : undefined} />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {searchError && (
              <p className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{searchError}</p>
            )}
            {results === null && !searchError && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...
              </div>
            )}
            {results?.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                {term ? 'No samples match this search.' : 'No samples registered yet.'}
              </div>
            )}
            <ul className={cn('max-h-[60vh] divide-y overflow-y-auto border-t', searching && results && 'opacity-60')}>
              {results?.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setParam('id', String(r.id))}
                    aria-current={r.id === selectedId}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50',
                      r.id === selectedId && 'bg-blue-50 hover:bg-blue-50',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">{r.lab_no}</span>
                      <StatusPill status={r.status} />
                    </span>
                    <span className="truncate text-sm font-medium text-slate-700">{r.patient_name}</span>
                    <span className="text-xs text-slate-500">
                      {r.receipt_no ? `Receipt ${r.receipt_no} - ` : ''}
                      {formatDateTime(r.sample_received_datetime)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          {selectedId === null ? (
            <CardContent className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
              <Activity className="h-10 w-10 text-slate-300" />
              Search for a sample and select it to see where it is in its lifecycle.
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b pb-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <span className="font-mono">{timeline?.lab_no ?? '...'}</span>
                    {timeline && <StatusPill status={timeline.status} />}
                  </CardTitle>
                  <CardDescription>{timeline ? timeline.patient_name : 'Loading sample...'}</CardDescription>
                </div>
                {timeline && <PaymentStatusBadge status={timeline.payment_status} />}
              </CardHeader>
              <CardContent className="space-y-6 pt-5">
                {timeline && <SampleProgressBar timeline={timeline} />}
                <div className={cn(timeline && 'border-t pt-5')}>
                  <SampleTimelineBody timeline={timeline} error={timelineError} onRetry={reload} />
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
