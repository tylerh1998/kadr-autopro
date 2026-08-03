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
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { searchTerm = '', showOnlyWithBalance = true, asOfDate } = await req.json();

    const cutoffDateString = asOfDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });

    let customerQuery = supabase.from('Customer').select('*');
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      customerQuery = customerQuery.or(`first_name.ilike.%${searchLower}%,last_name.ilike.%${searchLower}%,org_name.ilike.%${searchLower}%,phone.ilike.%${searchLower}%,email.ilike.%${searchLower}%`);
    }

    const { data: customers, error: customersError } = await customerQuery;
    if (customersError) throw customersError;

    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify({ success: true, arSummaryData: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const customerIds = customers.map((c) => c.id);

    const chunkSize = 500;
    let allPayments = [];
    let allAdjustments = [];

    for (let i = 0; i < customerIds.length; i += chunkSize) {
      const chunk = customerIds.slice(i, i + chunkSize);

      const { data: payments, error: paymentsError } = await supabase
        .from('CustomerPayments')
        .select('*')
        .in('customer_id', chunk);
      if (paymentsError) throw paymentsError;
      if (payments) allPayments.push(...payments);

      const { data: adjustments, error: adjustmentsError } = await supabase
        .from('CustomerARAdjustment')
        .select('*')
        .in('customer_id', chunk);
      if (adjustmentsError) throw adjustmentsError;
      if (adjustments) allAdjustments.push(...adjustments);
    }

    const todayTime = new Date(cutoffDateString + "T12:00:00").getTime();

    const arSummaryData = [];

    for (const customer of customers) {
      const customerPayments = allPayments.filter((p) => {
        if (p.customer_id !== customer.id) return false;
        if (!p.payment_date) return true;
        return p.payment_date.slice(0, 10) <= cutoffDateString;
      });

      const customerAdj = allAdjustments.filter((adj) => {
        if (adj.customer_id !== customer.id) return false;
        if (!adj.adjustment_date) return true;
        return adj.adjustment_date.slice(0, 10) <= cutoffDateString;
      });

      const onAccountCharges = customerPayments.filter((p) => p.payment_method === 'on_account');
      const actualPayments = customerPayments.filter((p) => p.ar_pmt && p.payment_method !== 'on_account');

      const totalOnAccountCharges = onAccountCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
      const totalChargeAdjustments = customerAdj.reduce((sum, adj) => {
        if (adj.overpayment) return sum;
        return sum + (adj.amount > 0 ? adj.amount : 0);
      }, 0);
      const totalCharges = totalOnAccountCharges + totalChargeAdjustments;

      const totalActualPayments = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalCreditAdjustments = customerAdj.reduce((sum, adj) => {
        if (adj.overpayment) return sum;
        return sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0);
      }, 0);
      const totalCredits = totalActualPayments + totalCreditAdjustments;

      const total_balance = totalCharges - totalCredits;

      if (showOnlyWithBalance && Math.abs(total_balance) <= 0.01) {
        continue;
      }

      let balance_0_30 = 0;
      let balance_31_60 = 0;
      let balance_60_plus = 0;

      if (total_balance < 0) {
        balance_0_30 = total_balance;
      }

      const chargeItems = [];

      onAccountCharges.forEach((charge) => {
        if (charge.payment_date) {
          const chargeDate = new Date(charge.payment_date.slice(0, 10) + "T12:00:00");
          const daysOld = Math.floor((todayTime - chargeDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysOld < -1) return;
          chargeItems.push({ date: chargeDate, daysOld, amount: charge.amount || 0 });
        }
      });

      customerAdj.forEach((adj) => {
        if (adj.amount > 0 && !adj.overpayment) {
          const adjDate = new Date(adj.adjustment_date.slice(0, 10) + "T12:00:00");
          const daysOld = Math.floor((todayTime - adjDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysOld < -1) return;
          chargeItems.push({ date: adjDate, daysOld, amount: adj.amount || 0 });
        }
      });

      chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());

      let tempCreditsToApply = totalCredits;
      for (const charge of chargeItems) {
        if (tempCreditsToApply > 0) {
          const paidAmount = Math.min(tempCreditsToApply, charge.amount);
          charge.amount -= paidAmount;
          tempCreditsToApply -= paidAmount;
        }
      }

      chargeItems.forEach((item) => {
        if (item.amount <= 0) return;
        if (item.daysOld <= 30) {
          balance_0_30 += item.amount;
        } else if (item.daysOld <= 60) {
          balance_31_60 += item.amount;
        } else {
          balance_60_plus += item.amount;
        }
      });

      arSummaryData.push({
        customer: { ...customer },
        balance_0_30,
        balance_31_60,
        balance_60_plus,
        total_balance,
      });
    }

    return new Response(JSON.stringify({ success: true, arSummaryData }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
