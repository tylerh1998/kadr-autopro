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

    // Process Media Attachments
    const numMedia = parseInt(params.get('NumMedia') || '0', 10);
    const attachments = [];

    if (numMedia > 0) {
      const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
      const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
      const authHeader = 'Basic ' + btoa(`${twilioSid}:${twilioToken}`);

      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const contentType = params.get(`MediaContentType${i}`);
        
        if (mediaUrl) {
          try {
            // Fetch media from Twilio with Auth
            const mediaResponse = await fetch(mediaUrl, {
              headers: {
                'Authorization': authHeader
              }
            });
            
            if (!mediaResponse.ok) {
              const text = await mediaResponse.text();
              console.error(`Twilio fetch failed (${mediaResponse.status}):`, text);
              throw new Error(`Failed to fetch from Twilio: ${mediaResponse.status}`);
            }

            const blob = await mediaResponse.blob();
            
            // Generate filename
            const ext = contentType ? contentType.split('/')[1] : 'bin';
            const fileName = `${twilio_message_sid}_${i}.${ext}`;
            const filePath = `inbound/${fileName}`;
            
            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
              .from('sms-media')
              .upload(filePath, blob, { contentType: contentType || undefined, upsert: true });
              
            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage
                .from('sms-media')
                .getPublicUrl(filePath);
                
              attachments.push({
                url: publicUrlData.publicUrl,
                type: contentType || 'unknown',
                name: `Attachment ${i + 1}`
              });
            } else {
              console.error('Failed to upload to storage:', uploadError);
              attachments.push({ url: mediaUrl, type: contentType || 'unknown', name: `Attachment ${i + 1}` });
            }
          } catch (err) {
            console.error('Error fetching media:', err);
            attachments.push({ url: mediaUrl, type: contentType || 'unknown', name: `Attachment ${i + 1}` });
          }
        }
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
        customer_id,
        attachments
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error', insertError);
    }

    // Broadcast
    try {
      const channel = supabase.channel('sms_refresh');
      await new Promise((resolve) => {
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
            } catch (err) {
              console.error('Broadcast send error:', err);
            }
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve(false);
          }
        });
      });

      // Small delay to ensure websocket frame is flushed to network
      await new Promise((r) => setTimeout(r, 250));
      await supabase.removeChannel(channel);
    } catch (e) {
      console.warn('Broadcast exception:', e);
    }

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

