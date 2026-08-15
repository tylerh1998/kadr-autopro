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

    const { supplierId, paymentAmount } = await req.json();

    if (!supplierId) {
      return res({ success: false, error: 'Supplier ID is required' });
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount)) {
      return res({ success: false, error: 'Invalid payment amount' });
    }

    const { data: allLinesArr } = await supabase.from('SupplierInvoiceLine')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('invoice_date', { ascending: false })
      .limit(2500);

    const allLines = allLinesArr || [];

    // Filter for open items and calculate balances
    const openItems = allLines.map((line: any) => {
      const purchase = parseFloat(line.purchase_amount) || 0;
      const gst = parseFloat(line.gst_amount) || 0;
      const paid = parseFloat(line.paid_amount) || 0;
      const total = purchase + gst;
      const balance = total - paid;

      return {
        ...line,
        _total: total,
        _paid: paid,
        _balance: balance
      };
    }).filter((item: any) => Math.abs(item._balance) > 0.005);

    // Sort oldest first (both credits and debits mixed)
    openItems.sort((a: any, b: any) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime());

    const appliedInvoices = [];
    let remainingAmount = amount;

    // Iterate sequentially through sorted items
    for (const item of openItems) {
      if (Math.abs(remainingAmount) <= 0.005) break;

      let amountToApply = 0;

      if (amount > 0) {
        // Positive Payment Mode (We are paying supplier)
        if (item._balance > 0.005) {
          // Invoice (Positive Balance): Pay it down
          amountToApply = Math.min(remainingAmount, item._balance);
        } else if (item._balance < -0.005) {
          // Credit (Negative Balance): Settle it
          amountToApply = item._balance;
        }
      } else {
        // Negative Payment Mode (Refund / Reversal)
        if (item._balance < -0.005) {
          // Credit (Negative Balance): Reduce credit (move closer to 0)
          amountToApply = Math.max(remainingAmount, item._balance);
        } else if (item._balance > 0.005) {
          // Invoice (Positive Balance): Reverse payment / Increase debt
          const paid = item._paid || 0;
          if (paid > 0.005) {
            amountToApply = Math.max(remainingAmount, -paid);
          }
        }
      }

      if (Math.abs(amountToApply) > 0.005) {
        appliedInvoices.push({
          invoice_number: item.invoice_number,
          amount_applied: amountToApply,
          id: item.id,
          original_balance: item._balance,
          invoice_date: item.invoice_date
        });

        remainingAmount -= amountToApply;
      }
    }

    // If there is still remaining amount, it means overpayment (or unapplied refund)
    let unappliedAmount = 0;
    if (Math.abs(remainingAmount) > 0.005) {
      unappliedAmount = remainingAmount;
    }

    return res({
      success: true,
      breakdown: {
        appliedInvoices,
        unappliedAmount,
        totalApplied: appliedInvoices.reduce((sum, item) => sum + item.amount_applied, 0)
      }
    });
  } catch (error: any) {
    console.error('Error in calculateSupplierPaymentBreakdown:', error);
    return res({ success: false, error: error.message });
  }
});
