import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/db';
import { DISABLED_MODULES_SQL } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { UserRole } from '../../utils/jwt';
import { isRestrictable, MODULE_KEYS, ModuleKey, ROLE_MODULES } from './permission.modules';
import { UpdatePermissionInput } from './permission.schema';

interface MatrixUserRow {
  id: number;
  username: string;
  role: UserRole;
  name: string | null;
  designation: string | null;
  staff_type: string | null;
  disabled_modules: string[];
}

type ModuleState = { allowed: boolean; enabled: boolean };

function toMatrixUser(u: MatrixUserRow) {
  const allowed = ROLE_MODULES[u.role] ?? [];
  const permissions = Object.fromEntries(
    MODULE_KEYS.map((key): [ModuleKey, ModuleState] => {
      const roleHas = allowed.includes(key);
      return [key, { allowed: roleHas, enabled: roleHas && !u.disabled_modules.includes(key) }];
    }),
  );
  return {
    id: u.id,
    username: u.username,
    name: u.name ?? u.username,
    designation: u.designation,
    staff_type: u.staff_type,
    role: u.role,
    restrictable: isRestrictable(u.role),
    permissions,
  };
}

const MATRIX_SELECT = `
  SELECT u.id, u.username, u.role, s.name, s.designation, s.staff_type, ${DISABLED_MODULES_SQL('u.id')}
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

export async function getPermissionMatrix(_req: Request, res: Response) {
  const { rows } = await query<MatrixUserRow>(`${MATRIX_SELECT} WHERE u.is_active ORDER BY u.role, LOWER(COALESCE(s.name, u.username))`);
  res.json({ success: true, data: { modules: MODULE_KEYS, users: rows.map(toMatrixUser) } });
}

export async function updatePermission(req: Request, res: Response) {
  const userId = Number(req.params.userId);
  const { module_key, is_enabled } = req.body as UpdatePermissionInput;

  const user = await withTransaction(async (client) => {
    const target = await client.query<{ username: string; role: UserRole; is_active: boolean }>(
      'SELECT username, role, is_active FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const u = target.rows[0];
    if (!u) throw new AppError(404, 'User not found');
    if (!isRestrictable(u.role)) throw new AppError(400, 'Super Admin access cannot be restricted');
    if (!ROLE_MODULES[u.role].includes(module_key)) {
      throw new AppError(400, `The ${u.role} role has no access to this module`, { module_key: ['Not available for this role'] });
    }

    const previous = await client.query<{ is_enabled: boolean }>(
      'SELECT is_enabled FROM user_permissions WHERE user_id = $1 AND module_key = $2',
      [userId, module_key],
    );
    const wasEnabled = previous.rows[0]?.is_enabled ?? true;

    await client.query(
      `INSERT INTO user_permissions (user_id, module_key, is_enabled) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, module_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
      [userId, module_key, is_enabled],
    );
    if (wasEnabled !== is_enabled) {
      await writeAuditLog(
        {
          userId: req.user!.sub,
          action: 'PERMISSION_UPDATE',
          entityName: 'users',
          entityId: userId,
          details: { username: u.username, module_key, from: wasEnabled, to: is_enabled },
        },
        client,
      );
    }

    const updated = await client.query<MatrixUserRow>(`${MATRIX_SELECT} WHERE u.id = $1`, [userId]);
    return toMatrixUser(updated.rows[0]);
  });

  res.json({
    success: true,
    message: `${user.name}: ${module_key.replace(/_/g, ' ')} ${is_enabled ? 'enabled' : 'disabled'}`,
    data: user,
  });
}
