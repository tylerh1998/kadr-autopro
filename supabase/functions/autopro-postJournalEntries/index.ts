import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  let supabase: any = null;
  let createdTransactionIds: string[] = [];

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase credentials not configured' });
    }

    supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const creatorName = user.user_metadata?.full_name || user.email || user.id;

    const { transactionDate, journalLines } = await req.json();

    if (!transactionDate) {
      return res({ error: 'Transaction date is required.' });
    }

    if (!Array.isArray(journalLines) || journalLines.length < 2) {
      return res({ error: 'At least 2 journal lines are required.' });
    }

    let totalDebits = 0;
    let totalCredits = 0;

    const normalizedLines = journalLines.map((line: any, index: number) => {
      const account = String(line?.account || '').trim();
      const debit = Number.parseFloat(line?.debit || 0) || 0;
      const credit = Number.parseFloat(line?.credit || 0) || 0;
      const memo = String(line?.memo || '').trim();
      const reference = String(line?.reference || '').trim();

      if (!account) {
        throw new Error(`Line ${index + 1} is missing an account.`);
      }

      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new Error(`Line ${index + 1} must contain either a debit or a credit amount.`);
      }

      totalDebits += debit;
      totalCredits += credit;

      return {
        account,
        debit: Number(debit.toFixed(2)),
        credit: Number(credit.toFixed(2)),
        memo,
        reference,
      };
    });

    if (Math.abs(totalDebits - totalCredits) >= 0.01) {
      return res({ error: 'Journal entry is not balanced. Total debits must equal total credits.' });
    }

    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };

    const pairingId = `JE-${Date.now()}`;
    const nowIso = getCurrentMountainTimeISO();

    for (const line of normalizedLines) {
      const transactionId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      const insertData = {
        id: transactionId,
        account_number: line.account,
        transaction_date: transactionDate,
        description: line.memo || 'Manual Journal Entry',
        reference: line.reference || '',
        debit_amount: line.debit,
        credit_amount: line.credit,
        source_type: 'manual',
        source_id: pairingId,
        batch_id: pairingId,
        created_date: nowIso,
        updated_date: nowIso,
        created_by: creatorName,
        created_by_id: user.id,
        updated_by: creatorName,
      };

      const result = await supabase.from('GLTransaction').insert([insertData]).select();

      if (result.error) {
        throw new Error(result.error.message || `Failed to create journal line for account ${line.account}.`);
      }

      const createdRecord = Array.isArray(result.data) ? result.data[0] : result.data;

      if (!createdRecord?.id) {
        throw new Error(`Failed to create journal line for account ${line.account}.`);
      }

      createdTransactionIds.push(createdRecord.id);
    }

    return res({
      success: true,
      reference: pairingId,
      count: normalizedLines.length,
      transaction_ids: createdTransactionIds,
    });
  } catch (error: any) {
    if (supabase && createdTransactionIds.length > 0) {
      await supabase.from('GLTransaction').delete().in('id', createdTransactionIds);
    }

    return res({ error: error.message });
  }
});
