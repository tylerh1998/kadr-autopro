import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { fromAccountId, toAccountId, amount, transferDate, description } = await req.json();

    // Input validation
    if (!fromAccountId || !toAccountId || !amount || !transferDate) {
      return Response.json(
        { error: 'Missing required fields: fromAccountId, toAccountId, amount, transferDate' },
        { status: 400 }
      );
    }

    if (fromAccountId === toAccountId) {
      return Response.json(
        { error: 'Source and destination accounts must be different' },
        { status: 400 }
      );
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return Response.json(
        { error: 'Transfer amount must be a positive number' },
        { status: 400 }
      );
    }

    // Fetch both bank accounts
    const fromAccount = await base44.asServiceRole.entities.BankAccount.get(fromAccountId);
    const toAccount = await base44.asServiceRole.entities.BankAccount.get(toAccountId);

    if (!fromAccount || !toAccount) {
      return Response.json(
        { error: 'One or both bank accounts not found' },
        { status: 404 }
      );
    }

    // Check if accounts are active
    if (fromAccount.is_active === false || toAccount.is_active === false) {
      return Response.json(
        { error: 'Cannot transfer to/from inactive accounts' },
        { status: 400 }
      );
    }

    // Check for GL accounts
    if (!fromAccount.gl_account || !toAccount.gl_account) {
      return Response.json(
        { error: 'Both accounts must have GL accounts assigned' },
        { status: 400 }
      );
    }

    // Generate a unique transfer reference
    const transferRef = `TRANSFER-${Date.now()}`;
    const transferDescription = description || `Transfer from ${fromAccount.name} to ${toAccount.name}`;

    // Create Bank Transactions
    // 1. Debit transaction for source account (withdrawal)
    const fromBankTx = await base44.asServiceRole.entities.BankTransaction.create({
      bank_account_id: fromAccountId,
      transaction_date: transferDate,
      description: transferDescription,
      reference: toAccount.name,
      debit_amount: transferAmount,
      credit_amount: 0,
      cleared: false,
      reconciled: false,
      source_type: 'transfer',
      source_id: toAccountId // Link to destination account
    });

    // 2. Credit transaction for destination account (deposit)
    const toBankTx = await base44.asServiceRole.entities.BankTransaction.create({
      bank_account_id: toAccountId,
      transaction_date: transferDate,
      description: transferDescription,
      reference: fromAccount.name,
      credit_amount: transferAmount,
      debit_amount: 0,
      cleared: false,
      reconciled: false,
      source_type: 'transfer',
      source_id: fromAccountId // Link to source account
    });

    // Create GL Transactions
    // 1. Credit the source account's GL (decreases asset)
    const fromGLTx = await base44.asServiceRole.entities.GLTransaction.create({
      account_number: fromAccount.gl_account,
      transaction_date: transferDate,
      description: transferDescription,
      debit_amount: 0,
      credit_amount: transferAmount,
      source_type: 'transfer',
      source_id: fromBankTx.id
    });

    // 2. Debit the destination account's GL (increases asset)
    const toGLTx = await base44.asServiceRole.entities.GLTransaction.create({
      account_number: toAccount.gl_account,
      transaction_date: transferDate,
      description: transferDescription,
      debit_amount: transferAmount,
      credit_amount: 0,
      source_type: 'transfer',
      source_id: toBankTx.id
    });

    // Update bank account balances using the existing calculateBankBalances function
    try {
      await base44.asServiceRole.functions.invoke('calculateBankBalances', {
        bankAccountId: fromAccountId
      });
      
      await base44.asServiceRole.functions.invoke('calculateBankBalances', {
        bankAccountId: toAccountId
      });
    } catch (balanceError) {
      console.error('Error recalculating balances:', balanceError);
      // Continue even if balance calculation fails - transactions are already recorded
    }

    // Return success response
    return Response.json({
      success: true,
      message: 'Transfer completed successfully',
      transfer: {
        reference: transferRef,
        from: {
          accountId: fromAccountId,
          accountName: fromAccount.name,
          transactionId: fromBankTx.id
        },
        to: {
          accountId: toAccountId,
          accountName: toAccount.name,
          transactionId: toBankTx.id
        },
        amount: transferAmount,
        date: transferDate,
        description: transferDescription
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Transfer error:', error);
    return Response.json(
      { 
        error: 'Failed to process transfer',
        details: error.message 
      },
      { status: 500 }
    );
  }
});