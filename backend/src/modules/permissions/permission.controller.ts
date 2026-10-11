import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { UserRole } from '../../utils/jwt';
import { isRestrictable, MODULE_KEYS, MODULE_OVERRIDES_SQL, ModuleKey, resolveModules, ROLE_MODULES } from './permission.modules';
import { BulkPermissionInput, UpdatePermissionInput } from './permission.schema';

interface MatrixUserRow {
  id: number;
  username: string;
  role: UserRole;
  name: string | null;
  designation: string | null;
  staff_type: string | null;
  enabled_modules: string[];
  disabled_modules: string[];
}

type ModuleState = {
  /** The switch can be changed for this user (every module, except on Super Admin accounts). */
  allowed: boolean;
  enabled: boolean;
  /** Part of the role's default set; when false and enabled, the module is an explicit grant. */
  role_default: boolean;
};

function toMatrixUser(u: MatrixUserRow) {
  const defaults = ROLE_MODULES[u.role] ?? [];
  const restrictable = isRestrictable(u.role);
  const { modules } = resolveModules(u.role, u.enabled_modules, u.disabled_modules);
  const permissions = Object.fromEntries(
    MODULE_KEYS.map((key): [ModuleKey, ModuleState] => [
      key,
      { allowed: restrictable, enabled: modules.includes(key), role_default: defaults.includes(key) },
    ]),
  );
  return {
    id: u.id,
    username: u.username,
    name: u.name ?? u.username,
    designation: u.designation,
    staff_type: u.staff_type,
    role: u.role,
    restrictable,
    permissions,
  };
}

const MATRIX_SELECT = `
  SELECT u.id, u.username, u.role, u.is_active, s.name, s.designation, s.staff_type, ${MODULE_OVERRIDES_SQL('u.id')}
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

export async function getPermissionMatrix(_req: Request, res: Response) {
  const { rows } = await query<MatrixUserRow>(`${MATRIX_SELECT} WHERE u.is_active ORDER BY u.role, LOWER(COALESCE(s.name, u.username))`);
  res.json({ success: true, data: { modules: MODULE_KEYS, users: rows.map(toMatrixUser) } });
}

/**
 * Sets `modules` on or off for one user and returns the keys that actually changed. Only differences from the
 * role default are stored, so a switch put back to its default leaves no row behind.
 */
async function applyModules(client: PoolClient, user: MatrixUserRow, modules: readonly ModuleKey[], enabled: boolean) {
  const defaults = ROLE_MODULES[user.role];
  const current = resolveModules(user.role, user.enabled_modules, user.disabled_modules).modules;
  const changed = modules.filter((m) => current.includes(m) !== enabled);
  for (const m of changed) {
    if (defaults.includes(m) === enabled) {
      await client.query('DELETE FROM user_permissions WHERE user_id = $1 AND module_key = $2', [user.id, m]);
    } else {
      await client.query(
        `INSERT INTO user_permissions (user_id, module_key, is_enabled) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, module_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
        [user.id, m, enabled],
      );
    }
  }
  return changed;
}

async function lockUser(client: PoolClient, userId: number): Promise<MatrixUserRow> {
  const { rows } = await client.query<MatrixUserRow & { is_active: boolean }>(
    `${MATRIX_SELECT} WHERE u.id = $1 FOR UPDATE OF u`,
    [userId],
  );
  const u = rows[0];
  if (!u || !u.is_active) throw new AppError(404, 'User not found');
  if (!isRestrictable(u.role)) throw new AppError(400, 'Super Admin access cannot be changed');
  return u;
}

async function reloadUser(client: PoolClient, userId: number) {
  const { rows } = await client.query<MatrixUserRow>(`${MATRIX_SELECT} WHERE u.id = $1`, [userId]);
  return toMatrixUser(rows[0]);
}

export async function updatePermission(req: Request, res: Response) {
  const userId = Number(req.params.userId);
  const { module_key, is_enabled } = req.body as UpdatePermissionInput;

  const user = await withTransaction(async (client) => {
    const u = await lockUser(client, userId);
    const changed = await applyModules(client, u, [module_key], is_enabled);
    if (changed.length) {
      await writeAuditLog(
        {
          userId: req.user!.sub,
          action: 'PERMISSION_UPDATE',
          entityName: 'users',
          entityId: userId,
          details: { username: u.username, module_key, from: !is_enabled, to: is_enabled },
        },
        client,
      );
    }
    return reloadUser(client, userId);
  });

  res.json({
    success: true,
    message: `${user.name}: ${module_key.replace(/_/g, ' ')} ${is_enabled ? 'enabled' : 'disabled'}`,
    data: user,
  });
}

/** "Grant All" / "Revoke All" for one account. */
export async function setAllPermissions(req: Request, res: Response) {
  const userId = Number(req.params.userId);
  const { is_enabled } = req.body as BulkPermissionInput;

  const { user, changed } = await withTransaction(async (client) => {
    const u = await lockUser(client, userId);
    const changedKeys = await applyModules(client, u, MODULE_KEYS, is_enabled);
    if (changedKeys.length) {
      await writeAuditLog(
        {
          userId: req.user!.sub,
          action: 'PERMISSION_BULK_UPDATE',
          entityName: 'users',
          entityId: userId,
          details: { username: u.username, [is_enabled ? 'granted' : 'revoked']: changedKeys },
        },
        client,
      );
    }
    return { user: await reloadUser(client, userId), changed: changedKeys.length };
  });

  const verb = is_enabled ? 'granted' : 'revoked';
  res.json({
    success: true,
    message: changed ? `${user.name}: all modules ${verb}` : `${user.name} already had every module ${verb}`,
    data: user,
  });
}

/** "Grant All to Everyone": every active staff account (Super Admins excluded) gets every module. */
export async function setAllPermissionsForEveryone(req: Request, res: Response) {
  const { is_enabled } = req.body as BulkPermissionInput;

  const updatedUsers = await withTransaction(async (client) => {
    const { rows } = await client.query<MatrixUserRow>(
      `${MATRIX_SELECT} WHERE u.is_active AND u.role <> 'SUPER_ADMIN' ORDER BY u.id FOR UPDATE OF u`,
    );
    let count = 0;
    for (const u of rows) {
      const changedKeys = await applyModules(client, u, MODULE_KEYS, is_enabled);
      if (!changedKeys.length) continue;
      count += 1;
      await writeAuditLog(
        {
          userId: req.user!.sub,
          action: 'PERMISSION_BULK_UPDATE',
          entityName: 'users',
          entityId: u.id,
          details: { username: u.username, [is_enabled ? 'granted' : 'revoked']: changedKeys, scope: 'all_users' },
        },
        client,
      );
    }
    return count;
  });

  const { rows } = await query<MatrixUserRow>(`${MATRIX_SELECT} WHERE u.is_active ORDER BY u.role, LOWER(COALESCE(s.name, u.username))`);
  res.json({
    success: true,
    message: updatedUsers
      ? `All modules ${is_enabled ? 'granted' : 'revoked'} for ${updatedUsers} account(s)`
      : 'No changes: every account already had this access',
    data: { modules: MODULE_KEYS, users: rows.map(toMatrixUser) },
  });
}
