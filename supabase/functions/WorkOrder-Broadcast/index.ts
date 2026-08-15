import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const payload = await req.json();

    // 1. Initialize the native Supabase client
    // Supabase automatically injects these environment variables into Edge Functions
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Extract the relevant record data from the webhook payload
    const tableName = payload?.table || 'WorkOrder';
    const eventType = payload?.type || 'UPDATE';
    const record = payload?.record || payload?.old_record || {};
    const sourceId = record?.id || '';

    // 3. Connect to the broadcast channel and send the message instantly
    const channel = supabase.channel('work_order_refresh');
    
    // You MUST subscribe to a channel before you can broadcast to it.
    // We wrap it in a Promise so we can await the subscription and the send.
    await new Promise((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event: 'workorder-updated',
              payload: {
                table: tableName,
                event_type: eventType,
                source_id: sourceId,
                timestamp: new Date().toISOString()
              }
            });
            resolve(true);
          } catch (err) {
            reject(err);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`Failed to subscribe: ${status}`));
        }
      });
    });

    // Optionally cleanup
    await supabase.removeChannel(channel);

    return Response.json({
      success: true,
      message: 'Broadcast dispatched to frontend',
      source_id: sourceId
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});