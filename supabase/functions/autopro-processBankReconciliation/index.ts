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

const round2 = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

const dayDiff = (dateA, dateB) => {
  if (!dateA || !dateB) return Infinity;
  const a = dateA instanceof Date ? dateA : new Date(dateA);
  const b = dateB instanceof Date ? dateB : new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
};

// Fuzzy amount-matching tiers, mirrored from src/lib/reconcileMatching.js (Supplier Statement
// Reconciliation) so both reconciliation flows surface the same kinds of likely-but-not-exact matches.
const AMOUNT_TOLERANCE = 0.005;
const FUZZY_ABS_TOLERANCE = 2.0;
const FUZZY_PCT_TOLERANCE = 0.02;

const isFuzzyAmountMatch = (a, b) => {
  const diff = Math.abs(a - b);
  if (diff < AMOUNT_TOLERANCE) return false;
  const tolerance = Math.max(FUZZY_ABS_TOLERANCE, Math.max(Math.abs(a), Math.abs(b)) * FUZZY_PCT_TOLERANCE);
  return diff <= tolerance;
};

const toCents = (amount) => Math.round(Math.abs(amount) * 100);
const digitMultiset = (value) => String(value).split('').sort().join('');

const isDigitTransposition = (a, b) => {
  const centsA = toCents(a);
  const centsB = toCents(b);
  if (centsA === centsB) return false;
  const strA = String(centsA);
  const strB = String(centsB);
  if (strA.length !== strB.length) return false;
  return digitMultiset(strA) === digitMultiset(strB);
};

const isDecimalShift = (a, b) => {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA < AMOUNT_TOLERANCE || absB < AMOUNT_TOLERANCE) return false;
  const ratio = absA > absB ? absA / absB : absB / absA;
  return Math.abs(ratio - 10) < 0.02 || Math.abs(ratio - 100) < 0.2;
};

const buildDiscrepancyReason = (csvAmount, sysAmount) => {
  if (isDigitTransposition(csvAmount, sysAmount)) return 'Possible Digit Transposition';
  if (isDecimalShift(csvAmount, sysAmount)) return 'Possible Decimal Shift';
  return 'Close Amount Match — Verify';
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

    const unmatchedSystemAfterExact = filteredSystemTransactions.filter(tx => !matchedSystemIds.has(tx.id));

    // 5. Fuzzy discrepancy pass over leftovers from exact matching — surfaces likely-same
    // transactions where the amount doesn't quite agree (digit transposition, decimal shift,
    // or a close-but-not-exact amount) so they can be reviewed instead of silently missed.
    const errors = [];
    const remainingUnmatchedCsv = [];
    const errorConsumedSystemIds = new Set();

    for (const row of unmatchedCsv) {
      const csvAmount = row.debit > 0 ? row.debit : row.credit;
      const csvDate = parseCsvDate(row.date);

      const candidates = unmatchedSystemAfterExact.filter((sysTx) => {
        if (errorConsumedSystemIds.has(sysTx.id)) return false;
        const sysAmount = row.debit > 0 ? sysTx.debit_amount : sysTx.credit_amount;
        if (!(sysAmount > 0)) return false;
        return isDigitTransposition(csvAmount, sysAmount)
          || isDecimalShift(csvAmount, sysAmount)
          || isFuzzyAmountMatch(csvAmount, sysAmount);
      });

      if (candidates.length === 0) {
        remainingUnmatchedCsv.push(row);
        continue;
      }

      const best = candidates.reduce((closest, sysTx) => {
        const sysAmount = row.debit > 0 ? sysTx.debit_amount : sysTx.credit_amount;
        const closestAmount = row.debit > 0 ? closest.debit_amount : closest.credit_amount;
        const diffEntry = Math.abs(sysAmount - csvAmount);
        const diffClosest = Math.abs(closestAmount - csvAmount);
        if (diffEntry !== diffClosest) return diffEntry < diffClosest ? sysTx : closest;
        return dayDiff(sysTx.transaction_date, csvDate) < dayDiff(closest.transaction_date, csvDate) ? sysTx : closest;
      }, candidates[0]);

      errorConsumedSystemIds.add(best.id);
      const sysAmount = row.debit > 0 ? best.debit_amount : best.credit_amount;
      errors.push({
        key: `err_${errors.length}`,
        csv: row,
        system: best,
        reason: buildDiscrepancyReason(csvAmount, sysAmount),
        difference: round2(csvAmount - sysAmount)
      });
    }

    const unmatchedSystem = unmatchedSystemAfterExact.filter(tx => !errorConsumedSystemIds.has(tx.id));

    return new Response(JSON.stringify({
      matches,
      unmatchedCsv: remainingUnmatchedCsv,
      unmatchedSystem,
      errors,
      stats: {
        totalCsv: csvRows.length,
        matched: matches.length,
        unmatchedCsv: remainingUnmatchedCsv.length,
        unmatchedSystem: unmatchedSystem.length,
        errors: errors.length
      }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error in processBankReconciliation:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
