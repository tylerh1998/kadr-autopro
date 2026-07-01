import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  let supabase = null;
  let createdTransactionIds = [];

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

    const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
    supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false },
    });

    const { transactionDate, journalLines } = await req.json();

    if (!transactionDate) {
      return Response.json({ error: 'Transaction date is required.' }, { status: 400 });
    }

    if (!Array.isArray(journalLines) || journalLines.length < 2) {
      return Response.json({ error: 'At least 2 journal lines are required.' }, { status: 400 });
    }

    let totalDebits = 0;
    let totalCredits = 0;

    const normalizedLines = journalLines.map((line, index) => {
      const account = String(line?.account || '').trim();
      const debit = Number.parseFloat(line?.debit || 0) || 0;
      const credit = Number.parseFloat(line?.credit || 0) || 0;
      const memo = String(line?.memo || '').trim();

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
      };
    });

    if (Math.abs(totalDebits - totalCredits) >= 0.01) {
      return Response.json({ error: 'Journal entry is not balanced. Total debits must equal total credits.' }, { status: 400 });
    }

    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };

    const creatorName = user.User_name || user.full_name || user.email || user.id;
    const reference = `JE-${Date.now()}`;
    const nowIso = getCurrentMountainTimeISO();

    for (const line of normalizedLines) {
      const transactionId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      const insertData = {
        id: transactionId,
        account_number: line.account,
        transaction_date: transactionDate,
        description: line.memo || 'Manual Journal Entry',
        reference,
        debit_amount: line.debit,
        credit_amount: line.credit,
        source_type: 'manual',
        source_id: null,
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

    return Response.json({
      success: true,
      reference,
      count: normalizedLines.length,
      transaction_ids: createdTransactionIds,
    });
  } catch (error) {
    if (supabase && createdTransactionIds.length > 0) {
      await supabase.from('GLTransaction').delete().in('id', createdTransactionIds);
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});