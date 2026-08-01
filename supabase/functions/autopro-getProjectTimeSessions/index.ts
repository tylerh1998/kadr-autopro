import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attempt to fetch from ProjectTimeSession table first
    let { data: logs, error: dbError } = await supabaseAdmin
      .from('ProjectTimeSession')
      .select('*')
      .eq('project_id', projectId);

    if (dbError) {
      // Fallback: try project_time_sessions
      const { data: fallbackLogs, error: fallbackError } = await supabaseAdmin
        .from('project_time_sessions')
        .select('*')
        .eq('project_id', projectId);
        
      if (!fallbackError && fallbackLogs) {
        logs = fallbackLogs;
        dbError = null;
      }
    }

    if (dbError) {
      console.error('Error fetching time sessions:', dbError);
      return new Response(JSON.stringify({ success: false, error: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize hours field for the frontend
    const normalizedLogs = (logs || []).map(log => ({
      ...log,
      hours: log.hours !== undefined ? log.hours : log.total_hours
    }));

    return new Response(JSON.stringify({ 
      success: true, 
      logs: normalizedLogs 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
