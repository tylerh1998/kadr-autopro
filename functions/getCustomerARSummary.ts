import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchTerm = '', showOnlyWithBalance = true, asOfDate } = await req.json();

    // Fetch all necessary data
    const [allCustomers, allPayments, allAdjustments] = await Promise.all([
      base44.entities.Customer.list(),
      base44.entities.CustomerPayments.list(),
      base44.entities.CustomerARAdjustment.list(),
    ]);

    // Filter customers by search term
    const searchLower = searchTerm.toLowerCase();
    const filteredCustomers = allCustomers.filter(customer => {
      if (!searchTerm) return true;
      const firstName = customer.first_name?.toLowerCase() || '';
      const lastName = customer.last_name?.toLowerCase() || '';
      const orgName = customer.org_name?.toLowerCase() || '';
      const phone = customer.phone?.toLowerCase() || '';
      const email = customer.email?.toLowerCase() || '';
      return firstName.includes(searchLower) || 
             lastName.includes(searchLower) || 
             orgName.includes(searchLower) ||
             phone.includes(searchLower) ||
             email.includes(searchLower);
    });

    const targetDateStr = asOfDate || new Date().toISOString().substring(0, 10);
    const today = new Date(targetDateStr);
    const arSummaryData = [];

    // Calculate aged balances for each customer
    for (const customer of filteredCustomers) {
      // Filter payments and adjustments by the As Of Date
      const customerPayments = allPayments.filter(p => 
        p.customer_id === customer.id && 
        (!p.payment_date || p.payment_date.substring(0, 10) <= targetDateStr)
      );
      const customerAdj = allAdjustments.filter(adj => 
        adj.customer_id === customer.id && 
        (!adj.adjustment_date || adj.adjustment_date.substring(0, 10) <= targetDateStr)
      );

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
          const chargeDate = new Date(charge.payment_date);
          const daysOld = Math.floor((today.getTime() - chargeDate.getTime()) / (1000 * 60 * 60 * 24));
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
          const adjDate = new Date(adj.adjustment_date);
          const daysOld = Math.floor((today.getTime() - adjDate.getTime()) / (1000 * 60 * 60 * 24));
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
    console.error('Error in getCustomerARSummary:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});