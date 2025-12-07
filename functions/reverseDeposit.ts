import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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

  return period.status;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { bankTransactionId } = await req.json();

        if (!bankTransactionId) {
            return Response.json({ error: 'bankTransactionId is required' }, { status: 400 });
        }

        const bankTransaction = await base44.entities.BankTransaction.get(bankTransactionId);

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

        const depositBatchId = bankTransaction.reference;
        const transactionDate = bankTransaction.transaction_date;
        const bankAccountId = bankTransaction.bank_account_id;

        const bankAccount = await base44.entities.BankAccount.get(bankAccountId);
        if (!bankAccount) {
            return Response.json({ error: 'Associated bank account not found' }, { status: 404 });
        }

        const originalGLs = await base44.entities.GLTransaction.filter({ reference: depositBatchId, source_type: 'deposit' });

        if (originalGLs.length === 0) {
            console.warn(`No GL transactions found for deposit batch ID: ${depositBatchId}. Proceeding with other reversals.`);
        }

        for (const originalGL of originalGLs) {
            await base44.entities.GLTransaction.create({
                account_number: originalGL.account_number,
                transaction_date: transactionDate,
                description: `REVERSAL: ${originalGL.description}`,
                reference: `${depositBatchId}-REVERSAL`,
                debit_amount: originalGL.credit_amount,
                credit_amount: originalGL.debit_amount,
                source_type: 'deposit_reversal',
                source_id: originalGL.id
            });
        }

        const customerPayments = await base44.entities.CustomerPayments.filter({ deposit_batch_id: depositBatchId });
        const cashDrawerAdjustments = await base44.entities.CashDrawerAdjustment.filter({ deposit_batch_id: depositBatchId });

        for (const payment of customerPayments) {
            await base44.entities.CustomerPayments.update(payment.id, {
                deposited: false,
                deposit_date: null,
                deposit_batch_id: null
            });
        }

        for (const adjustment of cashDrawerAdjustments) {
            await base44.entities.CashDrawerAdjustment.update(adjustment.id, {
                deposited: false,
                deposit_date: null,
                deposit_batch_id: null,
                status: 'pending'
            });
        }

        await base44.entities.BankTransaction.delete(bankTransactionId);

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