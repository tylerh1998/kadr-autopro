import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Twilio sends application/x-www-form-urlencoded
    const textBody = await req.text();
    const params = new URLSearchParams(textBody);
    
    const from_phone = params.get('From') || '';
    const to_phone = params.get('To') || '';
    const body = params.get('Body') || '';
    const twilio_message_sid = params.get('MessageSid') || '';

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Normalize phones to 10 digits
    const normalizePhone = (phoneStr) => {
      if (!phoneStr) return '';
      const digitsOnly = phoneStr.replace(/\D/g, '');
      return digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
    };

    const normalized_from_phone = normalizePhone(from_phone);
    const normalized_to_phone = normalizePhone(to_phone);

    // Try to find customer
    let customer_id = null;
    let sender_name = null;
    if (normalized_from_phone) {
      const { data: cust } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .or(`phone.eq.${normalized_from_phone},secondary_phone.eq.${normalized_from_phone}`)
        .limit(1)
        .maybeSingle();
        
      if (cust) {
        customer_id = cust.id;
        sender_name = cust.org_name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || null;
      }
    }

    const { data: smsRecord, error: insertError } = await supabase
      .from('SmsMessage')
      .insert({
        direction: 'inbound',
        from_phone: normalized_from_phone,
        to_phone: normalized_to_phone,
        body,
        is_read: false,
        status: 'received',
        twilio_message_sid,
        customer_id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error', insertError);
    }

    // Broadcast
    const channel = supabase.channel('sms_refresh');
    await new Promise((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event: 'new_sms',
              payload: {
                record: smsRecord ? { ...smsRecord, sender_name } : { body, from_phone, sender_name }
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

    await supabase.removeChannel(channel);

    // Twilio expects XML response ideally, but 200 OK is enough.
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
      status: 200,
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

