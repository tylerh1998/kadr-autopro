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

  let debugLog: string[] = [];
  const log = (msg: string) => { debugLog.push(msg); console.log(msg); };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const base44AccessToken = Deno.env.get("BASE44_ACCESS_TOKEN");
    const base44BackendUrl = Deno.env.get("BASE44_BACKEND_URL") || "https://base44.app";

    log("Env vars loaded");

    if (!supabaseUrl || !supabaseAnonKey || !base44AccessToken) {
      throw new Error("Missing system environment variables on Supabase (need BASE44_ACCESS_TOKEN).");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    log(`Auth header present: ${!!authHeader}`);

    let base44Headers = new Headers(req.headers);
    base44Headers.delete("Authorization"); 
    base44Headers.delete("Host"); 
    base44Headers.delete("Origin");
    base44Headers.delete("Referer");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      log(`getUser finished. Error: ${!!authError}. User: ${user?.id}`);

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized user session", debug: debugLog }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: employee, error: dbError } = await supabase
        .from("Employee")
        .select("autopro_user_id")
        .eq("mykadr_user_id", user.id)
        .single();
      
      log(`Employee lookup: ${employee?.autopro_user_id}. Error: ${!!dbError}`);

      if (dbError || !employee?.autopro_user_id) {
        log(`Mapping missing or db error for user ${user.id}. Blocking access.`);
        return new Response(JSON.stringify({
          error: "Account mapping missing",
          details: {
            message: "Your myKADR account is not linked to an AutoPRO user. Please ask your administrator to link your account in the Employee table.",
            status: 403
          },
          proxy_debug: debugLog
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      base44Headers.set("Authorization", `Bearer ${base44AccessToken}`);
      base44Headers.set("X-Act-As-User", employee.autopro_user_id);
    } else {
      log("No Authorization header provided. Blocking request.");
      return new Response(JSON.stringify({ 
        error: "Authentication required", 
        details: "An active user session is required to perform this action.",
        proxy_debug: debugLog 
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let relativePath = url.pathname.replace(/^\/(functions\/v1\/)?base44-proxy/, "");
    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }
    const safeBaseUrl = base44BackendUrl.replace(/\/$/, "");
    const targetUrl = `${safeBaseUrl}${relativePath}${url.search}`;

    log(`Target URL: ${targetUrl}`);
    log(`Headers sent: ${JSON.stringify(Object.fromEntries(base44Headers.entries()))}`);

    const requestInit: RequestInit = {
      method: req.method,
      headers: base44Headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      requestInit.body = req.body;
    }

    const response = await fetch(targetUrl, {
      ...requestInit,
      redirect: "manual"
    });

    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, val]) => {
      responseHeaders.set(key, val);
    });
    responseHeaders.set("X-Debug-Log", JSON.stringify(debugLog));

    // If Base44 returns an error (4xx or 5xx), we want to inject our debug log into the JSON body
    if (!response.ok) {
      const contentType = responseHeaders.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const errorJson = await response.json();
          errorJson.proxy_debug = debugLog;
          return new Response(JSON.stringify(errorJson), {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
          });
        } catch (e) {
          // Ignore json parse error, fall back to streaming body
        }
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: err.message || "Proxy failed", debug: debugLog }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
