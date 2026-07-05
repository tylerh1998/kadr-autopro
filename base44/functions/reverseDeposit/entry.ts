import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

async function checkFiscalPeriodStatusForDeno(base44Client, dateString) {
  const dateToCheck = new Date(dateString);
  const fiscalPeriods = await base44Client.entities.FiscalPeriod.list();

  const period = fiscalPeriods.find(fp => {
    const startDate = new Date(fp.start_date);
    const endDate = new Date(fp.end_date);
    return dateToCheck >= startDate && dateToCheck <= endDate;
  });

  if (!period) {
    return 'none';
  }

  return period.is_closed ? 'closed' : 'open';
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        const auditUser = user?.full_name || user?.email || 'Unknown User';
        
        const getAuditFields = () => ({
            created_by: auditUser,
            created_by_id: user?.id,
            updated_by: auditUser
        });

        const { bankTransactionId } = await req.json();

        if (!bankTransactionId) {
            return Response.json({ error: 'bankTransactionId is required' }, { status: 400 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseKey = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: 'Supabase configuration is missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });

        const { data: bankTransactionRows, error: bankTransactionError } = await supabase
            .from('BankTransaction')
            .select('*')
            .eq('id', bankTransactionId);

        if (bankTransactionError) {
            throw new Error(bankTransactionError.message);
        }

        const bankTransaction = Array.isArray(bankTransactionRows) ? bankTransactionRows[0] : null;

        if (!bankTransaction) {
            return Response.json({ error: 'Bank transaction not found' }, { status: 404 });
        }

        if (bankTransaction.source_type !== 'deposit') {
            return Response.json({ error: 'Only deposit transactions can be reversed' }, { status: 403 });
        }

        if (bankTransaction.cleared) {
            return Response.json({ error: 'Cannot reverse a cleared bank transaction' }, { status: 403 });
        }
        if (bankTransaction.reconciled) {
            return Response.json({ error: 'Cannot reverse a reconciled bank transaction' }, { status: 403 });
        }

        const periodStatus = await checkFiscalPeriodStatusForDeno(base44, bankTransaction.transaction_date);
        if (periodStatus === 'closed') {
            return Response.json({ error: 'Cannot reverse deposit. The fiscal period for this date is closed.' }, { status: 403 });
        }
        if (periodStatus === 'none') {
            return Response.json({ error: 'Cannot reverse deposit. No fiscal period exists for the deposit date.' }, { status: 403 });
        }

        const depositBatchId = bankTransaction.source_id || bankTransaction.reference;
        const transactionDate = bankTransaction.transaction_date;
        const bankAccountId = bankTransaction.bank_account_id;

        const { data: bankAccountRows, error: bankAccountError } = await supabase
            .from('BankAccount')
            .select('*')
            .eq('id', bankAccountId);

        if (bankAccountError) {
            throw new Error(bankAccountError.message);
        }

        const bankAccount = Array.isArray(bankAccountRows) ? bankAccountRows[0] : null;

        if (!bankAccount) {
            return Response.json({ error: 'Associated bank account not found' }, { status: 404 });
        }

        const { data: originalGLs, error: glFilterError } = await supabase
            .from('GLTransaction')
            .select('*')
            .eq('reference', depositBatchId)
            .eq('source_type', 'deposit');

        if (glFilterError) {
             throw new Error(glFilterError.message);
        }

        if (!originalGLs || originalGLs.length === 0) {
            throw new Error(`No GL transactions found for deposit batch ID: ${depositBatchId}. Cannot reverse an unbalanced deposit.`);
        } else {
            const glsToInsert = originalGLs.map(originalGL => ({
                id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
                account_number: originalGL.account_number,
                transaction_date: transactionDate,
                description: `REVERSAL: ${originalGL.description}`,
                reference: `${depositBatchId}-REVERSAL`,
                debit_amount: originalGL.credit_amount,
                credit_amount: originalGL.debit_amount,
                source_type: 'deposit_reversal',
                source_id: originalGL.id,
                ...getAuditFields()
            }));

            const { error: glInsertError } = await supabase
                .from('GLTransaction')
                .insert(glsToInsert);

            if (glInsertError) {
                throw new Error(glInsertError.message);
            }
        }

        const customerPaymentsRes = await base44.functions.invoke('supabaseCustomerPayments', { action: 'filter', match: { deposit_batch_id: depositBatchId } });
        const customerPayments = customerPaymentsRes?.data?.data || [];

        for (const payment of customerPayments) {
            await base44.functions.invoke('supabaseCustomerPayments', {
                action: 'update',
                id: payment.id,
                data: {
                    deposited: false,
                    deposit_date: null,
                    deposit_batch_id: null
                }
            });
        }

        const { error: updateCashDrawerError } = await supabase
            .from('CashDrawerAdjustment')
            .update({
                deposited: false,
                deposit_date: null,
                deposit_batch_id: null,
                status: 'pending'
            })
            .eq('deposit_batch_id', depositBatchId);

        if (updateCashDrawerError) {
            throw new Error(updateCashDrawerError.message);
        }

        const { error: deleteBankTransactionError } = await supabase
            .from('BankTransaction')
            .delete()
            .eq('id', bankTransactionId);

        if (deleteBankTransactionError) {
            throw new Error(deleteBankTransactionError.message);
        }

        await base44.functions.invoke('calculateBankBalances', {
            bankAccountId: bankAccountId
        });

        return Response.json({ success: true, message: 'Deposit reversed successfully' });

    } catch (error) {
        console.error('Error reversing deposit:', error);
        return Response.json(
            { error: error.message || 'Failed to reverse deposit' },
            { status: 500 }
        );
    }
});