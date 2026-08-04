import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const { searchTerm = '', showOnlyWithBalance = true, asOfDate } = await req.json();

    // Determine cutoff date (inclusive). Default to Mountain Time today if not provided.
    const cutoffDateString = asOfDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
    
    // Fetch customers matching search
    let customerQuery = supabase.from('Customer').select('*');
    if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        customerQuery = customerQuery.or(`first_name.ilike.%${searchLower}%,last_name.ilike.%${searchLower}%,org_name.ilike.%${searchLower}%,phone.ilike.%${searchLower}%,email.ilike.%${searchLower}%`);
    }

    const { data: customers, error: customersError } = await customerQuery;
    if (customersError) throw customersError;

    if (!customers || customers.length === 0) {
      return Response.json({ success: true, arSummaryData: [] });
    }

    const customerIds = customers.map(c => c.id);
    
    const chunkSize = 500;
    let allPayments = [];
    let allAdjustments = [];
    
    // Fetch related records in chunks to avoid URL too long errors
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

    // Force the time to noon to avoid timezone edge cases with strictly midnight dates
    const todayTime = new Date(cutoffDateString + "T12:00:00").getTime();

    const arSummaryData = [];

    // Calculate aged balances for each customer
    for (const customer of customers) {
      // Filter payments and adjustments by the As Of Date
      const customerPayments = allPayments.filter(p => {
        if (p.customer_id !== customer.id) return false;
        if (!p.payment_date) return true; // Include if no date
        return p.payment_date.slice(0, 10) <= cutoffDateString;
      });

      const customerAdj = allAdjustments.filter(adj => {
        if (adj.customer_id !== customer.id) return false;
        if (!adj.adjustment_date) return true; // Include if no date
        return adj.adjustment_date.slice(0, 10) <= cutoffDateString;
      });

      // Separate payments into charges ('on_account') and actual payments
      const onAccountCharges = customerPayments.filter(p => p.payment_method === 'on_account');
      const actualPayments = customerPayments.filter(p => p.ar_pmt && p.payment_method !== 'on_account');
      
      // Calculate total charges: sum of 'On Account' payments + positive adjustments (excluding overpayment adjustments)
      const totalOnAccountCharges = onAccountCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
      const totalChargeAdjustments = customerAdj.reduce((sum, adj) => {
        if (adj.overpayment) return sum; // Exclude overpayment adjustments
        return sum + (adj.amount > 0 ? adj.amount : 0);
      }, 0);
      const totalCharges = totalOnAccountCharges + totalChargeAdjustments;
      
      // Calculate total credits: sum of actual AR payments + negative adjustments (excluding overpayment adjustments)
      const totalActualPayments = actualPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalCreditAdjustments = customerAdj.reduce((sum, adj) => {
        if (adj.overpayment) return sum; // Exclude overpayment adjustments
        return sum + (adj.amount < 0 ? Math.abs(adj.amount) : 0);
      }, 0);
      const totalCredits = totalActualPayments + totalCreditAdjustments;
      
      // Net balance
      const total_balance = totalCharges - totalCredits;
      
      // Skip customers with no balance if filter is enabled
      if (showOnlyWithBalance && Math.abs(total_balance) <= 0.01) {
        continue;
      }

      // Calculate aging - distribute the remaining balance across age buckets
      let balance_0_30 = 0;
      let balance_31_60 = 0;
      let balance_60_plus = 0;

      // If balance is negative (credit), put it all in 0-30 bucket
      if (total_balance < 0) {
        balance_0_30 = total_balance;
      }

      // Create a list of all charge items with their dates
      const chargeItems = [];
            
      // Add on_account charges
      onAccountCharges.forEach(charge => {
        if (charge.payment_date) {
          const chargeDate = new Date(charge.payment_date.slice(0, 10) + "T12:00:00");
          // Calculate days old. If chargeDate > today, daysOld will be negative.
          const daysOld = Math.floor((todayTime - chargeDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysOld < -1) return; // Allow small tolerance (-1) for same-day timezone differences

          chargeItems.push({
            date: chargeDate,
            daysOld,
            amount: charge.amount || 0
          });
        }
      });
      
      // Add positive adjustments (excluding overpayment adjustments)
      customerAdj.forEach(adj => {
        if (adj.amount > 0 && !adj.overpayment) {
          const adjDate = new Date(adj.adjustment_date.slice(0, 10) + "T12:00:00");
          const daysOld = Math.floor((todayTime - adjDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysOld < -1) return;

          chargeItems.push({
            date: adjDate,
            daysOld,
            amount: adj.amount || 0
          });
        }
      });
      
      // Sort by date (oldest first) to apply payments correctly for aging
      chargeItems.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      // Apply credits to oldest charges first
      let tempCreditsToApply = totalCredits;

      for (const charge of chargeItems) {
        if (tempCreditsToApply > 0) {
          const paidAmount = Math.min(tempCreditsToApply, charge.amount);
          charge.amount -= paidAmount;
          tempCreditsToApply -= paidAmount;
        }
      }
      
      // Distribute remaining charge amounts across age buckets
      chargeItems.forEach(item => {
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

    return Response.json({
      success: true,
      arSummaryData
    });

  } catch (error) {
    console.error('Error in supabaseCustomerARSummary:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});