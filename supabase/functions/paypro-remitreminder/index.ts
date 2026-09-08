import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendViaResend } from "../_shared/resend.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const cronSecret = Deno.env.get('AUTOPRO_CRON_SECRET')
  const providedSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('Authorization')
  
  if ((!cronSecret || providedSecret !== cronSecret) && !authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Calculate the date 15 days ago
    const date15DaysAgo = new Date();
    date15DaysAgo.setDate(date15DaysAgo.getDate() - 15);
    const dateStr = date15DaysAgo.toISOString().split('T')[0];

    // Check if there is a remittance in the last 15 days
    const { data: remittances, error: fetchError } = await supabase
      .from('PayPro_Remittance')
      .select('id, remittance_date')
      .gte('remittance_date', dateStr)
      .limit(1)

    if (fetchError) {
      console.error('Error fetching remittances:', fetchError)
      throw fetchError
    }

    if (remittances && remittances.length > 0) {
      console.log('Remittance found in the last 15 days. No action taken.')
      return new Response(JSON.stringify({ message: 'Remittance found in the last 15 days. No action taken.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('No remittance found in the last 15 days. Sending reminder email...')

    const htmlBody = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Payroll Remittance Reminder</h2>
        <p>No payroll remittance has been recorded in the last 15 days.</p>
        <p>Please review and submit the remittance if required.</p>
        <p>
          <a href="https://autopro.kensauto.ca/paypro/Remittances" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px;">
            View Remittances
          </a>
        </p>
      </div>
    `

    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const fromAddress = "Ken's Auto PRO <payroll@kensauto.ca>"
    const recipients = ["tyler@kensauto.ca"]
    const subject = "Action Required: Payroll Remittance Reminder"

    const emailResult = await sendViaResend(
      resendApiKey,
      fromAddress,
      recipients,
      subject,
      htmlBody
    )

    return new Response(JSON.stringify({ message: 'Reminder email sent successfully.', emailResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error executing remitreminder:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
