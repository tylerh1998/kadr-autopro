import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to process manual line of credit transactions
 * Handles creation of LOC transaction, GL posting, and balance updates
 * 
 * @param {Object} payload
 * @param {string} payload.line_of_credit_id - Line of credit account ID
 * @param {string} payload.transaction_date - Transaction date (YYYY-MM-DD)
 * @param {string} payload.description - Transaction description
 * @param {string} payload.reference - Reference number (optional)
 * @param {string} payload.transaction_type - "charge" or "credit"
 * @param {number} payload.amount - Transaction amount
 * @param {string} payload.offset_gl_account - GL account for offsetting entry
 * @returns {Object} Result with success status and created record IDs
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const payload = await req.json();
    const { 
      id,
      action,
      line_of_credit_id, 
      transaction_date, 
      description, 
      reference,
      transaction_type,
      amount,
      offset_gl_account,
      source_type
    } = payload;

    // Common Validations
    if (action !== 'delete') {
      if (!line_of_credit_id) return Response.json({ success: false, error: 'Line of credit ID is required' }, { status: 400 });
      if (!transaction_date) return Response.json({ success: false, error: 'Transaction date is required' }, { status: 400 });
      if (!description) return Response.json({ success: false, error: 'Description is required' }, { status: 400 });
      if (!transaction_type || !['charge', 'credit'].includes(transaction_type)) return Response.json({ success: false, error: 'Transaction type must be "charge" or "credit"' }, { status: 400 });
      if (!amount || parseFloat(amount) <= 0) return Response.json({ success: false, error: 'Amount must be greater than 0' }, { status: 400 });
      if (!offset_gl_account) return Response.json({ success: false, error: 'Offset GL account is required' }, { status: 400 });

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(transaction_date)) return Response.json({ success: false, error: 'Invalid date format. Must be YYYY-MM-DD' }, { status: 400 });
    }

    // Check fiscal period status for the transaction date (or existing date for delete)
    if (transaction_date) {
      const fiscalCheck = await checkFiscalPeriodStatus(base44, transaction_date);
      if (!fiscalCheck.isValid) return Response.json({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message }, { status: 400 });
    }

    // Handle Edit/Delete
    if (id) {
        const existingTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.get(id);
        if (!existingTx) return Response.json({ success: false, error: 'Transaction not found' }, { status: 404 });

        // Check fiscal period for original date too
        const originalFiscalCheck = await checkFiscalPeriodStatus(base44, existingTx.transaction_date);
        if (!originalFiscalCheck.isValid) return Response.json({ success: false, error: 'Original transaction date is in a closed fiscal period', message: originalFiscalCheck.message }, { status: 400 });

        // Fetch account
        const locAccount = await base44.asServiceRole.entities.LinesOfCredit.get(existingTx.line_of_credit_id);
        if (!locAccount) return Response.json({ success: false, error: 'Line of credit account not found' }, { status: 404 });

        // 1. Delete associated GL transactions
        const existingGLs = await base44.asServiceRole.entities.GLTransaction.filter({ source_id: id });
        if (existingGLs.length > 0) {
            await Promise.all(existingGLs.map(gl => base44.asServiceRole.entities.GLTransaction.delete(gl.id)));
        }

        // 2. Reverse effect on balance
        let currentBalance = locAccount.current_balance || 0;
        // Reversal: Subtract charge, Add credit
        currentBalance = currentBalance - (existingTx.charge_amount || 0) + (existingTx.credit_amount || 0);

        if (action === 'delete') {
            // Delete the transaction
            await base44.asServiceRole.entities.LinesOfCreditTransaction.delete(id);
            
            // Update balance
            await base44.asServiceRole.entities.LinesOfCredit.update(locAccount.id, {
                current_balance: currentBalance,
                available_credit: (locAccount.credit_limit || 0) - currentBalance
            });

            return Response.json({ success: true, message: 'Transaction deleted successfully' });
        } else {
            // Update (Edit)
            const amountValue = parseFloat(amount);
            const charge_amount = transaction_type === 'charge' ? amountValue : 0;
            const credit_amount = transaction_type === 'credit' ? amountValue : 0;
            const payment_amount = 0;

            // Apply new effect
            currentBalance = currentBalance + charge_amount - credit_amount;

            // Update Transaction
            await base44.asServiceRole.entities.LinesOfCreditTransaction.update(id, {
                transaction_date,
                description,
                reference: reference || '',
                charge_amount,
                credit_amount,
                payment_amount,
                balance: currentBalance, // Note: running balance might be inaccurate for surrounding txs, typically requires full recalc. But for this single tx, we set it.
                source_type: source_type || existingTx.source_type
            });

            // Update Account Balance
            await base44.asServiceRole.entities.LinesOfCredit.update(locAccount.id, {
                current_balance: currentBalance,
                available_credit: (locAccount.credit_limit || 0) - currentBalance
            });

            // Create New GL Transactions
             const glTransactions = [];
             if (transaction_type === 'charge') {
                glTransactions.push({
                    account_number: offset_gl_account,
                    transaction_date: transaction_date,
                    description: `LOC Draw: ${description}`,
                    reference: reference || id,
                    debit_amount: amountValue,
                    credit_amount: 0,
                    source_type: 'manual',
                    source_id: id
                });
                glTransactions.push({
                    account_number: locAccount.gl_account,
                    transaction_date: transaction_date,
                    description: `LOC Draw: ${description}`,
                    reference: reference || id,
                    debit_amount: 0,
                    credit_amount: amountValue,
                    source_type: 'manual',
                    source_id: id
                });
            } else {
                glTransactions.push({
                    account_number: locAccount.gl_account,
                    transaction_date: transaction_date,
                    description: `LOC Credit: ${description}`,
                    reference: reference || id,
                    debit_amount: amountValue,
                    credit_amount: 0,
                    source_type: 'manual',
                    source_id: id
                });
                glTransactions.push({
                    account_number: offset_gl_account,
                    transaction_date: transaction_date,
                    description: `LOC Credit: ${description}`,
                    reference: reference || id,
                    debit_amount: 0,
                    credit_amount: amountValue,
                    source_type: 'manual',
                    source_id: id
                });
            }

            await base44.asServiceRole.entities.GLTransaction.bulkCreate(glTransactions);

            return Response.json({ success: true, message: 'Transaction updated successfully' });
        }

    } else {
        // Create (Existing Logic)
        const locAccount = await base44.asServiceRole.entities.LinesOfCredit.get(line_of_credit_id);
        if (!locAccount) return Response.json({ success: false, error: 'Line of credit account not found' }, { status: 404 });
        if (!locAccount.gl_account) return Response.json({ success: false, error: 'Line of credit account does not have a GL account configured' }, { status: 400 });

        const amountValue = parseFloat(amount);
        const charge_amount = transaction_type === 'charge' ? amountValue : 0;
        const credit_amount = transaction_type === 'credit' ? amountValue : 0;
        const payment_amount = 0;

        const currentBalance = locAccount.current_balance || 0;
        const newBalance = currentBalance + charge_amount - credit_amount;

        const locTransaction = await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
            line_of_credit_id: line_of_credit_id,
            transaction_date: transaction_date,
            description: description,
            reference: reference || '',
            charge_amount: charge_amount,
            credit_amount: credit_amount,
            payment_amount: payment_amount,
            balance: newBalance,
            source_type: source_type || 'manual',
            source_id: ''
        });

        await base44.asServiceRole.entities.LinesOfCredit.update(line_of_credit_id, {
            current_balance: newBalance,
            available_credit: (locAccount.credit_limit || 0) - newBalance
        });

        const glTransactions = [];
        if (transaction_type === 'charge') {
            glTransactions.push({
                account_number: offset_gl_account,
                transaction_date: transaction_date,
                description: `LOC Draw: ${description}`,
                reference: reference || locTransaction.id,
                debit_amount: amountValue,
                credit_amount: 0,
                source_type: 'manual',
                source_id: locTransaction.id
            });
            glTransactions.push({
                account_number: locAccount.gl_account,
                transaction_date: transaction_date,
                description: `LOC Draw: ${description}`,
                reference: reference || locTransaction.id,
                debit_amount: 0,
                credit_amount: amountValue,
                source_type: 'manual',
                source_id: locTransaction.id
            });
        } else {
            glTransactions.push({
                account_number: locAccount.gl_account,
                transaction_date: transaction_date,
                description: `LOC Credit: ${description}`,
                reference: reference || locTransaction.id,
                debit_amount: amountValue,
                credit_amount: 0,
                source_type: 'manual',
                source_id: locTransaction.id
            });
            glTransactions.push({
                account_number: offset_gl_account,
                transaction_date: transaction_date,
                description: `LOC Credit: ${description}`,
                reference: reference || locTransaction.id,
                debit_amount: 0,
                credit_amount: amountValue,
                source_type: 'manual',
                source_id: locTransaction.id
            });
        }

        const createdGLTransactions = await base44.asServiceRole.entities.GLTransaction.bulkCreate(glTransactions);

        return Response.json({
            success: true,
            message: 'Transaction processed successfully',
            loc_transaction_id: locTransaction.id,
            gl_transaction_ids: createdGLTransactions.map(tx => tx.id),
            new_balance: newBalance
        });
    }

  } catch (error) {
    console.error('Error processing LOC transaction:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: error.toString()
    }, { status: 500 });
  }
});

/**
 * Helper function to check fiscal period status
 * @param {Object} base44 - Base44 SDK instance
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function checkFiscalPeriodStatus(base44, dateString) {
  try {
    if (!dateString) {
      return {
        isValid: false,
        message: "No date provided for fiscal period check."
      };
    }

    const fiscalPeriods = await base44.asServiceRole.entities.FiscalPeriod.list();
    
    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return {
        isValid: false,
        message: "No fiscal periods have been configured. Please set up fiscal periods in the system."
      };
    }
    
    const datePart = dateString.split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    const checkDate = new Date(datePart + 'T00:00:00Z');
    
    if (isNaN(checkDate.getTime())) {
      return {
        isValid: false,
        message: "Invalid date format provided."
      };
    }
    
    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');
      
      if (checkDate >= startDate && checkDate <= endDate) {
        if (period.is_closed) {
          return {
            isValid: false,
            message: "Date is in a closed fiscal period. No changes can be made."
          };
        } else {
          return {
            isValid: true,
            message: "Date is in an open fiscal period."
          };
        }
      }
    }
    
    return {
      isValid: false,
      message: "No valid fiscal period found for this date. No changes can be made."
    };
    
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return {
      isValid: false,
      message: "Error checking fiscal period. Please try again."
    };
  }
}