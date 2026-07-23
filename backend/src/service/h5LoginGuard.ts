import { createHash } from 'node:crypto';
import { execute, queryOne, transaction } from '../db/query.js';

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

function guardKey(phone: string, ip: string): string {
  return createHash('sha256').update(`${phone}\0${ip}`).digest('hex');
}

export function nextH5LoginFailureState(current?: {
  failureCount: number;
  windowExpired: boolean;
  currentlyLocked: boolean;
}): { failureCount: number; lockNow: boolean; unchanged: boolean } {
  if (current?.currentlyLocked) {
    return { failureCount: current.failureCount, lockNow: true, unchanged: true };
  }
  if (!current || current.windowExpired) {
    return { failureCount: 1, lockNow: false, unchanged: false };
  }
  const failureCount = current.failureCount + 1;
  return { failureCount, lockNow: failureCount >= MAX_FAILURES, unchanged: false };
}

export async function getH5LoginLock(phone: string, ip: string): Promise<{ locked: boolean; retryAfter: number }> {
  const row = await queryOne<{ locked: number; retry_after: number }>(
    `SELECT IF(locked_until > CURRENT_TIMESTAMP, 1, 0) AS locked,
            GREATEST(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, locked_until), 0) AS retry_after
       FROM h5_login_guard
      WHERE guard_key = ?`,
    [guardKey(phone, ip)]
  );
  return { locked: row?.locked === 1, retryAfter: Number(row?.retry_after ?? 0) };
}

export async function recordH5LoginFailure(phone: string, ip: string): Promise<{ locked: boolean; retryAfter: number }> {
  const key = guardKey(phone, ip);
  await transaction(async tx => {
    const current = await tx.queryOne<{
      failure_count: number;
      window_expired: number;
      currently_locked: number;
    }>(
      `SELECT failure_count,
              IF(window_started < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${WINDOW_MINUTES} MINUTE), 1, 0) AS window_expired,
              IF(locked_until > CURRENT_TIMESTAMP, 1, 0) AS currently_locked
         FROM h5_login_guard
        WHERE guard_key = ?
        FOR UPDATE`,
      [key]
    );
    const next = nextH5LoginFailureState(current ? {
      failureCount: Number(current.failure_count),
      windowExpired: current.window_expired === 1,
      currentlyLocked: current.currently_locked === 1,
    } : undefined);
    if (!current) {
      await tx.execute(
        `INSERT INTO h5_login_guard (guard_key, failure_count, window_started, updated_at)
         VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [key]
      );
      return;
    }
    if (next.unchanged) return;
    if (current.window_expired === 1) {
      await tx.execute(
        `UPDATE h5_login_guard
            SET failure_count = 1, window_started = CURRENT_TIMESTAMP, locked_until = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE guard_key = ?`,
        [key]
      );
      return;
    }
    await tx.execute(
      `UPDATE h5_login_guard
          SET failure_count = ?,
              locked_until = IF(? >= ${MAX_FAILURES}, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${LOCK_MINUTES} MINUTE), NULL),
              updated_at = CURRENT_TIMESTAMP
        WHERE guard_key = ?`,
      [next.failureCount, next.lockNow ? MAX_FAILURES : 0, key]
    );
  });
  await execute(
    'DELETE FROM h5_login_guard WHERE updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) LIMIT 100'
  );
  return getH5LoginLock(phone, ip);
}

export function clearH5LoginFailures(phone: string, ip: string): Promise<void> {
  return execute('DELETE FROM h5_login_guard WHERE guard_key = ?', [guardKey(phone, ip)]);
}

export const H5_LOGIN_LIMIT = {
  maxFailures: MAX_FAILURES,
  windowMinutes: WINDOW_MINUTES,
  lockMinutes: LOCK_MINUTES,
};
