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

    let user: any = { email: 'System', id: null };
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          user = authUser;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return res({ success: false, error: 'Payment ID is required' });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('SupplierPayment')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return res({ success: false, error: 'Payment not found' });
    }

    const { data: supplier } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    const { data: fiscalPeriods } = await supabase.from('FiscalPeriod').select('*');
    const paymentDate = new Date(payment.payment_date);

    const matchingPeriod = (fiscalPeriods || []).find((period: any) => {
      const start = new Date(period.start_date);
      const end = new Date(period.end_date);
      return paymentDate >= start && paymentDate <= end;
    });

    if (matchingPeriod && matchingPeriod.is_closed) {
      return res({ success: false, error: 'Cannot cancel payment in a closed fiscal period.' });
    }

    let linkedAccountId: string | null = null;
    let linkedAccountType: string | null = null;

    if (payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque') {
      const { data: bankTxArr } = await supabase
        .from('BankTransaction')
        .select('*')
        .eq('source_id', payment.id)
        .eq('source_type', 'payment');

      const bankTx = bankTxArr || [];

      if (bankTx && bankTx.length > 0) {
        const tx = bankTx[0];
        if (tx.cleared || tx.reconciled) {
          return res({
            success: false,
            error: 'Cannot cancel payment: The associated bank transaction has been cleared or reconciled.'
          });
        }

        const { error: bankDeleteError } = await supabase
          .from('BankTransaction')
          .delete()
          .eq('id', tx.id);

        if (bankDeleteError) {
          throw new Error(bankDeleteError.message || 'Failed to delete bank transaction');
        }
        linkedAccountId = tx.bank_account_id;
        linkedAccountType = 'bank';
      }
    } else if (payment.payment_method === 'Line of Credit') {
      const { data: locTx } = await supabase
        .from('LinesOfCreditTransaction')
        .select('*')
        .eq('source_id', payment.id)
        .eq('source_type', 'supplier_payment');

      if (locTx && locTx.length > 0) {
        const tx = locTx[0];
        if (tx.payment_amount > 0) {
          return res({
            success: false,
            error: 'Cannot cancel payment: The line of credit transaction has payments applied to it.'
          });
        }

        const { error: locDeleteError } = await supabase
          .from('LinesOfCreditTransaction')
          .delete()
          .eq('id', tx.id);

        if (locDeleteError) {
          throw new Error(locDeleteError.message || 'Failed to delete line of credit transaction');
        }
        linkedAccountId = tx.line_of_credit_id;
        linkedAccountType = 'loc';
      }
    }

    const { data: allSupplierLinesArr } = await supabase
      .from('SupplierInvoiceLine')
      .select('*')
      .eq('supplier_id', payment.supplier_id)
      .order('invoice_date', { ascending: false });

    const allSupplierLines = allSupplierLinesArr || [];
    const lineMap = new Map();

    allSupplierLines.forEach((line: any) => {
      lineMap.set(line.id, {
        ...line,
        _purchase: parseFloat(line.purchase_amount) || 0,
        _gst: parseFloat(line.gst_amount) || 0,
        _paid: parseFloat(line.paid_amount) || 0,
        _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
      });
    });

    let appliedInvoices: any[] = [];
    try {
      const parsed = JSON.parse(payment.invoice_number);
      if (Array.isArray(parsed)) {
        appliedInvoices = parsed;
      } else if (typeof parsed === 'string' && parsed !== 'On Account') {
        appliedInvoices = [{ invoice_number: parsed, amount_applied: payment.amount }];
      }
    } catch {
      if (payment.invoice_number && payment.invoice_number !== 'On Account') {
        appliedInvoices = [{ invoice_number: payment.invoice_number, amount_applied: payment.amount }];
      } else if (payment.invoice_number === 'On Account') {
        appliedInvoices = [{ invoice_number: 'On Account', amount_applied: payment.amount }];
      }
    }

    const updatesToProcess: any[] = [];
    const addUpdate = (line: any) => {
      const existingIndex = updatesToProcess.findIndex((update) => update.id === line.id);
      const newPaid = Math.round(line._paid * 100) / 100;
      if (existingIndex >= 0) {
        updatesToProcess[existingIndex].paid_amount = newPaid;
      } else {
        updatesToProcess.push({ id: line.id, paid_amount: newPaid });
      }
    };

    for (const appliedDetail of appliedInvoices) {
      if (appliedDetail.invoice_number === 'On Account') {
        let amountToReverse = parseFloat(appliedDetail.amount_applied) || 0;
        if (Math.abs(amountToReverse) <= 0.005) continue;

        const isPayment = amountToReverse > 0;
        const candidateLines = Array.from(lineMap.values())
          .filter((line: any) => isPayment ? line._paid > 0.005 : line._paid < -0.005)
          .sort((a: any, b: any) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());

        for (const line of candidateLines) {
          if (isPayment) {
            if (amountToReverse <= 0.005) break;
            const canReverse = Math.min(amountToReverse, (line as any)._paid);
            (line as any)._paid -= canReverse;
            amountToReverse -= canReverse;
            addUpdate(line);
          } else {
            if (amountToReverse >= -0.005) break;
            const canReverse = Math.max(amountToReverse, (line as any)._paid);
            (line as any)._paid -= canReverse;
            amountToReverse -= canReverse;
            addUpdate(line);
          }
        }
      } else {
        const targetInvoiceNumber = String(appliedDetail.invoice_number);
        let amountToReverse = parseFloat(appliedDetail.amount_applied) || 0;

        let invoiceLines = Array.from(lineMap.values())
          .filter((line: any) => String(line.invoice_number) === targetInvoiceNumber);

        if (invoiceLines.length === 0) {
          const { data: fetched } = await supabase
            .from('SupplierInvoiceLine')
            .select('*')
            .eq('supplier_id', payment.supplier_id)
            .eq('invoice_number', targetInvoiceNumber);

          if (fetched && fetched.length > 0) {
            fetched.forEach((line: any) => {
              const processedLine = {
                ...line,
                _purchase: parseFloat(line.purchase_amount) || 0,
                _gst: parseFloat(line.gst_amount) || 0,
                _paid: parseFloat(line.paid_amount) || 0,
                _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
              };
              lineMap.set(line.id, processedLine);
              invoiceLines.push(processedLine);
            });
          }
        }

        invoiceLines.sort((a: any, b: any) => a._paid - b._paid);

        for (const line of invoiceLines) {
          if (Math.abs(amountToReverse) <= 0.005) break;

          const currentPaid = (line as any)._paid;
          let canReverse = 0;

          if (amountToReverse > 0) {
            canReverse = Math.min(amountToReverse, currentPaid);
          } else {
            canReverse = Math.max(amountToReverse, currentPaid);
          }

          if (Math.abs(canReverse) > 0.005) {
            (line as any)._paid -= canReverse;
            amountToReverse -= canReverse;
            addUpdate(line);
          }
        }
      }
    }

    if (updatesToProcess.length > 0) {
      const batchSize = 100;
      for (let index = 0; index < updatesToProcess.length; index += batchSize) {
        const batch = updatesToProcess.slice(index, index + batchSize);
        await Promise.all(batch.map((update) =>
          supabase
            .from('SupplierInvoiceLine')
            .update({
              updated_date: new Date().toISOString(),
              paid_amount: update.paid_amount
            })
            .eq('id', update.id)
        ));
      }
    }

    let creditAccountId = null;
    const paymentAmount = parseFloat(payment.amount) || 0;

    if (linkedAccountType === 'bank' && linkedAccountId) {
      const { data: bank } = await supabase
        .from('BankAccount')
        .select('gl_account')
        .eq('id', linkedAccountId)
        .single();
      creditAccountId = bank?.gl_account;
    } else if (linkedAccountType === 'loc' && linkedAccountId) {
      const { data: loc } = await supabase
        .from('LinesOfCredit')
        .select('gl_account')
        .eq('id', linkedAccountId)
        .single();
      creditAccountId = loc?.gl_account;
    }

    if (creditAccountId) {
      const creatorName = user.user_metadata?.full_name || user.email || user.id;
      const nowIso = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' })).toISOString();
      const reversalDescription = `REVERSAL: Payment to ${supplier ? supplier.name : 'Supplier'}`;

      const { error: glInsertError } = await supabase
        .from('GLTransaction')
        .insert([
          {
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            account_number: creditAccountId,
            transaction_date: payment.payment_date,
            description: reversalDescription,
            debit_amount: paymentAmount > 0 ? paymentAmount : 0,
            credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
            source_type: 'manual',
            source_id: payment.id,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: creatorName,
            created_by_id: user.id,
            updated_by: creatorName
          },
          {
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            account_number: '2000',
            transaction_date: payment.payment_date,
            description: reversalDescription,
            debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
            credit_amount: paymentAmount > 0 ? paymentAmount : 0,
            source_type: 'manual',
            source_id: payment.id,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: creatorName,
            created_by_id: user.id,
            updated_by: creatorName
          }
        ]);

      if (glInsertError) {
        throw new Error(glInsertError.message || 'Failed to create GL reversal transactions');
      }
    }

    const { error: deleteError } = await supabase
      .from('SupplierPayment')
      .delete()
      .eq('id', paymentId);

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to delete supplier payment');
    }

    if (linkedAccountType === 'bank' && linkedAccountId) {
      try {
        await supabase.functions.invoke('autopro-calculateBankBalances', { body: { bankAccountId: linkedAccountId } });
      } catch (invokeError) {
        console.error('Failed to trigger autopro-calculateBankBalances:', invokeError);
      }
    }

    return res({ success: true });
  } catch (error: any) {
    console.error('Error in cancelSupplierPayment:', error);
    return res({ success: false, error: error.message });
  }
});
