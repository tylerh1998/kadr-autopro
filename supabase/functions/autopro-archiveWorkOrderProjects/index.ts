import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { wo_number } = await req.json();
    if (!wo_number) return new Response(JSON.stringify({ error: 'Missing wo_number' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: projects, error } = await supabase
      .from('Project')
      .select('*')
      .eq('work_order', wo_number)
      .neq('status', 'archived');
    if (error) throw error;

    const dateArchived = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const nowIso = new Date().toISOString();

    for (const project of projects) {
      const { error: updateError } = await supabase
        .from('Project')
        .update({ status: 'archived', date_archived: dateArchived, updated_date: nowIso })
        .eq('id', project.id);
      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ success: true, total_found: projects.length, archived_count: projects.length, date_archived: dateArchived }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
