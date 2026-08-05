import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Inline replacements for date-fns addDays/differenceInMonths (see calculateARInterest
// port notes) - verified to produce identical output to date-fns@3.6.0 across leap-year,
// short-month, and year-rollover edge cases before this function was deployed.
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const compareAsc = (a: Date, b: Date) => {
  const diff = a.getTime() - b.getTime();
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
};

const differenceInCalendarMonths = (dateLeft: Date, dateRight: Date) =>
  (dateLeft.getFullYear() - dateRight.getFullYear()) * 12 + (dateLeft.getMonth() - dateRight.getMonth());

const isLastDayOfMonth = (date: Date) => {
  const nextDay = new Date(date.getTime());
  nextDay.setDate(date.getDate() + 1);
  return nextDay.getMonth() !== date.getMonth();
};

const differenceInMonths = (dateLeft: Date, dateRight: Date) => {
  const _dateLeft = new Date(dateLeft.getTime());
  const _dateRight = new Date(dateRight.getTime());
  const sign = compareAsc(_dateLeft, _dateRight);
  const difference = Math.abs(differenceInCalendarMonths(_dateLeft, _dateRight));
  let result: number;
  if (difference < 1) {
    result = 0;
  } else {
    if (_dateLeft.getMonth() === 1 && _dateLeft.getDate() > 27) {
      _dateLeft.setDate(30);
    }
    _dateLeft.setMonth(_dateLeft.getMonth() - sign * difference);
    let isLastMonthNotFull = compareAsc(_dateLeft, _dateRight) === -sign;
    if (isLastDayOfMonth(dateLeft) && difference === 1 && compareAsc(dateLeft, _dateRight) === 1) {
      isLastMonthNotFull = false;
    }
    result = sign * (difference - Number(isLastMonthNotFull));
  }
  return result === 0 ? 0 : result;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const res = (data: any) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { customerIds } = body;

    if (!customerIds || !Array.isArray(customerIds)) {
      return res({ success: false, error: 'customerIds array is required' });
    }

    if (customerIds.length === 0) {
      return res({ success: true, data: [] });
    }

    const batchFetch = async (table: string, col: string, ids: string[]) => {
      const chunkSize = 150;
      let allData: any[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase.from(table).select('*').in(col, chunk);
        if (error) throw error;
        if (data) allData = allData.concat(data);
      }
      return allData;
    };

    const customers = await batchFetch('Customer', 'id', customerIds);
    const allPayments = await batchFetch('CustomerPayments', 'customer_id', customerIds);
    const allAdjustments = await batchFetch('CustomerARAdjustment', 'customer_id', customerIds);

    const today = new Date();
    const calculations: any[] = [];

    for (const customer of customers) {
      const payments = allPayments.filter((p: any) => p.customer_id === customer.id);
      const adjustments = allAdjustments.filter((a: any) => a.customer_id === customer.id);

      const onAccountCharges = payments.filter((p: any) => p.payment_method === 'on_account');
      const actualPayments = payments.filter((p: any) => p.ar_pmt && p.payment_method !== 'on_account');

      const chargeItems: any[] = [];

      onAccountCharges.forEach((charge: any) => {
        if (charge.payment_date) {
          let chargeDateStr = charge.payment_date;
          if (!chargeDateStr.includes('T')) chargeDateStr += 'T12:00:00Z';
          const chargeDate = new Date(chargeDateStr);
          const interestStartDate = addDays(chargeDate, 30);

          chargeItems.push({
            date: chargeDate,
            interestStartDate,
            amount: charge.amount || 0,
            description: `Invoice ${charge.invoice_number || 'N/A'}`,
            type: 'charge'
          });
        }
      });

      adjustments.forEach((adj: any) => {
        if (adj.amount > 0) {
          let adjDateStr = adj.adjustment_date;
          if (!adjDateStr.includes('T')) adjDateStr += 'T12:00:00Z';
          const adjDate = new Date(adjDateStr);
          const interestStartDate = addDays(adjDate, 30);

          chargeItems.push({
            date: adjDate,
            interestStartDate,
            amount: adj.amount,
            description: adj.description || 'Adjustment',
            type: 'adjustment'
          });
        }
      });

      chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());

      const totalCredits = actualPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) +
        adjustments.reduce((sum: number, adj: any) => sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0), 0);

      let remainingCredits = totalCredits;
      const outstandingCharges: any[] = [];

      for (const charge of chargeItems) {
        let outstandingAmount = charge.amount;

        if (remainingCredits > 0) {
          const creditApplied = Math.min(remainingCredits, charge.amount);
          outstandingAmount = charge.amount - creditApplied;
          remainingCredits -= creditApplied;
        }

        if (outstandingAmount > 0) {
          outstandingCharges.push({ ...charge, outstandingAmount });
        }
      }

      let totalInterest = 0;
      const interestDetails: any[] = [];

      for (const charge of outstandingCharges) {
        if (today > charge.interestStartDate) {
          const monthsOverdue = differenceInMonths(today, charge.interestStartDate);

          if (monthsOverdue > 0) {
            const monthlyRate = 0.24 / 12;
            const compoundFactor = Math.pow(1 + monthlyRate, monthsOverdue);
            const totalWithInterest = charge.outstandingAmount * compoundFactor;
            const interestAmount = totalWithInterest - charge.outstandingAmount;

            if (interestAmount > 0.01) {
              totalInterest += interestAmount;
              interestDetails.push({
                description: charge.description,
                principal: charge.outstandingAmount,
                monthsOverdue,
                interestAmount,
                interestStartDate: charge.interestStartDate.toISOString()
              });
            }
          }
        }
      }

      if (totalInterest > 0.01) {
        calculations.push({
          customer,
          totalInterest,
          interestDetails,
          currentBalance: outstandingCharges.reduce((sum: number, c: any) => sum + c.outstandingAmount, 0)
        });
      }
    }

    return res({ success: true, data: calculations });
  } catch (error) {
    console.error('Error calculating interest:', error);
    return res({ success: false, error: error.message });
  }
});
