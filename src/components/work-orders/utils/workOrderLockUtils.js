/**
 * Fire-and-forget release of a Work Order edit lock, safe to call right before a hard
 * page/tab teardown (`beforeunload`/`pagehide`).
 *
 * Uses `fetch` with `keepalive: true` instead of `supabase.functions.invoke` / `supabase-js`
 * so the browser is allowed to complete the request even after the page starts tearing down.
 *
 * The Edge Function (`autopro-releaseWorkOrderLock`) resolves the caller's identity from the
 * JWT itself and only clears the lock if it's still held by that user (via set_workorder_lock's
 * own ownership-scoped 'release' action), so this is safe to fire without awaiting the result.
 */
export function releaseWorkOrderLockKeepAlive(roNumber) {
  if (!roNumber) return;
  const jwt = window.__SUPABASE_JWT__;
  if (!jwt) return;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/autopro-releaseWorkOrderLock`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ roNumber }),
    }).catch((error) => console.error('Background work order lock release failed:', error));
  } catch (error) {
    console.error('Failed to dispatch keepalive work order lock release:', error);
  }
}
