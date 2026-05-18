import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { transactionId } = await req.json();

    if (!transactionId) {
      return Response.json({ success: false, error: 'transactionId is required' }, { status: 400 });
    }

    const originalPayment = await base44.asServiceRole.entities.LinesOfCreditTransaction.get(transactionId);
    if (!originalPayment) {
      return Response.json({ success: false, error: 'Payment transaction not found' }, { status: 404 });
    }

    if (originalPayment.source_type !== 'payment_made' || !(originalPayment.payment_amount > 0)) {
      return Response.json({ success: false, error: 'Only LOC payment records can be cancelled' }, { status: 400 });
    }

    if (originalPayment.is_reversed === true) {
      return Response.json({ success: false, error: 'This payment has already been cancelled' }, { status: 400 });
    }

    const fiscalCheck = await checkFiscalPeriodStatus(base44, originalPayment.transaction_date);
    if (!fiscalCheck.isValid) {
      return Response.json({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message }, { status: 400 });
    }

    const paymentAmount = Number(originalPayment.payment_amount || 0);
    const paymentDate = originalPayment.transaction_date;
    const targetLoc = await base44.asServiceRole.entities.LinesOfCredit.get(originalPayment.line_of_credit_id);

    if (!targetLoc) {
      return Response.json({ success: false, error: 'Target line of credit account not found' }, { status: 404 });
    }

    if (!targetLoc.gl_account) {
      return Response.json({ success: false, error: 'Target line of credit account is missing a GL account' }, { status: 400 });
    }

    let sourceAccount = null;
    let sourceGLAccount = null;
    let sourceType = null;

    const relatedBankTransactions = await base44.asServiceRole.entities.BankTransaction.filter({
      source_id: originalPayment.id,
      source_type: 'payment_made'
    });

    if (relatedBankTransactions.length > 0) {
      sourceType = 'bank_account';
      sourceAccount = await base44.asServiceRole.entities.BankAccount.get(relatedBankTransactions[0].bank_account_id);
      sourceGLAccount = sourceAccount?.gl_account || null;
    } else {
      const relatedLocTransactions = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
        source_id: originalPayment.line_of_credit_id,
        source_type: 'payment_made'
      });

      const sourceLocTx = relatedLocTransactions.find((tx) => tx.line_of_credit_id === originalPayment.source_id && tx.charge_amount > 0 && tx.is_reversed !== true);

      if (sourceLocTx) {
        sourceType = 'other_line_of_credit';
        sourceAccount = await base44.asServiceRole.entities.LinesOfCredit.get(sourceLocTx.line_of_credit_id);
        sourceGLAccount = sourceAccount?.gl_account || null;
      }
    }

    if (!sourceAccount || !sourceGLAccount) {
      return Response.json({ success: false, error: 'Unable to find the original source account for this payment' }, { status: 400 });
    }

    const appliedData = safeParseJsonArray(originalPayment.payment_applied_data);
    for (const item of appliedData) {
      if (!item?.id || !item?.amount) continue;
      const appliedTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.get(item.id);
      if (!appliedTx) continue;

      const currentPaymentAmount = Number(appliedTx.payment_amount || 0);
      const newPaymentAmount = Math.max(0, currentPaymentAmount - Number(item.amount || 0));
      await base44.asServiceRole.entities.LinesOfCreditTransaction.update(appliedTx.id, {
        payment_amount: newPaymentAmount
      });
    }

    const reversalDescription = `REVERSAL: ${originalPayment.description || `${targetLoc.name} Payment`}`;

    const reversalLocTransaction = await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
      line_of_credit_id: originalPayment.line_of_credit_id,
      transaction_date: paymentDate,
      description: reversalDescription,
      reference: originalPayment.id,
      charge_amount: paymentAmount,
      credit_amount: 0,
      payment_amount: 0,
      source_type: 'manual',
      source_id: originalPayment.id,
      is_reversed: true,
      reversed_by_id: originalPayment.id
    });

    await base44.asServiceRole.entities.LinesOfCreditTransaction.update(originalPayment.id, {
      is_reversed: true,
      reversed_by_id: reversalLocTransaction.id,
      payment_applied_data: originalPayment.payment_applied_data || '[]'
    });

    if (sourceType === 'bank_account') {
      const bankTx = relatedBankTransactions[0];
      await base44.asServiceRole.entities.BankTransaction.create({
        bank_account_id: bankTx.bank_account_id,
        transaction_date: paymentDate,
        description: reversalDescription,
        reference: originalPayment.id,
        debit_amount: 0,
        credit_amount: paymentAmount,
        source_type: 'payment_made',
        source_id: originalPayment.id,
        gl_account: targetLoc.gl_account,
        banktx: false,
        is_reversed: true,
        reversed_by_id: bankTx.id
      });

      await base44.asServiceRole.entities.BankTransaction.update(bankTx.id, {
        is_reversed: true,
        reversed_by_id: reversalLocTransaction.id
      });

      await base44.asServiceRole.functions.invoke('calculateBankBalances', {
        bankAccountId: bankTx.bank_account_id
      });
    }

    if (sourceType === 'other_line_of_credit') {
      const sourceLocTxs = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
        source_id: originalPayment.line_of_credit_id,
        source_type: 'payment_made'
      });
      const sourceLocTx = sourceLocTxs.find((tx) => tx.line_of_credit_id === originalPayment.source_id && tx.charge_amount > 0 && tx.is_reversed !== true);

      if (sourceLocTx) {
        const sourceReversalTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
          line_of_credit_id: sourceLocTx.line_of_credit_id,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          charge_amount: 0,
          credit_amount: paymentAmount,
          payment_amount: 0,
          source_type: 'manual',
          source_id: originalPayment.id,
          is_reversed: true,
          reversed_by_id: sourceLocTx.id
        });

        await base44.asServiceRole.entities.LinesOfCreditTransaction.update(sourceLocTx.id, {
          is_reversed: true,
          reversed_by_id: sourceReversalTx.id
        });

        await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
          lineOfCreditId: sourceLocTx.line_of_credit_id
        });
      }
    }

    const glTransactions = await base44.asServiceRole.entities.GLTransaction.filter({
      source_id: originalPayment.id,
      source_type: 'payment_made'
    });

    if (glTransactions.length > 0) {
      const reversalEntries = glTransactions.map((tx) => ({
        account_number: tx.account_number,
        transaction_date: paymentDate,
        description: reversalDescription,
        reference: originalPayment.id,
        debit_amount: Number(tx.credit_amount || 0),
        credit_amount: Number(tx.debit_amount || 0),
        source_type: 'manual',
        source_id: originalPayment.id
      }));

      await base44.asServiceRole.entities.GLTransaction.bulkCreate(reversalEntries);
    } else {
      await base44.asServiceRole.entities.GLTransaction.bulkCreate([
        {
          account_number: sourceGLAccount,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          debit_amount: paymentAmount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: originalPayment.id
        },
        {
          account_number: targetLoc.gl_account,
          transaction_date: paymentDate,
          description: reversalDescription,
          reference: originalPayment.id,
          debit_amount: 0,
          credit_amount: paymentAmount,
          source_type: 'manual',
          source_id: originalPayment.id
        }
      ]);
    }

    await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
      lineOfCreditId: originalPayment.line_of_credit_id
    });

    return Response.json({
      success: true,
      message: 'Line of credit payment cancelled successfully',
      cancelled_transaction_id: originalPayment.id,
      reversal_transaction_id: reversalLocTransaction.id
    });
  } catch (error) {
    console.error('Error cancelling LOC payment:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

function safeParseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function checkFiscalPeriodStatus(base44, dateString) {
  const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.list();
  if (!fiscalPeriods || fiscalPeriods.length === 0) {
    return { isValid: false, message: 'No fiscal periods have been configured.' };
  }

  const datePart = String(dateString || '').split('T')[0];
  const checkDate = new Date(`${datePart}T00:00:00Z`);
  if (isNaN(checkDate.getTime())) {
    return { isValid: false, message: 'Invalid transaction date.' };
  }

  for (const period of fiscalPeriods) {
    const startDate = new Date(`${period.start_date}T00:00:00Z`);
    const endDate = new Date(`${period.end_date}T00:00:00Z`);
    if (checkDate >= startDate && checkDate <= endDate) {
      if (period.is_closed) {
        return { isValid: false, message: 'Date is in a closed fiscal period. No changes can be made.' };
      }
      return { isValid: true, message: 'Date is in an open fiscal period.' };
    }
  }

  return { isValid: false, message: 'No valid fiscal period found for this date.' };
}