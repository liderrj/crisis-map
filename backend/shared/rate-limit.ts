import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from './db.js';

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current minute window after this call. */
  remaining: number;
  /** Epoch second at which the current window resets to 0. */
  resetAt: number;
}

const DEFAULT_LIMIT_PER_MINUTE = 5;

/**
 * Atomic fixed-window counter. The key layout is `${scope}:${id}:${minuteEpoch}`
 * so the row expires on its own after two minutes (TTL); the window
 * itself advances by simply moving to a new key on the next minute.
 *
 * On a ConditionalCheckFailed (the counter already exceeds the
 * limit) we read the current count to compute `remaining` and `resetAt`.
 * On any other error we fail open (allowed=true) and log — a rate
 * limiter must never break the main path.
 */
export async function checkAndIncrement(
  scope: string,
  id: string,
  limitPerMinute: number = DEFAULT_LIMIT_PER_MINUTE,
): Promise<RateLimitResult> {
  if (!id) return { allowed: true, remaining: limitPerMinute, resetAt: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const minuteEpoch = Math.floor(nowSec / 60);
  const resetAt = (minuteEpoch + 1) * 60;
  const key = `${scope}:${id}:${minuteEpoch}`;

  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLES.rateLimits,
      Key: { key },
      UpdateExpression: 'SET #c = if_not_exists(#c, :zero) + :one, #e = :exp',
      // Allow increment when the row doesn't exist (initial) OR when
      // the current count is strictly below the limit. If we've
      // already hit the limit, fail the conditional so we can return
      // a clean `allowed=false` instead of bumping further.
      ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
      ExpressionAttributeNames: { '#c': 'count', '#e': 'expiresAt' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':zero': 0,
        ':limit': limitPerMinute,
        ':exp': nowSec + 120,
      },
    }));
    return { allowed: true, remaining: Math.max(0, limitPerMinute - 1), resetAt };
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      return { allowed: false, remaining: 0, resetAt };
    }
    // Unknown failure: fail open so a rate-limiter outage doesn't
    // bring down the main path. The CloudWatch log will surface this.
    console.warn('[rate-limit] unexpected error, failing open:', err);
    return { allowed: true, remaining: limitPerMinute, resetAt };
  }
}