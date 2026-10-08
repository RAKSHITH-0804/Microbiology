import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchSettings } from '@/features/settings/api';
import type { PrintOptions, SystemSettings } from '@/types/settings';

/** Matches the database defaults so printouts look right even before the settings load. */
export const DEFAULT_SETTINGS: SystemSettings = {
  letterhead_line1: 'Bapuji Educational Association ®',
  letterhead_line2: 'DEPARTMENT OF MICROBIOLOGY',
  letterhead_line3: 'J.J.M. MEDICAL COLLEGE, DAVANGERE – 4',
  lab_no_prefix: 'LAB-YYYY-',
  print_defaults: { auto_print_after_save: false, show_end_of_report: true },
  last_updated: null,
};

const resolveLabNoPrefix = (prefix: string, date = new Date()) =>
  prefix.replace(/YYYY/g, String(date.getFullYear()));

interface SettingsContextValue {
  settings: SystemSettings;
  /** Lab number prefix with the year filled in, e.g. "LAB-2026-". */
  labNoPrefix: string;
  /** This user's print choices on this browser, falling back to the department defaults. */
  printPrefs: PrintOptions;
  setPrintPref: <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => void;
  resetPrintPrefs: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const prefsKey = (userId: number) => `jjm-micro:print-prefs:${userId}`;

function readPrefs(userId: number | undefined): Partial<PrintOptions> {
  if (userId === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(prefsKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<PrintOptions> = {};
    for (const key of ['auto_print_after_save', 'show_end_of_report'] as const) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [overrides, setOverrides] = useState<Partial<PrintOptions>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {
        // Keep the defaults; the page that needs fresh values shows its own error.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => setOverrides(readPrefs(user?.id)), [user?.id]);

  const setPrintPref = useCallback(
    <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
      setOverrides((current) => {
        const next = { ...current, [key]: value };
        if (user) localStorage.setItem(prefsKey(user.id), JSON.stringify(next));
        return next;
      });
    },
    [user],
  );

  const resetPrintPrefs = useCallback(() => {
    if (user) localStorage.removeItem(prefsKey(user.id));
    setOverrides({});
  }, [user]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      labNoPrefix: resolveLabNoPrefix(settings.lab_no_prefix),
      printPrefs: { ...settings.print_defaults, ...overrides },
      setPrintPref,
      resetPrintPrefs,
    }),
    [settings, overrides, setPrintPref, resetPrintPrefs],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
