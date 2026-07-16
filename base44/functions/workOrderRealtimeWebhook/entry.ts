import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const getMountainTimeString = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return formatter.format(new Date()).replace(' ', 'T');
};

const getHeader = (req, name) => req.headers.get(name) || req.headers.get(name.toLowerCase()) || '';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const expectedSecret = Deno.env.get('SUPABASE_WEBHOOK_SHARED_SECRET');
    const payload = await req.json();
    const providedSecret = getHeader(req, 'x-webhook-secret') || getHeader(req, 'authorization').replace(/^Bearer\s+/i, '') || payload?.webhook_secret || '';

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const tableName = payload?.table || payload?.entity || payload?.record?.table || 'WorkOrder';
    const eventType = payload?.type || payload?.event || payload?.operation || payload?.eventType || 'update';
    const sourceRecord = payload?.record || payload?.new || payload?.data?.record || null;
    const oldRecord = payload?.old_record || payload?.old || payload?.data?.old_record || null;
    const sourceId = sourceRecord?.id || oldRecord?.id || payload?.id || '';
    const payloadPreview = JSON.stringify({
      type: eventType,
      table: tableName,
      id: sourceId,
    }).slice(0, 500);

    const existingSignals = await base44.asServiceRole.entities.RealtimeSignal.filter({ channel: 'work_order_refresh' });
    const existingSignal = Array.isArray(existingSignals) ? existingSignals[0] : null;

    const signalData = {
      channel: 'work_order_refresh',
      source_table: tableName,
      event_type: String(eventType),
      source_id: String(sourceId || ''),
      last_changed_mt: getMountainTimeString(),
      sequence: Number(existingSignal?.sequence || 0) + 1,
      payload_preview: payloadPreview,
    };

    let signalId = '';

    if (existingSignal?.id) {
      const updated = await base44.asServiceRole.entities.RealtimeSignal.update(existingSignal.id, signalData);
      signalId = updated?.id || existingSignal.id;
    } else {
      const created = await base44.asServiceRole.entities.RealtimeSignal.create(signalData);
      signalId = created?.id || '';
    }

    return Response.json({
      success: true,
      channel: 'work_order_refresh',
      source_table: tableName,
      event_type: eventType,
      source_id: sourceId,
      signal_id: signalId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});