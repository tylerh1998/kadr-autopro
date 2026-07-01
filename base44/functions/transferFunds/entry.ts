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

    // Fetch both bank accounts from Supabase
    const [fromAccountResponse, toAccountResponse] = await Promise.all([
      base44.asServiceRole.functions.invoke('SupabaseProxy', {
        action: 'filter',
        table: 'BankAccount',
        params: { id: fromAccountId }
      }),
      base44.asServiceRole.functions.invoke('SupabaseProxy', {
        action: 'filter',
        table: 'BankAccount',
        params: { id: toAccountId }
      })
    ]);

    const fromAccount = fromAccountResponse?.data?.data?.[0] || fromAccountResponse?.data?.[0] || null;
    const toAccount = toAccountResponse?.data?.data?.[0] || toAccountResponse?.data?.[0] || null;

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

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      );
    }

    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };

    const createGLTransaction = async (transactionData) => {
      const nowIso = getCurrentMountainTimeISO();
      const userDisplay = user.full_name || user.email || user.id;
      const glPayload = {
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        created_date: nowIso,
        updated_date: nowIso,
        created_by: userDisplay,
        created_by_id: user.id,
        updated_by: userDisplay,
        ...transactionData
      };

      const glResponse = await fetch(`${supabaseUrl}/rest/v1/GLTransaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseSecret,
          Authorization: `Bearer ${supabaseSecret}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify(glPayload)
      });

      if (!glResponse.ok) {
        const errorText = await glResponse.text();
        throw new Error(`Failed to create GL transaction: ${glResponse.status} ${errorText}`);
      }

      const glRows = await glResponse.json();
      return Array.isArray(glRows) ? glRows[0] : glRows;
    };

    // Generate a unique transfer reference
    const transferRef = `TRANSFER-${Date.now()}`;
    const transferDescription = description || `Transfer from ${fromAccount.name} to ${toAccount.name}`;

    // Create Bank Transactions in Supabase
    const [fromBankTxResponse, toBankTxResponse] = await Promise.all([
      base44.asServiceRole.functions.invoke('SupabaseProxy', {
        action: 'create',
        table: 'BankTransaction',
        data: {
          bank_account_id: fromAccountId,
          transaction_date: transferDate,
          description: transferDescription,
          reference: toAccount.name,
          debit_amount: transferAmount,
          credit_amount: 0,
          cleared: false,
          reconciled: false,
          source_type: 'transfer',
          source_id: toAccountId
        }
      }),
      base44.asServiceRole.functions.invoke('SupabaseProxy', {
        action: 'create',
        table: 'BankTransaction',
        data: {
          bank_account_id: toAccountId,
          transaction_date: transferDate,
          description: transferDescription,
          reference: fromAccount.name,
          credit_amount: transferAmount,
          debit_amount: 0,
          cleared: false,
          reconciled: false,
          source_type: 'transfer',
          source_id: fromAccountId
        }
      })
    ]);

    const fromBankTx = fromBankTxResponse?.data?.data?.[0] || fromBankTxResponse?.data?.[0] || null;
    const toBankTx = toBankTxResponse?.data?.data?.[0] || toBankTxResponse?.data?.[0] || null;

    // Create GL Transactions
    // 1. Credit the source account's GL (decreases asset)
    await createGLTransaction({
      account_number: String(fromAccount.gl_account),
      transaction_date: transferDate,
      description: transferDescription,
      debit_amount: 0,
      credit_amount: transferAmount,
      source_type: 'transfer',
      source_id: fromBankTx.id
    });

    // 2. Debit the destination account's GL (increases asset)
    await createGLTransaction({
      account_number: String(toAccount.gl_account),
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