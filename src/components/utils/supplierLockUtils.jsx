/**
 * Fire-and-forget release of a Supplier edit lock, safe to call right before a
 * hard page navigation (e.g. `window.location.href`) or during `beforeunload`.
 *
 * Uses `fetch` with `keepalive: true` instead of `supabase.functions.invoke` /
 * `supabase-js` so the browser is allowed to complete the request even after
 * the page starts tearing down — a plain awaited call routinely gets aborted
 * mid-flight in exactly those situations, leaving the Supplier's `LockedByUser`
 * stuck until someone runs "Flush Locks" from the Suppliers list.
 *
 * The Edge Function (`autopro-releaseSupplierLock`) resolves the caller's
 * identity from the JWT itself and only clears the lock if it's still held by
 * that user, so this is safe to fire without awaiting the result.
 */
export function releaseSupplierLockKeepAlive(supplierId) {
  if (!supplierId) return;
  const jwt = window.__SUPABASE_JWT__;
  if (!jwt) return;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/autopro-releaseSupplierLock`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ supplierId }),
    }).catch((error) => console.error('Background supplier lock release failed:', error));
  } catch (error) {
    console.error('Failed to dispatch keepalive supplier lock release:', error);
  }
}
