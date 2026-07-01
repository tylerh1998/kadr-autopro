import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getMountainTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset'
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  const second = parts.find((part) => part.type === 'second')?.value;
  const offsetLabel = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT-00:00';
  const offset = offsetLabel.replace('GMT', '');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let paymentId = null;

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    paymentId = payload.paymentId;

    if (!paymentId) {
      return Response.json({ success: false, error: 'No paymentId provided' }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const startedAt = Date.now();
    const userDisplay = user.full_name || user.email || user.id;

    const createGlTransaction = async ({
      account_number,
      transaction_date,
      description,
      debit_amount,
      credit_amount,
      source_type,
      source_id
    }) => {
      const nowIso = getMountainTimestamp();
      const glTransactionId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      const { error } = await supabase
        .from('GLTransaction')
        .insert([{
          id: glTransactionId,
          created_date: nowIso,
          updated_date: nowIso,
          created_by: userDisplay,
          created_by_id: user.id,
          updated_by: userDisplay,
          account_number,
          transaction_date,
          description,
          debit_amount,
          credit_amount,
          source_type,
          source_id
        }]);

      if (error) {
        throw new Error(`Failed to create GL transaction: ${error.message}`);
      }
    };

    const { data: payment, error: paymentError } = await supabase
      .from('SupplierPayment')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error('Supplier payment not found');
    }

    if (payment.status === 'completed') {
      return Response.json({ success: true, skipped: true });
    }

    await supabase
      .from('SupplierPayment')
      .update({
        status: 'processing',
        error_message: null,
        updated_date: new Date().toISOString()
      })
      .eq('id', paymentId);

    const supplierFetchStartedAt = Date.now();
    const { data: supplier, error: supplierError } = await supabase
      .from('Supplier')
      .select('*')
      .eq('id', payment.supplier_id)
      .single();

    if (supplierError || !supplier) {
      throw new Error('Supplier not found');
    }

    console.info('[executeSupplierPayment] supplier_fetch_ms:', Date.now() - supplierFetchStartedAt);

    const paymentAmount = parseFloat(payment.amount) || 0;
    const paymentMethod = payment.payment_method;
    const fromAccountId = payment.source;
    const paymentDate = payment.payment_date;
    const chequeNumber = payment.cheque_number;

    const bankGlStartedAt = Date.now();

    if (paymentMethod === 'Bank Account' || paymentMethod === 'Cheque') {
      const { data: selectedBankRows, error: selectedBankError } = await supabase
        .from('BankAccount')
        .select('*')
        .eq('id', fromAccountId);

      if (selectedBankError) {
        throw new Error(`Failed to load bank account: ${selectedBankError.message}`);
      }

      const selectedBank = Array.isArray(selectedBankRows) ? selectedBankRows[0] : null;

      if (selectedBank) {
        const { data: existingBankTransactionRows, error: existingBankTransactionError } = await supabase
          .from('BankTransaction')
          .select('id')
          .eq('bank_account_id', selectedBank.id)
          .eq('source_type', 'payment')
          .eq('source_id', paymentId)
          .limit(1);

        if (existingBankTransactionError) {
          throw new Error(`Failed to check existing bank transaction: ${existingBankTransactionError.message}`);
        }

        const existingBankTransaction = Array.isArray(existingBankTransactionRows) ? existingBankTransactionRows[0] : null;

        if (!existingBankTransaction) {
          const bankTransactionId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          const bankTransactionTimestamp = getMountainTimestamp();

          const { error: bankTransactionError } = await supabase
            .from('BankTransaction')
            .insert([{
              id: bankTransactionId,
              created_date: bankTransactionTimestamp,
              updated_date: bankTransactionTimestamp,
              created_by: user.email,
              bank_account_id: selectedBank.id,
              transaction_date: paymentDate,
              description: `Payment to ${supplier.name}${chequeNumber ? ` - Cheque #${chequeNumber}` : ''}`,
              debit_amount: paymentAmount > 0 ? paymentAmount : 0,
              credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
              source_type: 'payment',
              source_id: paymentId
            }]);

          if (bankTransactionError) {
            throw new Error(`Failed to create bank transaction: ${bankTransactionError.message}`);
          }
        }

        const { data: balanceTransactions, error: balanceTransactionsError } = await supabase
          .from('BankTransaction')
          .select('credit_amount, debit_amount, is_reversed')
          .eq('bank_account_id', selectedBank.id)
          .order('transaction_date', { ascending: true });

        if (balanceTransactionsError) {
          throw new Error(`Failed to recalculate bank balance: ${balanceTransactionsError.message}`);
        }

        let runningBalance = 0;
        for (const transaction of balanceTransactions || []) {
          if (transaction.is_reversed === true) continue;
          const credit = Number(transaction.credit_amount) || 0;
          const debit = Number(transaction.debit_amount) || 0;
          runningBalance += credit - debit;
        }

        const lastRecalculatedAt = getMountainTimestamp();
        const { error: recalculateBankError } = await supabase
          .from('BankAccount')
          .update({
            current_balance: runningBalance,
            last_recalculated_date: lastRecalculatedAt
          })
          .eq('id', selectedBank.id);

        if (recalculateBankError) {
          throw new Error(`Failed to update bank balance: ${recalculateBankError.message}`);
        }

        if (chequeNumber) {
          const { error: updateBankError } = await supabase
            .from('BankAccount')
            .update({
              next_cheque_number: parseInt(chequeNumber, 10) + 1
            })
            .eq('id', selectedBank.id);

          if (updateBankError) {
            throw new Error(`Failed to update next cheque number: ${updateBankError.message}`);
          }
        }

        await createGlTransaction({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await createGlTransaction({
          account_number: selectedBank.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          credit_amount: paymentAmount > 0 ? paymentAmount : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });
      }
    } else if (paymentMethod === 'Line of Credit') {
      const selectedLOC = await base44.asServiceRole.entities.LinesOfCredit.get(fromAccountId);

      if (selectedLOC) {
        await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
          line_of_credit_id: selectedLOC.id,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          charge_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          payment_amount: 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
          lineOfCreditId: selectedLOC.id
        });

        await createGlTransaction({
          account_number: '2000',
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount > 0 ? paymentAmount : 0,
          credit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });

        await createGlTransaction({
          account_number: selectedLOC.gl_account,
          transaction_date: paymentDate,
          description: `Payment to ${supplier.name}`,
          debit_amount: paymentAmount < 0 ? Math.abs(paymentAmount) : 0,
          credit_amount: paymentAmount > 0 ? paymentAmount : 0,
          source_type: 'supplier_payment',
          source_id: paymentId
        });
      }
    }

    console.info('[executeSupplierPayment] bank_gl_ms:', Date.now() - bankGlStartedAt);

    await supabase
      .from('SupplierPayment')
      .update({
        status: 'completed',
        error_message: null,
        updated_date: new Date().toISOString()
      })
      .eq('id', paymentId);

    console.info('[executeSupplierPayment] total_ms:', Date.now() - startedAt);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error in executeSupplierPayment:', error);

    if (paymentId) {
      try {
        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (supabaseUrl && supabaseSecret) {
          const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
          await supabase
            .from('SupplierPayment')
            .update({
              status: 'failed',
              error_message: error.message || 'Unknown error during background processing',
              updated_date: new Date().toISOString()
            })
            .eq('id', paymentId);
        }
      } catch (statusError) {
        console.error('Failed to update payment status to failed:', statusError);
      }
    }

    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});