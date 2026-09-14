// Shared Web Push sending helper - notifies subscribed, unmuted UserDevices
// rows when an inbound SMS arrives. See autopro-twilio-webhook/index.ts.

import webpush from 'npm:web-push@3';

export interface PushSubscriptionRow {
  push_endpoint: string;
  push_p256dh: string;
  push_auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function getVapidDetails() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// Sends one Web Push notification. 'gone' means the subscription is dead and
// the caller should clear it; 'failed' is transient/unconfigured, safe to
// ignore for this send.
export async function sendWebPush(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<'sent' | 'gone' | 'failed'> {
  const vapid = getVapidDetails();
  if (!vapid) {
    console.warn('Web push not configured (missing VAPID secrets)');
    return 'failed';
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.push_endpoint,
        keys: { p256dh: subscription.push_p256dh, auth: subscription.push_auth },
      },
      JSON.stringify(payload),
    );
    return 'sent';
  } catch (error) {
    // deno-lint-ignore no-explicit-any
    const statusCode = (error as any)?.statusCode;
    if (statusCode === 404 || statusCode === 410) return 'gone';
    console.error('Web push send failed:', error);
    return 'failed';
  }
}

// Notifies every subscribed, unmuted device and self-heals dead
// subscriptions. Best-effort - never throws, so a push failure can't break
// the inbound-SMS webhook that calls this.
export async function notifySubscribedDevices(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  payload: PushPayload,
): Promise<void> {
  try {
    const { data: devices, error } = await supabase
      .from('UserDevices')
      .select('id, push_endpoint, push_p256dh, push_auth')
      .not('push_endpoint', 'is', null)
      .eq('is_revoked', false)
      .eq('dnd_enabled', false);

    if (error || !devices) {
      console.error('Failed to load UserDevices for push:', error);
      return;
    }

    await Promise.all(
      // deno-lint-ignore no-explicit-any
      devices.map(async (device: any) => {
        const result = await sendWebPush(
          { push_endpoint: device.push_endpoint, push_p256dh: device.push_p256dh, push_auth: device.push_auth },
          payload,
        );
        if (result === 'gone') {
          await supabase
            .from('UserDevices')
            .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
            .eq('id', device.id);
        }
      }),
    );
  } catch (err) {
    console.error('notifySubscribedDevices error:', err);
  }
}
