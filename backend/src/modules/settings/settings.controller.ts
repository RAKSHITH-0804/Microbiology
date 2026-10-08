import os from 'os';
import { Request, Response } from 'express';
import { pool, query, withTransaction } from '../../config/db';
import { env } from '../../config/env';
import { writeAuditLog } from '../../utils/audit';
import { SystemSettings, UpdateSettingsInput } from './settings.schema';

/** Fallback for any key missing from system_settings. */
const DEFAULT_SETTINGS: SystemSettings = {
  letterhead_line1: 'Bapuji Educational Association ®',
  letterhead_line2: 'DEPARTMENT OF MICROBIOLOGY',
  letterhead_line3: 'J.J.M. MEDICAL COLLEGE, DAVANGERE – 4',
  lab_no_prefix: 'LAB-YYYY-',
  print_defaults: { auto_print_after_save: false, show_end_of_report: true },
};

type SettingKey = keyof SystemSettings;
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

async function loadSettings() {
  const { rows } = await query<{ key: string; value: unknown; updated_at: Date; updated_by_name: string | null }>(
    `SELECT ss.key, ss.value, ss.updated_at, COALESCE(st.name, u.username) AS updated_by_name
     FROM system_settings ss
     LEFT JOIN users u ON u.id = ss.updated_by
     LEFT JOIN master_staff st ON st.id = u.staff_id
     WHERE ss.key = ANY($1)`,
    [SETTING_KEYS],
  );

  const settings: SystemSettings = structuredClone(DEFAULT_SETTINGS);
  let lastUpdated: { at: Date; by: string | null } | null = null;
  for (const row of rows) {
    const key = row.key as SettingKey;
    settings[key] = (key === 'print_defaults' ? { ...DEFAULT_SETTINGS.print_defaults, ...(row.value as object) } : row.value) as never;
    if (row.updated_by_name && (!lastUpdated || row.updated_at > lastUpdated.at)) {
      lastUpdated = { at: row.updated_at, by: row.updated_by_name };
    }
  }
  return { settings, lastUpdated };
}

export async function getSettings(_req: Request, res: Response) {
  const { settings, lastUpdated } = await loadSettings();
  res.json({ success: true, data: { ...settings, last_updated: lastUpdated } });
}

export async function updateSettings(req: Request, res: Response) {
  const input = req.body as UpdateSettingsInput;
  const { settings: current } = await loadSettings();

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(input) as SettingKey[]) {
    const next = key === 'print_defaults' ? { ...current.print_defaults, ...input.print_defaults } : input[key];
    if (JSON.stringify(next) !== JSON.stringify(current[key])) changes[key] = { from: current[key], to: next };
  }

  if (Object.keys(changes).length > 0) {
    await withTransaction(async (client) => {
      for (const [key, { to }] of Object.entries(changes)) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [key, JSON.stringify(to), req.user!.sub],
        );
      }
      await writeAuditLog(
        { userId: req.user!.sub, action: 'UPDATE', entityName: 'system_settings', details: { changes } },
        client,
      );
    });
  }

  const { settings, lastUpdated } = await loadSettings();
  res.json({
    success: true,
    message: Object.keys(changes).length ? 'Department settings saved' : 'No changes to save',
    data: { ...settings, last_updated: lastUpdated },
  });
}

/** Read-only diagnostics for the HOD: database health, runtime and the addresses other lab PCs can use. */
export async function getSystemInfo(_req: Request, res: Response) {
  let database: Record<string, unknown>;
  const started = Date.now();
  try {
    const { rows } = await pool.query<{ version: string; db: string; size: string }>(
      `SELECT current_setting('server_version') AS version, current_database() AS db,
              pg_size_pretty(pg_database_size(current_database())) AS size`,
    );
    database = {
      status: 'connected',
      latency_ms: Date.now() - started,
      version: rows[0].version,
      name: rows[0].db,
      size: rows[0].size,
      host: `${env.DB_HOST}:${env.DB_PORT}`,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    };
  } catch (err) {
    database = { status: 'unreachable', error: (err as Error).message, host: `${env.DB_HOST}:${env.DB_PORT}` };
  }

  const lanAddresses = Object.entries(os.networkInterfaces()).flatMap(([name, addrs]) =>
    (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ interface: name, address: a.address })),
  );

  res.json({
    success: true,
    data: {
      database,
      server: {
        environment: env.NODE_ENV,
        node_version: process.version,
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        uptime_seconds: Math.round(process.uptime()),
        api_port: env.PORT,
        server_time: new Date().toISOString(),
      },
      network: { lan_addresses: lanAddresses },
    },
  });
}
