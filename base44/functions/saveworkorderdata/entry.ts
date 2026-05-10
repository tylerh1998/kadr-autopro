import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const JSON_FIELDS = ['line_items', 'payments', 'accounting_details', 'tech_time'];
const DATE_FIELDS = new Set(['est_date', 'wo_date', 'completed_date', 'invoice_date']);
const IMMUTABLE_FIELDS = ['id', 'ro_number', 'created_at', 'updated_at', 'created_date', 'updated_date', 'created_by', 'created_by_id'];
const AUDIT_FIELDS = ['last_updated', 'last_updated_by'];
const NON_PERTINENT_FIELDS = new Set(['LockedByUser', 'locked_timestamp', ...AUDIT_FIELDS]);
const ALLOWED_FIELDS = new Set(['wo_number', 'est_number', 'inv_number', 'crinv_number', 'customer_id', 'vehicle_id', 'status', 'kanban_order', 'priority', 'stage', 'approval', 'converted', 'LockedByUser', 'locked_timestamp', 'description', 'odometer', 'labor_rate', 'parts_total', 'labor_total', 'shop_supply_total', 'tax_amount', 'total_amount', 'est_date', 'wo_date', 'completed_date', 'invoice_date', 'internal_notes', 'line_items', 'payments', 'amount_paid', 'notes_to_customer', 'po_number', 'cvip', 'default_taxable', 'accounting_details', 'cp_id', 'tech_time', 'last_updated', 'last_updated_by', 'completed_by']);

const getMountainTimeISOString = () => {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const offsetLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Edmonton',
    timeZoneName: 'shortOffset'
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || 'GMT-7';

  const offsetMatch = offsetLabel.replace('GMT', '').match(/^([+-])?(\d{1,2})(?::?(\d{2}))?$/);
  const offsetSign = offsetMatch?.[1] || '-';
  const offsetHours = String(offsetMatch?.[2] || '7').padStart(2, '0');
  const offsetMinutes = String(offsetMatch?.[3] || '00').padStart(2, '0');

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}:${dateParts.second}.${String(now.getMilliseconds()).padStart(3, '0')}${offsetSign}${offsetHours}:${offsetMinutes}`;
};

const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;

  if (obj1 === null || typeof obj1 !== 'object' || obj2 === null || typeof obj2 !== 'object') {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
};

const hasPertinentChanges = (existingRow, incomingPayload) => {
  const fieldsToIgnore = new Set([...IMMUTABLE_FIELDS, ...Array.from(NON_PERTINENT_FIELDS)]);

  for (const key in incomingPayload) {
    if (!Object.prototype.hasOwnProperty.call(incomingPayload, key)) continue;
    if (fieldsToIgnore.has(key)) continue;

    let incomingValue = incomingPayload[key];
    let existingValue = existingRow[key];

    // Handle JSON fields: parse to object for deep comparison
    if (JSON_FIELDS.includes(key)) {
      try {
        incomingValue = typeof incomingValue === 'string' ? JSON.parse(incomingValue) : incomingValue;
      } catch (e) {
        // If parsing fails, treat as a string comparison (e.g., invalid JSON string)
        console.warn(`Failed to parse incoming JSON for key ${key}:`, e);
      }
      try {
        existingValue = typeof existingValue === 'string' ? JSON.parse(existingValue) : existingValue;
      } catch (e) {
        // If parsing fails, treat as a string comparison
        console.warn(`Failed to parse existing JSON for key ${key}:`, e);
      }
    }

    // Special handling for date fields: normalize to ISO string for consistent comparison
    if (DATE_FIELDS.has(key)) {
        incomingValue = incomingValue ? new Date(incomingValue).toISOString() : null;
        existingValue = existingValue ? new Date(existingValue).toISOString() : null;
    }

    // Compare values
    if (!deepEqual(incomingValue, existingValue)) {
      return true; // Pertinent change detected
    }
  }
  return false; // No pertinent changes
};

const normalizeWorkOrder = (row) => {
  if (!row) return row;
  const normalized = { ...row };

  if (normalized.created_at && !normalized.created_date) normalized.created_date = normalized.created_at;
  if (normalized.updated_at && !normalized.updated_date) normalized.updated_date = normalized.updated_at;

  JSON_FIELDS.forEach((field) => {
    if (normalized[field] && typeof normalized[field] !== 'string') {
      normalized[field] = JSON.stringify(normalized[field]);
    }
  });

  return normalized;
};

const normalizePayload = (payload) => {
  const normalized = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (!ALLOWED_FIELDS.has(key) || IMMUTABLE_FIELDS.includes(key) || value === undefined) return;
    if (DATE_FIELDS.has(key) && value === '') {
      normalized[key] = null;
      return;
    }
    normalized[key] = JSON_FIELDS.includes(key) && value && typeof value !== 'string' ? JSON.stringify(value) : value;
  });

  return normalized;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const { ro_number, data } = await req.json().catch(() => ({}));

    if (!ro_number) {
      return Response.json({ error: 'ro_number is required' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return Response.json({ error: 'data is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const payload = normalizePayload(data);

    const existingResult = await supabase
      .from('WorkOrder')
      .select('*')
      .eq('ro_number', ro_number)
      .maybeSingle();

    if (existingResult.error) {
      console.error('saveworkorderdata read error:', existingResult.error);
      return Response.json({ error: 'Failed to read work order', details: existingResult.error.message }, { status: 500 });
    }

    if (!existingResult.data) {
      return Response.json({ error: 'Work order not found in Supabase' }, { status: 404 });
    }

    const pertinentChangeDetected = hasPertinentChanges(existingResult.data, payload);

    if (pertinentChangeDetected) {
      payload.last_updated = getMountainTimeISOString();
      payload.last_updated_by = user.email;
      // Release lock as part of the save if pertinent changes are made
      payload.LockedByUser = null;
      payload.locked_timestamp = null;

      const result = await supabase
        .from('WorkOrder')
        .update(payload)
        .eq('ro_number', ro_number)
        .select('id')
        .maybeSingle();

      if (result.error) {
        console.error('saveworkorderdata supabase error:', result.error);
        return Response.json({ error: 'Failed to save work order', details: result.error.message }, { status: 500 });
      }

      return Response.json({ success: true, id: result.data?.id || existingResult.data.id, message: 'Work order updated.' });
    } else {
      // No pertinent changes detected. Check if the current user held a lock and release it.
      if (existingResult.data.LockedByUser === user.email) {
          const lockReleasePayload = {
              LockedByUser: null,
              locked_timestamp: null,
          };
          const lockReleaseResult = await supabase
              .from('WorkOrder')
              .update(lockReleasePayload)
              .eq('ro_number', ro_number)
              .select('id')
              .maybeSingle();

          if (lockReleaseResult.error) {
              console.error('saveworkorderdata lock release error:', lockReleaseResult.error);
              // Log the error but still indicate success to the frontend for the "no pertinent changes" scenario.
              return Response.json({ success: true, id: existingResult.data.id, message: 'No pertinent changes to save, but failed to release lock.', error: lockReleaseResult.error.message });
          }
          return Response.json({ success: true, id: existingResult.data.id, message: 'No pertinent changes to save. Lock released.' });
      } else {
          // No pertinent changes and no lock by current user to release.
          return Response.json({ success: true, id: existingResult.data.id, message: 'No pertinent changes to save.' });
      }
    }
  } catch (error) {
    console.error('saveworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});