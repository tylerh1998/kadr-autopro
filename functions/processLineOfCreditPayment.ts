import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backend function to process line of credit payments
 * Handles creation of LOC transaction, bank/LOC transaction, GL posting, and balance updates
 * 
 * @param {Object} payload
 * @param {string} payload.line_of_credit_id - Line of credit account ID receiving the payment
 * @param {string} payload.payment_date - Payment date (YYYY-MM-DD)
 * @param {number} payload.payment_amount - Payment amount
 * @param {string} payload.payment_method - "bank_account", "cheque", or "other_line_of_credit"
 * @param {string} payload.from_account_id - Source account ID (BankAccount or LinesOfCredit)
 * @param {string} payload.description - Payment description (optional)
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
      line_of_credit_id, 
      payment_date, 
      payment_amount,
      payment_method,
      from_account_id,
      description,
      applied_charges
    } = payload;

    // Validate required fields
    if (!line_of_credit_id) {
      return Response.json({ 
        success: false, 
        error: 'Line of credit ID is required' 
      }, { status: 400 });
    }

    if (!payment_date) {
      return Response.json({ 
        success: false, 
        error: 'Payment date is required' 
      }, { status: 400 });
    }

    if (!payment_amount || parseFloat(payment_amount) <= 0) {
      return Response.json({ 
        success: false, 
        error: 'Payment amount must be greater than 0' 
      }, { status: 400 });
    }

    if (!payment_method) {
      return Response.json({ 
        success: false, 
        error: 'Payment method is required' 
      }, { status: 400 });
    }

    if (!from_account_id) {
      return Response.json({ 
        success: false, 
        error: 'Source account ID is required' 
      }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(payment_date)) {
      return Response.json({ 
        success: false, 
        error: 'Invalid date format. Must be YYYY-MM-DD' 
      }, { status: 400 });
    }

    // Check fiscal period status
    const fiscalCheck = await checkFiscalPeriodStatus(base44, payment_date);
    if (!fiscalCheck.isValid) {
      return Response.json({ 
        success: false, 
        error: 'Fiscal period closed',
        message: fiscalCheck.message
      }, { status: 400 });
    }

    const amountValue = parseFloat(payment_amount);

    // Fetch the line of credit account receiving payment
    const locAccount = await base44.asServiceRole.entities.LinesOfCredit.get(line_of_credit_id);
    if (!locAccount) {
      return Response.json({ 
        success: false, 
        error: 'Line of credit account not found' 
      }, { status: 404 });
    }

    if (!locAccount.gl_account) {
      return Response.json({ 
        success: false, 
        error: 'Line of credit account does not have a GL account configured' 
      }, { status: 400 });
    }

    // Fetch the source account and its GL account
    let sourceAccount;
    let sourceGLAccount;
    let sourceDescription;

    if (payment_method === 'other_line_of_credit') {
      sourceAccount = await base44.asServiceRole.entities.LinesOfCredit.get(from_account_id);
      if (!sourceAccount) {
        return Response.json({ 
          success: false, 
          error: 'Source line of credit account not found' 
        }, { status: 404 });
      }
      sourceGLAccount = sourceAccount.gl_account;
      sourceDescription = sourceAccount.name;
      
      if (!sourceGLAccount) {
        return Response.json({ 
          success: false, 
          error: 'Source line of credit account does not have a GL account configured' 
        }, { status: 400 });
      }
    } else {
      // bank_account or cheque
      sourceAccount = await base44.asServiceRole.entities.BankAccount.get(from_account_id);
      if (!sourceAccount) {
        return Response.json({ 
          success: false, 
          error: 'Source bank account not found' 
        }, { status: 404 });
      }
      sourceGLAccount = sourceAccount.gl_account;
      sourceDescription = sourceAccount.name;
      
      if (!sourceGLAccount) {
        return Response.json({ 
          success: false, 
          error: 'Source bank account does not have a GL account configured' 
        }, { status: 400 });
      }
    }

    // Create the LOC payment transaction (informational record)
    const paymentDescription = description || `${locAccount.name} Payment`;
    const locTransaction = await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
      line_of_credit_id: line_of_credit_id,
      transaction_date: payment_date,
      description: paymentDescription,
      reference: from_account_id,
      charge_amount: 0,
      credit_amount: 0,
      payment_amount: amountValue, // Total payment amount (informational)
      source_type: 'payment_made',
      source_id: from_account_id
    });

    // Update specific charges if provided
    if (applied_charges && Array.isArray(applied_charges) && applied_charges.length > 0) {
      for (const charge of applied_charges) {
        if (charge.id && charge.amount > 0) {
          try {
            // Get current charge transaction to ensure we add to existing payment amount
            const chargeTx = await base44.asServiceRole.entities.LinesOfCreditTransaction.get(charge.id);
            if (chargeTx) {
              const currentPayment = chargeTx.payment_amount || 0;
              await base44.asServiceRole.entities.LinesOfCreditTransaction.update(charge.id, {
                payment_amount: currentPayment + charge.amount
              });
            }
          } catch (err) {
            console.error(`Failed to update charge ${charge.id} with payment:`, err);
          }
        }
      }
    }

    // Create transaction in source account
    if (payment_method === 'other_line_of_credit') {
      // Create a charge on the source LOC
      await base44.asServiceRole.entities.LinesOfCreditTransaction.create({
        line_of_credit_id: from_account_id,
        transaction_date: payment_date,
        description: `Payment to ${locAccount.name}`,
        reference: line_of_credit_id,
        charge_amount: amountValue,
        payment_amount: 0,
        source_type: 'payment_made',
        source_id: line_of_credit_id
      });

      // Update source LOC balance
      const newSourceBalance = (sourceAccount.current_balance || 0) + amountValue;
      await base44.asServiceRole.entities.LinesOfCredit.update(from_account_id, {
        current_balance: newSourceBalance,
        available_credit: (sourceAccount.credit_limit || 0) - newSourceBalance,
        last_recalculated_date: new Date().toISOString()
      });
    } else {
      // Create a debit transaction in the bank account
      await base44.asServiceRole.entities.BankTransaction.create({
        bank_account_id: from_account_id,
        transaction_date: payment_date,
        description: paymentDescription,
        reference: locTransaction.id,
        debit_amount: amountValue,
        credit_amount: 0,
        source_type: 'payment_made',
        source_id: locTransaction.id,
        gl_account: locAccount.gl_account,
        banktx: false
      });

      // Trigger bank balance recalculation
      await base44.asServiceRole.functions.invoke('calculateBankBalances', {
        bankAccountId: from_account_id
      });
    }

    // Create GL transactions
    // Payment to LOC reduces liability:
    //   - Debit: LOC GL Account (decrease liability)
    //   - Credit: Source GL Account (decrease asset or increase liability)

    const glTransactions = [];

    // Debit the LOC account (reducing liability)
    glTransactions.push({
      account_number: locAccount.gl_account,
      transaction_date: payment_date,
      description: paymentDescription,
      reference: locTransaction.id,
      debit_amount: amountValue,
      credit_amount: 0,
      source_type: 'payment_made',
      source_id: locTransaction.id
    });

    // Credit the source account (reducing asset or increasing liability)
    glTransactions.push({
      account_number: sourceGLAccount,
      transaction_date: payment_date,
      description: paymentDescription,
      reference: locTransaction.id,
      debit_amount: 0,
      credit_amount: amountValue,
      source_type: 'payment_made',
      source_id: locTransaction.id
    });

    // Create both GL transactions
    const createdGLTransactions = await base44.asServiceRole.entities.GLTransaction.bulkCreate(glTransactions);

    // Recalculate LOC balance (which will filter out payment_made records from balance calculation)
    await base44.asServiceRole.functions.invoke('calculateLOCBalances', {
      lineOfCreditId: line_of_credit_id
    });

    // Get updated balance for response
    const updatedLOC = await base44.asServiceRole.entities.LinesOfCredit.get(line_of_credit_id);

    return Response.json({
      success: true,
      message: 'Payment processed successfully',
      loc_transaction_id: locTransaction.id,
      gl_transaction_ids: createdGLTransactions.map(tx => tx.id),
      new_loc_balance: updatedLOC.current_balance
    });

  } catch (error) {
    console.error('Error processing LOC payment:', error);
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