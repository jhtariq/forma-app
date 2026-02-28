/**
 * Postgres-based sliding window rate limiter.
 *
 * Uses the rate_limit_log table (inserted by migration 002) to count
 * how many times a user performed an action within a time window.
 * All queries use the service role client — the table has RLS enabled
 * with no anon policies, so service role is required.
 *
 * Limits:
 *   upload  — 10 per user per 60 seconds
 *   write   — 30 per user per 60 seconds (BOM save, Spec save)
 *   heavy   — 5 per user per 60 seconds (CAD generate, export pack)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitAction = 'upload' | 'write' | 'heavy'

const LIMITS: Record<RateLimitAction, { max: number; windowSeconds: number }> = {
  upload: { max: 10, windowSeconds: 60 },
  write: { max: 30, windowSeconds: 60 },
  heavy: { max: 5, windowSeconds: 60 },
}

export interface RateLimitResult {
  limited: boolean
  remaining: number
}

/**
 * Check and record a rate-limited action for a user.
 * Returns `limited: true` if the user has exceeded the limit.
 * If not limited, inserts a log row to count this attempt.
 *
 * @param serviceClient - Supabase service role client (bypasses RLS)
 * @param userId        - The app_users.id (auth.uid equivalent)
 * @param action        - Which limit bucket to check
 */
export async function checkRateLimit(
  serviceClient: SupabaseClient,
  userId: string,
  action: RateLimitAction
): Promise<RateLimitResult> {
  const { max, windowSeconds } = LIMITS[action]
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()

  // Count existing requests in this window
  const { count, error: countError } = await serviceClient
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart)

  if (countError) {
    // On DB error, fail open (allow the request) to avoid blocking legitimate users
    console.error('Rate limit count error:', countError)
    return { limited: false, remaining: max }
  }

  const current = count ?? 0

  if (current >= max) {
    return { limited: true, remaining: 0 }
  }

  // Log this request
  await serviceClient.from('rate_limit_log').insert({
    user_id: userId,
    action,
  })

  return { limited: false, remaining: max - current - 1 }
}
