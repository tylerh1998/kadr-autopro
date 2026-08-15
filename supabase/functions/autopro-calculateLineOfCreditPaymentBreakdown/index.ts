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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { lineOfCreditId, paymentAmount } = await req.json();

    if (!lineOfCreditId) {
      return res({ success: false, error: 'lineOfCreditId is required' });
    }

    const amountValue = parseFloat(paymentAmount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      return res({ success: false, error: 'paymentAmount must be greater than 0' });
    }

    const { data: transactionsData, error: transactionsError } = await supabase
      .from('LinesOfCreditTransaction')
      .select('*')
      .eq('line_of_credit_id', lineOfCreditId)
      .order('transaction_date', { ascending: true })
      .limit(2000);

    if (transactionsError) throw new Error(transactionsError.message);

    const transactions = transactionsData || [];

    const outstandingTransactions = transactions
      .filter((tx: any) => {
        if (tx.is_reversed === true) return false;
        if (tx.source_type === 'payment_made') return false;

        if ((tx.charge_amount || 0) > 0) {
          return (tx.payment_amount || 0) < (tx.charge_amount || 0);
        }

        if ((tx.credit_amount || 0) > 0) {
          return (tx.payment_amount || 0) > -(tx.credit_amount || 0);
        }

        return false;
      })
      .sort((a: any, b: any) => {
        const dateCompare = String(a.transaction_date).localeCompare(String(b.transaction_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.id).localeCompare(String(b.id));
      });

    let remainingAmount = amountValue;
    const appliedCharges: any[] = [];

    for (const tx of outstandingTransactions) {
      if (remainingAmount <= 0.00001) break;

      if ((tx.credit_amount || 0) > 0) {
        const remainingCredit = (tx.credit_amount || 0) + (tx.payment_amount || 0);
        if (remainingCredit > 0.00001) {
          appliedCharges.push({
            id: tx.id,
            amount: -remainingCredit
          });
          remainingAmount -= remainingCredit;
        }
        continue;
      }

      if ((tx.charge_amount || 0) > 0) {
        const remainingCharge = (tx.charge_amount || 0) - (tx.payment_amount || 0);
        if (remainingCharge > 0.00001) {
          const amountToApply = Math.min(remainingAmount, remainingCharge);
          appliedCharges.push({
            id: tx.id,
            amount: amountToApply
          });
          remainingAmount -= amountToApply;
        }
      }
    }

    const totalApplied = appliedCharges.reduce((sum, item) => sum + item.amount, 0);

    return res({
      success: true,
      breakdown: {
        appliedCharges,
        totalApplied,
        unappliedAmount: remainingAmount,
      }
    });
  } catch (error: any) {
    console.error('Error calculating LOC payment breakdown:', error);
    return res({ success: false, error: error.message });
  }
});
