import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { addDays, differenceInMonths } from 'npm:date-fns@3.6.0';

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
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const body = await req.json();
    const { customerIds } = body;

    if (!customerIds || !Array.isArray(customerIds)) {
      return Response.json({ error: 'customerIds array is required' }, { status: 400 });
    }

    if (customerIds.length === 0) {
      return Response.json({ data: [] });
    }

    const batchFetch = async (table, col, ids) => {
      const chunkSize = 150;
      let allData = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase.from(table).select('*').in(col, chunk);
        if (error) throw error;
        if (data) allData = allData.concat(data);
      }
      return allData;
    };

    // Fetch data
    const customers = await batchFetch('Customer', 'id', customerIds);
    const allPayments = await batchFetch('CustomerPayments', 'customer_id', customerIds);
    const allAdjustments = await batchFetch('CustomerARAdjustment', 'customer_id', customerIds);

    const today = new Date();
    const calculations = [];

    // Group by customer
    for (const customer of customers) {
      const payments = allPayments.filter(p => p.customer_id === customer.id);
      const adjustments = allAdjustments.filter(a => a.customer_id === customer.id);

      const onAccountCharges = payments.filter(p => p.payment_method === 'on_account');
      const actualPayments = payments.filter(p => p.ar_pmt && p.payment_method !== 'on_account');

      const chargeItems = [];
      
      onAccountCharges.forEach(charge => {
        if (charge.payment_date) {
          let chargeDateStr = charge.payment_date;
          if (!chargeDateStr.includes('T')) chargeDateStr += 'T12:00:00Z'; 
          const chargeDate = new Date(chargeDateStr);
          const gracePeriodEnd = addDays(chargeDate, 30);
          const interestStartDate = gracePeriodEnd;
          
          chargeItems.push({
            date: chargeDate,
            interestStartDate,
            amount: charge.amount || 0,
            description: `Invoice ${charge.invoice_number || 'N/A'}`,
            type: 'charge'
          });
        }
      });

      adjustments.forEach(adj => {
        if (adj.amount > 0) {
          let adjDateStr = adj.adjustment_date;
          if (!adjDateStr.includes('T')) adjDateStr += 'T12:00:00Z';
          const adjDate = new Date(adjDateStr);
          const gracePeriodEnd = addDays(adjDate, 30);
          const interestStartDate = gracePeriodEnd;
          
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

      const totalCredits = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0) +
                         adjustments.reduce((sum, adj) => sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0), 0);

      let remainingCredits = totalCredits;
      const outstandingCharges = [];

      for (const charge of chargeItems) {
        let outstandingAmount = charge.amount;
        
        if (remainingCredits > 0) {
          const creditApplied = Math.min(remainingCredits, charge.amount);
          outstandingAmount = charge.amount - creditApplied;
          remainingCredits -= creditApplied;
        }
        
        if (outstandingAmount > 0) {
          outstandingCharges.push({
            ...charge,
            outstandingAmount
          });
        }
      }

      let totalInterest = 0;
      const interestDetails = [];

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
          currentBalance: outstandingCharges.reduce((sum, c) => sum + c.outstandingAmount, 0)
        });
      }
    }

    return Response.json({ data: calculations });
  } catch (error) {
    console.error('Error calculating interest:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});