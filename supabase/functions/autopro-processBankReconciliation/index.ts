import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Papa from "npm:papaparse@5.4.1";
import { parse, isValid } from "npm:date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const parseAmount = (str) => {
  if (!str) return 0;
  const clean = str.replace(/[$,\s"]/g, '');
  const float = parseFloat(clean);
  return isNaN(float) ? 0 : float;
};

const parseCsvDate = (dateStr) => {
  if (!dateStr) return null;
  const cleanDateStr = dateStr.split(' ')[0];
  let date = parse(cleanDateStr, 'MM/dd/yyyy', new Date());
  if (!isValid(date)) {
    date = parse(cleanDateStr, 'yyyy-MM-dd', new Date());
  }
  if (!isValid(date)) {
    date = parse(cleanDateStr, 'dd/MM/yyyy', new Date());
  }
  return isValid(date) ? date : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json();
    const { fileUrl, bankAccountId, periodEnd } = payload;

    if (!fileUrl || !bankAccountId || !periodEnd) {
      return new Response(JSON.stringify({ error: 'Missing fileUrl, bankAccountId, or periodEnd' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // 1. Fetch CSV Content
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch CSV file' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const csvText = await fileResponse.text();

    // 2. Parse CSV
    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/"/g, ''),
    });

    if (parseResult.errors.length > 0) {
      console.error("CSV Parse Errors:", parseResult.errors);
    }

    const csvRows = parseResult.data;

    // 3. Fetch Bank Transactions directly from Supabase
    const { data: systemTransactionsRaw, error: systemTransactionsError } = await supabase
      .from('BankTransaction')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .order('transaction_date', { ascending: false })
      .limit(2000);

    if (systemTransactionsError) {
      return new Response(JSON.stringify({ error: systemTransactionsError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemTransactions = (systemTransactionsRaw || []).map((tx) => ({
      ...tx,
      debit_amount: parseFloat(tx.debit_amount) || 0,
      credit_amount: parseFloat(tx.credit_amount) || 0,
      reconciled: tx.reconciled === true || tx.reconciled === 'true',
      is_reversed: tx.is_reversed === true || tx.is_reversed === 'true'
    }));

    const filteredSystemTransactions = systemTransactions.filter((tx) => {
      if (tx.reconciled === true) return false;
      if (tx.is_reversed === true) return false;
      if (!tx.transaction_date) return false;
      return tx.transaction_date.substring(0, 10) <= periodEnd;
    });

    // 4. Matching Logic
    const matches = [];
    const unmatchedCsv = [];
    const matchedSystemIds = new Set();

    for (const row of csvRows) {
      const debit = parseAmount(row['DebitAmount']);
      const credit = parseAmount(row['CreditAmount']);
      const description = row['Description'];
      const dateStr = row['Date'];

      if (debit === 0 && credit === 0) {
        continue;
      }

      let matchFound = null;

      // Strategy: Find match based on amount only (tolerance <= 0.005), ignoring dates
      for (const sysTx of filteredSystemTransactions) {
        if (matchedSystemIds.has(sysTx.id)) continue;

        let isAmountMatch = false;
        if (debit > 0) {
          if (Math.abs((sysTx.debit_amount || 0) - debit) <= 0.005) isAmountMatch = true;
        } else if (credit > 0) {
          if (Math.abs((sysTx.credit_amount || 0) - credit) <= 0.005) isAmountMatch = true;
        }

        if (isAmountMatch) {
          matchFound = sysTx;
          break;
        }
      }

      if (matchFound) {
        matchedSystemIds.add(matchFound.id);
        matches.push({
          csv: { date: dateStr, description, debit, credit },
          system: matchFound
        });
      } else {
        unmatchedCsv.push({
          date: dateStr, description, debit, credit
        });
      }
    }

    const unmatchedSystem = filteredSystemTransactions.filter(tx => !matchedSystemIds.has(tx.id));

    return new Response(JSON.stringify({
      matches,
      unmatchedCsv,
      unmatchedSystem,
      stats: {
        totalCsv: csvRows.length,
        matched: matches.length,
        unmatchedCsv: unmatchedCsv.length,
        unmatchedSystem: unmatchedSystem.length
      }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error in processBankReconciliation:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
