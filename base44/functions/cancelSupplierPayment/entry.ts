import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return Response.json({ success: false, error: 'Payment ID is required' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { data: payment, error: paymentError } = await supabase
      .from('SupplierPayment')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return Response.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    const { data: supplier } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.filter({});
    const paymentDate = new Date(payment.payment_date);

    const matchingPeriod = fiscalPeriods.find((period) => {
      const start = new Date(period.start_date);
      const end = new Date(period.end_date);
      return paymentDate >= start && paymentDate <= end;
    });

    if (matchingPeriod && matchingPeriod.is_closed) {
      return Response.json({ success: false, error: 'Cannot cancel payment in a closed fiscal period.' }, { status: 400 });
    }

    let linkedAccountId = null;
    let linkedAccountType = null;

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
          return Response.json({
            success: false,
            error: 'Cannot cancel payment: The associated bank transaction has been cleared or reconciled.'
          }, { status: 400 });
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
      const locTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
        source_id: payment.id,
        source_type: 'supplier_payment'
      });

      if (locTx && locTx.length > 0) {
        const tx = locTx[0];
        if (tx.payment_amount > 0) {
          return Response.json({
            success: false,
            error: 'Cannot cancel payment: The line of credit transaction has payments applied to it.'
          }, { status: 400 });
        }

        await base44.asServiceRole.entities.LinesOfCreditTransaction.delete(tx.id);
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

    allSupplierLines.forEach((line) => {
      lineMap.set(line.id, {
        ...line,
        _purchase: parseFloat(line.purchase_amount) || 0,
        _gst: parseFloat(line.gst_amount) || 0,
        _paid: parseFloat(line.paid_amount) || 0,
        _total: (parseFloat(line.purchase_amount) || 0) + (parseFloat(line.gst_amount) || 0)
      });
    });

    let appliedInvoices = [];
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

    const updatesToProcess = [];
    const addUpdate = (line) => {
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
          .filter((line) => isPayment ? line._paid > 0.005 : line._paid < -0.005)
          .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));

        for (const line of candidateLines) {
          if (isPayment) {
            if (amountToReverse <= 0.005) break;
            const canReverse = Math.min(amountToReverse, line._paid);
            line._paid -= canReverse;
            amountToReverse -= canReverse;
            addUpdate(line);
          } else {
            if (amountToReverse >= -0.005) break;
            const canReverse = Math.max(amountToReverse, line._paid);
            line._paid -= canReverse;
            amountToReverse -= canReverse;
            addUpdate(line);
          }
        }
      } else {
        const targetInvoiceNumber = String(appliedDetail.invoice_number);
        let amountToReverse = parseFloat(appliedDetail.amount_applied) || 0;

        let invoiceLines = Array.from(lineMap.values())
          .filter((line) => String(line.invoice_number) === targetInvoiceNumber);

        if (invoiceLines.length === 0) {
          const { data: fetched } = await supabase
            .from('SupplierInvoiceLine')
            .select('*')
            .eq('supplier_id', payment.supplier_id)
            .eq('invoice_number', targetInvoiceNumber);

          if (fetched && fetched.length > 0) {
            fetched.forEach((line) => {
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

        invoiceLines.sort((a, b) => a._paid - b._paid);

        for (const line of invoiceLines) {
          if (Math.abs(amountToReverse) <= 0.005) break;

          const currentPaid = line._paid;
          let canReverse = 0;

          if (amountToReverse > 0) {
            canReverse = Math.min(amountToReverse, currentPaid);
          } else {
            canReverse = Math.max(amountToReverse, currentPaid);
          }

          if (Math.abs(canReverse) > 0.005) {
            line._paid -= canReverse;
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
      const loc = await base44.asServiceRole.entities.LinesOfCredit.get(linkedAccountId);
      creditAccountId = loc.gl_account;
    }

    if (creditAccountId) {
      const creatorName = user.User_name || user.full_name || user.email || user.id;
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
      await base44.asServiceRole.functions.invoke('calculateBankBalances', { bankAccountId: linkedAccountId });
    } else if (linkedAccountType === 'loc' && linkedAccountId) {
      await base44.asServiceRole.functions.invoke('calculateLOCBalances', { lineOfCreditId: linkedAccountId });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error in cancelSupplierPayment:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});