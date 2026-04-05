import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { formatInTimeZone } from 'npm:date-fns-tz@3.1.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const body = await req.json();
    const { selectedCalculations } = body;

    if (!selectedCalculations || !Array.isArray(selectedCalculations)) {
      return Response.json({ error: 'selectedCalculations array is required' }, { status: 400 });
    }

    const now = new Date();
    const adjustmentDate = formatInTimeZone(now, 'America/Edmonton', 'yyyy-MM-dd');
    const dateStr = formatInTimeZone(now, 'America/Edmonton', 'yyyyMMdd');
    const nowIso = now.toISOString();

    const adjustmentsToInsert = [];
    const glTransactionsToInsert = [];

    for (const calc of selectedCalculations) {
      const customer = calc.customer;
      
      const adjustmentId = crypto.randomUUID();
      const reference = `INT-${dateStr}-${customer.id.substring(0, 6)}`;
      
      adjustmentsToInsert.push({
        id: adjustmentId,
        customer_id: customer.id,
        adjustment_date: adjustmentDate,
        amount: calc.totalInterest,
        gl_account: '4010',
        description: `Interest charge - 24% APR (${calc.interestDetails.length} item(s))`,
        reference: reference,
        created_date: nowIso,
        updated_date: nowIso,
        created_by: user.email,
        created_by_id: user.id
      });

      const formatCustomerName = (cust) => {
        if (!cust) return '';
        if (cust.org_name) {
          const contactName = [cust.first_name, cust.last_name].filter(Boolean).join(' ');
          return contactName ? `${cust.org_name} (${contactName})` : cust.org_name;
        }
        return [cust.first_name, cust.last_name].filter(Boolean).join(' ');
      };

      const custName = formatCustomerName(customer);

      glTransactionsToInsert.push({
        transaction_date: adjustmentDate,
        account_number: '1100',
        description: `Interest - ${custName}`,
        debit_amount: calc.totalInterest,
        credit_amount: 0,
        reference: reference,
        source_type: 'adjustment',
        source_id: adjustmentId
      });
      
      glTransactionsToInsert.push({
        transaction_date: adjustmentDate,
        account_number: '4010',
        description: `Interest - ${custName}`,
        debit_amount: 0,
        credit_amount: calc.totalInterest,
        reference: reference,
        source_type: 'adjustment',
        source_id: adjustmentId
      });
    }

    // Bulk insert adjustments into Supabase
    if (adjustmentsToInsert.length > 0) {
      const { error: adjError } = await supabase
        .from('CustomerARAdjustment')
        .insert(adjustmentsToInsert);
        
      if (adjError) throw adjError;
    }

    // Create GL transactions in Base44
    if (glTransactionsToInsert.length > 0) {
      // Create in batches to avoid huge payloads if many customers
      const batchSize = 100;
      for (let i = 0; i < glTransactionsToInsert.length; i += batchSize) {
        const batch = glTransactionsToInsert.slice(i, i + batchSize);
        await base44.entities.GLTransaction.bulkCreate(batch);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error applying interest:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});