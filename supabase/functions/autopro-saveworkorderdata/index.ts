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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    // Initialize Supabase Client with Service Role Key for writing
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    // Initialize Supabase Client with Anon Key for validating auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !data?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = data.user;

    // Parse the request body
    const body = await req.json();
    const { ro_number, data: payloadData } = body;

    if (!ro_number) {
      return new Response(JSON.stringify({ error: "Missing ro_number parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payloadData) {
      return new Response(JSON.stringify({ error: "Missing data parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedColumns = [
      "ro_number", "wo_number", "est_number", "inv_number", "crinv_number",
      "customer_id", "vehicle_id", "status", "kanban_order", "priority",
      "stage", "approval", "converted", "LockedByUser", "description",
      "odometer", "labor_rate", "parts_total", "labor_total", "shop_supply_total",
      "tax_amount", "total_amount", "est_date", "wo_date", "completed_date",
      "invoice_date", "internal_notes", "line_items", "payments", "amount_paid",
      "notes_to_customer", "po_number", "cvip", "default_taxable",
      "accounting_details", "tech_time", "last_updated", "last_updated_by",
      "completed_by", "created_at", "updated_at", "created_by", "created_date",
      "locked_timestamp", "session_id"
    ];

    const cleanPayload: any = {};
    for (const key of Object.keys(payloadData)) {
      if (allowedColumns.includes(key)) {
        cleanPayload[key] = payloadData[key];
      }
    }

    const JSON_FIELDS = ['line_items', 'payments', 'accounting_details', 'tech_time'];
    const DATE_FIELDS = new Set(['est_date', 'wo_date', 'completed_date', 'invoice_date']);
    const CURRENCY_FIELDS = new Set(['labor_rate', 'parts_total', 'labor_total', 'shop_supply_total', 'tax_amount', 'total_amount', 'amount_paid']);
    const IMMUTABLE_FIELDS = ['id', 'ro_number', 'created_at', 'updated_at', 'created_date', 'updated_date', 'created_by', 'created_by_id'];
    const AUDIT_FIELDS = ['last_updated', 'last_updated_by'];
    const NON_PERTINENT_FIELDS = new Set(['LockedByUser', 'locked_timestamp', 'session_id', ...AUDIT_FIELDS]);

    const EPSILON = 0.0001;
    const deepEqual = (obj1: any, obj2: any): boolean => {
      if (obj1 === obj2) return true;
      if (typeof obj1 === 'number' && typeof obj2 === 'number') return Math.abs(obj1 - obj2) < EPSILON;
      if (Array.isArray(obj1) || Array.isArray(obj2)) {
        if (!Array.isArray(obj1) || !Array.isArray(obj2) || obj1.length !== obj2.length) return false;
        for (let i = 0; i < obj1.length; i++) if (!deepEqual(obj1[i], obj2[i])) return false;
        return true;
      }
      if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') return false;
      const keys1 = Object.keys(obj1).sort();
      const keys2 = Object.keys(obj2).sort();
      if (keys1.length !== keys2.length) return false;
      for (let i = 0; i < keys1.length; i++) if (keys1[i] !== keys2[i]) return false;
      for (const key of keys1) if (!deepEqual(obj1[key], obj2[key])) return false;
      return true;
    };

    const normalizeMountainDateTime = (value: any) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && value.trim() === '') return null;
      const parsedDate = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(parsedDate.getTime())) return null;
      const parts: any = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(parsedDate).reduce((acc: any, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    };

    const normalizeJsonValue = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
      const sortRecursively = (input: any): any => {
        if (Array.isArray(input)) return input.map(sortRecursively);
        if (input && typeof input === 'object') {
          return Object.keys(input).sort().reduce((acc: any, key) => {
            acc[key] = sortRecursively(input[key]);
            return acc;
          }, {});
        }
        return input;
      };
      return sortRecursively(parsedValue);
    };

    const normalizeComparableValue = (key: string, value: any) => {
      let normalizedValue = value;
      if (JSON_FIELDS.includes(key)) {
        try { return normalizeJsonValue(normalizedValue); } catch { return typeof normalizedValue === 'string' ? normalizedValue.trim() || null : normalizedValue ?? null; }
      }
      if (DATE_FIELDS.has(key)) return normalizeMountainDateTime(normalizedValue);
      if (CURRENCY_FIELDS.has(key)) {
        const numericValue = typeof normalizedValue === 'string' ? Number(normalizedValue.trim()) : normalizedValue;
        if (numericValue === null || numericValue === undefined || Number.isNaN(numericValue)) return null;
        return Math.round(numericValue * 100) / 100;
      }
      if (typeof normalizedValue === 'string') {
        const trimmedValue = normalizedValue.trim();
        if (trimmedValue === '') return null;
        return trimmedValue;
      }
      return normalizedValue ?? null;
    };

    const hasPertinentChanges = (existingRow: any, incomingPayload: any) => {
      const fieldsToIgnore = new Set([...IMMUTABLE_FIELDS, ...Array.from(NON_PERTINENT_FIELDS)]);
      for (const key in incomingPayload) {
        if (!Object.prototype.hasOwnProperty.call(incomingPayload, key)) continue;
        if (fieldsToIgnore.has(key)) continue;
        const incomingValue = normalizeComparableValue(key, incomingPayload[key]);
        const existingValue = normalizeComparableValue(key, existingRow[key]);
        if (!deepEqual(incomingValue, existingValue)) return true;
      }
      return false;
    };

    const normalizeWorkOrder = (row: any) => {
      if (!row) return row;
      const normalized = { ...row };
      JSON_FIELDS.forEach((field) => {
        if (normalized[field] && typeof normalized[field] !== 'string') {
          normalized[field] = JSON.stringify(normalized[field]);
        }
      });
      return normalized;
    };

    // First fetch the existing record to compare against
    const { data: existingResult, error: readError } = await supabaseAdmin
      .from('WorkOrder')
      .select('*')
      .eq('ro_number', ro_number)
      .maybeSingle();

    if (readError) {
      log(`Database read error: ${readError.message}`);
      return new Response(JSON.stringify({ error: `Failed to read work order: ${readError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!existingResult) {
      return new Response(JSON.stringify({ error: 'Work order not found' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const existingWorkOrder = normalizeWorkOrder(existingResult);
    const pertinentChangeDetected = hasPertinentChanges(existingWorkOrder, cleanPayload);
    const now = new Date().toISOString();
    const shouldKeepLock = payloadData.should_keep_lock === true;

    // Build the final update payload
    let updatePayload: any = {};
    
    if (pertinentChangeDetected) {
      updatePayload = {
        ...cleanPayload,
        updated_at: now,
        last_updated: now,
        last_updated_by: user.email,
        ...(!shouldKeepLock ? { LockedByUser: null, locked_timestamp: null } : {})
      };
      
      // Also apply completed_by if status changed to Completed
      if (cleanPayload.status === "Completed" && !cleanPayload.completed_by) {
        updatePayload.completed_by = user.email;
      }
    } else {
      updatePayload = {
        updated_at: now,
        ...(Object.prototype.hasOwnProperty.call(cleanPayload, 'session_id') ? { session_id: cleanPayload.session_id } : {}),
        ...(shouldKeepLock ? {
          ...(Object.prototype.hasOwnProperty.call(cleanPayload, 'LockedByUser') ? { LockedByUser: cleanPayload.LockedByUser } : {}),
          ...(Object.prototype.hasOwnProperty.call(cleanPayload, 'locked_timestamp') ? { locked_timestamp: cleanPayload.locked_timestamp } : {}),
        } : {
          LockedByUser: null,
          locked_timestamp: null,
        })
      };
    }

    // Clean up JSON fields in updatePayload exactly as before to avoid PostgREST cast issues
    if (typeof updatePayload.line_items === "string") {
      try { updatePayload.line_items = JSON.parse(updatePayload.line_items); } catch (_) {}
    }
    if (typeof updatePayload.payments === "string") {
      try { updatePayload.payments = JSON.parse(updatePayload.payments); } catch (_) {}
    }
    if (typeof updatePayload.accounting_details === "string") {
      try { updatePayload.accounting_details = JSON.parse(updatePayload.accounting_details); } catch (_) {}
    }

    // Perform database update
    const { data: dbResult, error: dbError } = await supabaseAdmin
      .from("WorkOrder")
      .update(updatePayload)
      .eq("ro_number", ro_number)
      .select();

    if (dbError) {
      log(`Database update error: ${dbError.message}`);
      return new Response(JSON.stringify({ error: `Failed to update work order: ${dbError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: dbResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    log(`Outer catch error: ${error?.message || error}`);
    return new Response(JSON.stringify({ error: error?.message || error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
