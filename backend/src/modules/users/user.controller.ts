import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../utils/audit';
import { CreateUserInput, UserStatusInput } from './user.schema';

const BCRYPT_ROUNDS = 10;

const USER_SELECT = `
  SELECT u.id, u.username, u.role, u.is_active, u.staff_id, u.created_at, u.updated_at,
         s.name AS staff_name, s.designation, s.staff_type,
         (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id = u.id AND a.action = 'LOGIN') AS last_login_at
  FROM users u
  LEFT JOIN master_staff s ON s.id = u.staff_id`;

export async function listUsers(_req: Request, res: Response) {
  const { rows } = await query(`${USER_SELECT} ORDER BY u.is_active DESC, u.role, LOWER(u.username)`);
  res.json({ success: true, data: rows });
}

export async function createUser(req: Request, res: Response) {
  const input = req.body as CreateUserInput;

  const isNewStaff = input.staff_id === undefined;

  const user = await withTransaction(async (client) => {
    const taken = await client.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [input.username]);
    if (taken.rowCount) throw new AppError(409, 'Username is already taken', { username: ['Username is already taken'] });

    const staffId = isNewStaff ? await insertStaff(client, req.user!.sub, input) : await assertStaffUnlinked(client, input.staff_id!);

    const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (username, password_hash, role, staff_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.username, hash, input.role, staffId],
    );
    const id = rows[0].id;

    await writeAuditLog(
      {
        userId: req.user!.sub,
        action: 'CREATE',
        entityName: 'users',
        entityId: id,
        details: { username: input.username, role: input.role, staff_id: staffId, new_staff: isNewStaff },
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

    if (!is_active && target.role === 'HOD' && target.is_active) {
      const others = await client.query(`SELECT 1 FROM users WHERE role = 'HOD' AND is_active AND id <> $1`, [id]);
      if (!others.rowCount) throw new AppError(400, 'At least one active HOD account must remain');
    }

    if (target.is_active !== is_active) {
      await client.query('UPDATE users SET is_active = $2 WHERE id = $1', [id, is_active]);
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
