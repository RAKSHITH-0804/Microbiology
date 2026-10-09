import { Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { z, ZodTypeAny } from 'zod';
import { query, withTransaction } from '../../config/db';
import { requireSuperAdmin } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { writeAuditLog } from '../../utils/audit';

const required = (label: string, max: number) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

interface MasterEntity {
  path: string;
  table: string;
  label: string;
  /** Editable data columns, in display order. */
  columns: string[];
  /** Columns that together must be unique (compared case-insensitively). */
  uniqueColumns: string[];
  orderBy: string;
  fields: Record<string, ZodTypeAny>;
}

export const MASTER_ENTITIES: MasterEntity[] = [
  {
    path: 'organisms',
    table: 'master_organisms',
    label: 'Organism',
    columns: ['category', 'organism_name'],
    uniqueColumns: ['category', 'organism_name'],
    orderBy: 'category, organism_name',
    fields: { category: required('Category', 100), organism_name: required('Organism name', 200) },
  },
  {
    path: 'antibiotics',
    table: 'master_antibiotics',
    label: 'Antibiotic',
    columns: ['antibiotic_name', 'short_code'],
    uniqueColumns: ['antibiotic_name'],
    orderBy: 'antibiotic_name',
    fields: { antibiotic_name: required('Antibiotic name', 150), short_code: optional(20) },
  },
  {
    path: 'samples',
    table: 'master_samples',
    label: 'Sample type',
    columns: ['sample_name'],
    uniqueColumns: ['sample_name'],
    orderBy: 'sample_name',
    fields: { sample_name: required('Sample name', 150) },
  },
  {
    path: 'templates',
    table: 'master_test_templates',
    label: 'Finding template',
    columns: ['test_name', 'finding_text'],
    uniqueColumns: ['test_name', 'finding_text'],
    orderBy: 'test_name, id',
    fields: { test_name: required('Test name', 200), finding_text: required('Finding text', 2000) },
  },
];

const idParams = z.object({ id: z.coerce.number().int().positive('Invalid id') });
const listQuery = z.object({ include_inactive: z.enum(['true', 'false']).optional() });

async function assertUnique(
  client: PoolClient,
  entity: MasterEntity,
  values: Record<string, unknown>,
  excludeId?: number,
) {
  const conditions = entity.uniqueColumns.map((c, i) => `LOWER(COALESCE(${c}, '')) = LOWER(COALESCE($${i + 1}::text, ''))`);
  const params: unknown[] = entity.uniqueColumns.map((c) => values[c] ?? null);
  if (excludeId) {
    conditions.push(`id <> $${params.length + 1}`);
    params.push(excludeId);
  }
  const { rows } = await client.query<{ is_active: boolean }>(
    `SELECT is_active FROM ${entity.table} WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params,
  );
  if (rows[0]) {
    const field = entity.uniqueColumns[entity.uniqueColumns.length - 1];
    const hint = rows[0].is_active ? 'already exists' : 'already exists (deactivated - restore it instead)';
    throw new AppError(409, `${entity.label} ${hint}`, { [field]: [`${entity.label} ${hint}`] });
  }
}

/** Registers list / create / update / soft-delete routes for every master table on the router. */
export function registerMasterCrud(router: Router) {
  for (const entity of MASTER_ENTITIES) {
    const createSchema = z.object(entity.fields);
    const updateSchema = z.object({ ...entity.fields, is_active: z.boolean().optional() });
    const select = `SELECT id, ${entity.columns.join(', ')}, is_active, created_at, updated_at FROM ${entity.table}`;

    router.get(
      `/${entity.path}`,
      validate({ query: listQuery }),
      asyncHandler(async (req: Request, res: Response) => {
        const includeInactive = req.query.include_inactive === 'true';
        if (includeInactive && req.user!.role !== 'SUPER_ADMIN') throw new AppError(403, 'Only the Super Admin can view deactivated entries');
        const { rows } = await query(`${select} ${includeInactive ? '' : 'WHERE is_active'} ORDER BY ${entity.orderBy}`);
        res.json({ success: true, data: rows });
      }),
    );

    router.post(
      `/${entity.path}`,
      requireSuperAdmin,
      validate({ body: createSchema }),
      asyncHandler(async (req: Request, res: Response) => {
        const values = req.body as Record<string, unknown>;
        const row = await withTransaction(async (client) => {
          await assertUnique(client, entity, values);
          const { rows } = await client.query(
            `INSERT INTO ${entity.table} (${entity.columns.join(', ')})
             VALUES (${entity.columns.map((_, i) => `$${i + 1}`).join(', ')})
             RETURNING id, ${entity.columns.join(', ')}, is_active, created_at, updated_at`,
            entity.columns.map((c) => values[c] ?? null),
          );
          await writeAuditLog(
            { userId: req.user!.sub, action: 'CREATE', entityName: entity.table, entityId: rows[0].id, details: values },
            client,
          );
          return rows[0];
        });
        res.status(201).json({ success: true, message: `${entity.label} added`, data: row });
      }),
    );

    router.put(
      `/${entity.path}/:id`,
      requireSuperAdmin,
      validate({ params: idParams, body: updateSchema }),
      asyncHandler(async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const { is_active, ...values } = req.body as Record<string, unknown> & { is_active?: boolean };
        const row = await withTransaction(async (client) => {
          const existing = await client.query<Record<string, unknown>>(`${select} WHERE id = $1 FOR UPDATE`, [id]);
          const before = existing.rows[0];
          if (!before) throw new AppError(404, `${entity.label} not found`);
          await assertUnique(client, entity, values, id);

          const nextActive = is_active ?? (before.is_active as boolean);
          const { rows } = await client.query(
            `UPDATE ${entity.table}
             SET ${entity.columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}, is_active = $${entity.columns.length + 2}
             WHERE id = $1
             RETURNING id, ${entity.columns.join(', ')}, is_active, created_at, updated_at`,
            [id, ...entity.columns.map((c) => values[c] ?? null), nextActive],
          );

          const changes = Object.fromEntries(
            [...entity.columns, 'is_active']
              .filter((c) => (before[c] ?? null) !== (rows[0][c] ?? null))
              .map((c) => [c, { from: before[c] ?? null, to: rows[0][c] ?? null }]),
          );
          if (Object.keys(changes).length) {
            const action = changes.is_active ? (nextActive ? 'RESTORE' : 'DEACTIVATE') : 'UPDATE';
            await writeAuditLog(
              { userId: req.user!.sub, action, entityName: entity.table, entityId: id, details: { changes } },
              client,
            );
          }
          return rows[0];
        });
        res.json({ success: true, message: `${entity.label} updated`, data: row });
      }),
    );

    router.delete(
      `/${entity.path}/:id`,
      requireSuperAdmin,
      validate({ params: idParams }),
      asyncHandler(async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const row = await withTransaction(async (client) => {
          const { rows } = await client.query(
            `UPDATE ${entity.table} SET is_active = FALSE WHERE id = $1
             RETURNING id, ${entity.columns.join(', ')}, is_active, created_at, updated_at`,
            [id],
          );
          if (!rows[0]) throw new AppError(404, `${entity.label} not found`);
          await writeAuditLog(
            {
              userId: req.user!.sub,
              action: 'DEACTIVATE',
              entityName: entity.table,
              entityId: id,
              details: Object.fromEntries(entity.columns.map((c) => [c, rows[0][c]])),
            },
            client,
          );
          return rows[0];
        });
        res.json({ success: true, message: `${entity.label} deactivated`, data: row });
      }),
    );
  }
}
