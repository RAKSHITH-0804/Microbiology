import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { resolveNotifications } from '../notifications/notification.service';
import { CreateUserInput, DEFAULT_STAFF_PASSWORD, ResetPasswordInput, UserStatusInput } from './user.schema';

const BCRYPT_ROUNDS = 10;

/** True when the account registered requisitions or its staff member prepared, reported or verified any report. */
const HAS_CLINICAL_RECORDS = `(
  EXISTS (SELECT 1 FROM requisitions r WHERE r.created_by = u.id)
  OR (u.staff_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM general_reports g WHERE u.staff_id IN (g.prepared_by, g.reported_by, g.verified_by))
    OR EXISTS (SELECT 1 FROM antibiogram_reports a WHERE u.staff_id IN (a.prepared_by, a.reported_by, a.verified_by))
  ))
)`;

const USER_SELECT = `
  SELECT u.id, u.username, u.role, u.is_active, u.staff_id, u.created_at, u.updated_at,
         u.must_change_password, u.password_reset_requested, u.password_reset_requested_at,
         s.name AS staff_name, s.designation, s.staff_type,
         (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'LOGIN') AS last_login_at,
         ${HAS_CLINICAL_RECORDS} AS has_clinical_records
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

export async function listUsers(_req: Request, res: Response) {
  const { rows } = await query(`${USER_SELECT} ORDER BY u.is_active DESC, u.role, LOWER(u.username)`);
  res.json({ success: true, data: rows });
}

export async function createUser(req: Request, res: Response) {
  const input = req.body as CreateUserInput;
  assertCanAssignRole(req, input.role);

  const isNewStaff = input.staff_id === undefined;

  const user = await withTransaction(async (client) => {
    const taken = await client.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [input.username]);
    if (taken.rowCount) throw new AppError(409, 'Username is already taken', { username: ['Username is already taken'] });

    const staffId = isNewStaff ? await insertStaff(client, req.user!.sub, input) : await assertStaffUnlinked(client, input.staff_id!);

    const hash = await bcrypt.hash(input.password ?? DEFAULT_STAFF_PASSWORD, BCRYPT_ROUNDS);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (username, password_hash, role, staff_id, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [input.username, hash, input.role, staffId],
    );
    const id = rows[0].id;

    await writeAuditLog(
      {
        userId: req.user!.sub,
        action: 'CREATE',
        entityName: 'users',
        entityId: id,
        details: {
          username: input.username,
          role: input.role,
          staff_id: staffId,
          new_staff: isNewStaff,
          default_password: input.password === undefined,
        },
      },
      client,
    );

    const created = await client.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return created.rows[0];
  });

  res.status(201).json({
    success: true,
    message: isNewStaff ? 'New staff account created successfully' : `User ${input.username} created`,
    data: user,
  });
}

async function assertStaffUnlinked(client: PoolClient, staffId: number): Promise<number> {
  const { rows } = await client.query<{ username: string | null }>(
    `SELECT (SELECT u.username FROM users u WHERE u.staff_id = s.id LIMIT 1) AS username
     FROM master_staff s WHERE s.id = $1 AND s.is_active`,
    [staffId],
  );
  if (!rows[0]) throw new AppError(400, 'Unknown staff member', { staff_id: ['Select an active staff member'] });
  if (rows[0].username) {
    const message = `This staff member already has the account "${rows[0].username}"`;
    throw new AppError(409, message, { staff_id: [message] });
  }
  return staffId;
}

async function insertStaff(client: PoolClient, actorId: number, input: CreateUserInput): Promise<number> {
  const name = input.name!;
  const designation = input.designation!;

  const duplicate = await client.query(
    'SELECT 1 FROM master_staff WHERE LOWER(name) = LOWER($1) AND LOWER(designation) = LOWER($2)',
    [name, designation],
  );
  if (duplicate.rowCount) {
    const message = `${name} (${designation}) is already in the staff list - use "Existing Staff" instead`;
    throw new AppError(409, message, { name: [message] });
  }

  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO master_staff (name, designation, staff_type) VALUES ($1, $2, $3) RETURNING id',
    [name, designation, input.staff_type],
  );
  await writeAuditLog(
    {
      userId: actorId,
      action: 'CREATE',
      entityName: 'master_staff',
      entityId: rows[0].id,
      details: { name, designation, staff_type: input.staff_type },
    },
    client,
  );
  return rows[0].id;
}

/** Roles the system cannot run without: removing the last active account would lock everyone out of it. */
const ESSENTIAL_ROLES: Record<string, string> = { SUPER_ADMIN: 'Super Admin', HOD: 'HOD' };

/** Staff granted the Users module manage staff accounts only; Super Admin accounts stay with the Super Admin. */
function assertCanManage(req: Request, targetRole: string) {
  if (targetRole === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only the Super Admin can change Super Admin accounts');
  }
}

/** HOD accounts carry report verification, so only the Super Admin may create them or hand out their passwords. */
function assertCanAssignRole(req: Request, role: string) {
  if (role === 'HOD' && req.user!.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only the Super Admin can create or reset HOD accounts');
  }
}

async function assertNotLastActive(client: PoolClient, id: number, role: string) {
  const label = ESSENTIAL_ROLES[role];
  if (!label) return;
  const others = await client.query('SELECT 1 FROM users WHERE role = $1 AND is_active AND id <> $2', [role, id]);
  if (!others.rowCount) throw new AppError(400, `At least one active ${label} account must remain`);
}

export async function setUserStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { is_active } = req.body as UserStatusInput;

  if (id === req.user!.sub && !is_active) throw new AppError(400, 'You cannot deactivate your own account');

  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{ username: string; role: string; is_active: boolean }>(
      'SELECT username, role, is_active FROM users WHERE id = $1 FOR UPDATE',
      [id],
    );
    const target = rows[0];
    if (!target) throw new AppError(404, 'User not found');
    assertCanManage(req, target.role);

    if (!is_active && target.is_active) await assertNotLastActive(client, id, target.role);

    if (target.is_active !== is_active) {
      await client.query('UPDATE users SET is_active = $2 WHERE id = $1', [id, is_active]);
      if (!is_active) await resolveNotifications(client, 'PASSWORD_RESET', 'users', id);
      await writeAuditLog(
        {
          userId: req.user!.sub,
          action: is_active ? 'ACTIVATE' : 'DEACTIVATE',
          entityName: 'users',
          entityId: id,
          details: { username: target.username },
        },
        client,
      );
    }

    const updated = await client.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return updated.rows[0];
  });

  res.json({
    success: true,
    message: `${user.username} ${is_active ? 'activated' : 'deactivated'}`,
    data: user,
  });
}

/**
 * Issues a temporary password, typically answering a "Forgot Password?" request. The user must replace it
 * at the next sign-in, and sessions opened with the old password end immediately.
 */
export async function resetUserPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { password } = req.body as ResetPasswordInput;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{ username: string; role: string; password_reset_requested: boolean }>(
      'SELECT username, role, password_reset_requested FROM users WHERE id = $1 FOR UPDATE',
      [id],
    );
    const target = rows[0];
    if (!target) throw new AppError(404, 'User not found');
    if (target.role === 'SUPER_ADMIN') throw new AppError(400, 'Super Admin credentials are fixed and cannot be reset here');
    assertCanAssignRole(req, target.role);

    await client.query(
      `UPDATE users SET password_hash = $2, must_change_password = TRUE, password_changed_at = NOW(),
                        password_reset_requested = FALSE, password_reset_requested_at = NULL,
                        session_version = session_version + 1
       WHERE id = $1`,
      [id, hash],
    );
    await resolveNotifications(client, 'PASSWORD_RESET', 'users', id);
    await writeAuditLog(
      {
        userId: req.user!.sub,
        action: 'PASSWORD_RESET',
        entityName: 'users',
        entityId: id,
        details: { username: target.username, requested_by_user: target.password_reset_requested },
      },
      client,
    );

    const updated = await client.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return updated.rows[0];
  });

  res.json({ success: true, message: `Temporary password set for ${user.username}`, data: user });
}

export async function deleteUser(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (id === req.user!.sub) throw new AppError(400, 'You cannot delete your own account');

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query<{
      username: string;
      role: string;
      is_active: boolean;
      staff_id: number | null;
      staff_name: string | null;
      has_clinical_records: boolean;
    }>(
      `SELECT u.username, u.role, u.is_active, u.staff_id, s.name AS staff_name, ${HAS_CLINICAL_RECORDS} AS has_clinical_records
       FROM users u LEFT JOIN master_staff s ON s.id = u.staff_id
       WHERE u.id = $1
       FOR UPDATE OF u`,
      [id],
    );
    const target = rows[0];
    if (!target) throw new AppError(404, 'User not found');
    assertCanManage(req, target.role);
    if (target.has_clinical_records) {
      throw new AppError(400, 'Cannot delete user with existing clinical records. Disable the account instead.');
    }
    if (target.is_active) await assertNotLastActive(client, id, target.role);

    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await resolveNotifications(client, 'PASSWORD_RESET', 'users', id);

    // The staff record goes too unless another account still uses it; it has no report ties (checked above).
    let staffDeleted = false;
    if (target.staff_id !== null) {
      const removed = await client.query(
        'DELETE FROM master_staff s WHERE s.id = $1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.staff_id = s.id)',
        [target.staff_id],
      );
      staffDeleted = (removed.rowCount ?? 0) > 0;
    }

    await writeAuditLog(
      {
        userId: req.user!.sub,
        action: 'DELETE',
        entityName: 'users',
        entityId: id,
        details: {
          username: target.username,
          role: target.role,
          staff_id: target.staff_id,
          staff_name: target.staff_name,
          staff_deleted: staffDeleted,
        },
      },
      client,
    );

    return { id, username: target.username, staff_deleted: staffDeleted };
  });

  res.json({ success: true, message: 'User account deleted successfully', data: result });
}
