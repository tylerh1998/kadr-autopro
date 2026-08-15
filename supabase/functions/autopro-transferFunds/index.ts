import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabaseRecordId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

async function checkFiscalPeriodStatus(supabase: any, dateString: string) {
  try {
    if (!dateString) {
      return { isValid: false, message: "No date provided for fiscal period check." };
    }

    const { data: fiscalPeriods, error } = await supabase.from('FiscalPeriod').select('*');
    if (error) {
      console.error('Error checking fiscal period status:', error);
      return { isValid: false, message: "Error checking fiscal period. Please try again." };
    }

    if (!fiscalPeriods || fiscalPeriods.length === 0) {
      return { isValid: false, message: "No fiscal periods have been configured. Please set up fiscal periods in the system." };
    }

    const datePart = dateString.split('T')[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(datePart)) {
      return { isValid: false, message: "Invalid date format provided." };
    }

    const checkDate = new Date(datePart + 'T00:00:00Z');
    if (isNaN(checkDate.getTime())) {
      return { isValid: false, message: "Invalid date format provided." };
    }

    for (const period of fiscalPeriods) {
      const startDate = new Date(period.start_date + 'T00:00:00Z');
      const endDate = new Date(period.end_date + 'T00:00:00Z');

      if (checkDate >= startDate && checkDate <= endDate) {
        if (period.is_closed) {
          return { isValid: false, message: "Date is in a closed fiscal period. No changes can be made." };
        } else {
          return { isValid: true, message: "Date is in an open fiscal period." };
        }
      }
    }

    return { isValid: false, message: "No valid fiscal period found for this date. No changes can be made." };
  } catch (error) {
    console.error('Error checking fiscal period status:', error);
    return { isValid: false, message: "Error checking fiscal period. Please try again." };
  }
}

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
      return res({ success: false, error: 'Supabase configuration is missing' });
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

    const auditUser = user.user_metadata?.full_name || user.email || user.id;
    const getGLAuditFields = () => ({
      created_by: auditUser,
      created_by_id: user.id,
      updated_by: auditUser
    });

    const payload = await req.json();
    const { fromAccountId, toAccountId, amount, transferDate, description } = payload;

    if (!fromAccountId || !toAccountId || !amount || !transferDate) {
      return res({ success: false, error: 'Missing required fields: fromAccountId, toAccountId, amount, transferDate' });
    }

    if (fromAccountId === toAccountId) {
      return res({ success: false, error: 'Source and destination accounts must be different' });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res({ success: false, error: 'Transfer amount must be a positive number' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(transferDate)) {
      return res({ success: false, error: 'Invalid date format. Must be YYYY-MM-DD' });
    }

    const fiscalCheck = await checkFiscalPeriodStatus(supabase, transferDate);
    if (!fiscalCheck.isValid) {
      return res({ success: false, error: 'Fiscal period closed', message: fiscalCheck.message });
    }

    const [fromAccountResult, toAccountResult] = await Promise.all([
      supabase.from('BankAccount').select('*').eq('id', fromAccountId).single(),
      supabase.from('BankAccount').select('*').eq('id', toAccountId).single()
    ]);

    const fromAccount = fromAccountResult.data;
    const toAccount = toAccountResult.data;

    if (!fromAccount || !toAccount) {
      return res({ success: false, error: 'One or both bank accounts not found' });
    }

    if (fromAccount.is_active === false || toAccount.is_active === false) {
      return res({ success: false, error: 'Cannot transfer to/from inactive accounts' });
    }

    if (!fromAccount.gl_account || !toAccount.gl_account) {
      return res({ success: false, error: 'Both accounts must have GL accounts assigned' });
    }

    const transferRef = `TRANSFER-${Date.now()}`;
    const transferDescription = description || `Transfer from ${fromAccount.name} to ${toAccount.name}`;
    const nowIso = new Date().toISOString();

    const { data: fromBankTx, error: fromBankTxError } = await supabase
      .from('BankTransaction')
      .insert({
        id: createSupabaseRecordId(),
        bank_account_id: fromAccountId,
        transaction_date: transferDate,
        description: transferDescription,
        reference: toAccount.name,
        debit_amount: transferAmount,
        credit_amount: 0,
        cleared: false,
        reconciled: false,
        source_type: 'transfer',
        source_id: toAccountId,
        created_date: nowIso,
        updated_date: nowIso
      })
      .select()
      .single();

    if (fromBankTxError) throw new Error(fromBankTxError.message);

    const { data: toBankTx, error: toBankTxError } = await supabase
      .from('BankTransaction')
      .insert({
        id: createSupabaseRecordId(),
        bank_account_id: toAccountId,
        transaction_date: transferDate,
        description: transferDescription,
        reference: fromAccount.name,
        credit_amount: transferAmount,
        debit_amount: 0,
        cleared: false,
        reconciled: false,
        source_type: 'transfer',
        source_id: fromAccountId,
        created_date: nowIso,
        updated_date: nowIso
      })
      .select()
      .single();

    if (toBankTxError) throw new Error(toBankTxError.message);

    const glTransactions = [
      {
        id: createSupabaseRecordId(),
        ...getGLAuditFields(),
        account_number: String(fromAccount.gl_account),
        transaction_date: transferDate,
        description: transferDescription,
        debit_amount: 0,
        credit_amount: transferAmount,
        source_type: 'transfer',
        source_id: fromBankTx.id
      },
      {
        id: createSupabaseRecordId(),
        ...getGLAuditFields(),
        account_number: String(toAccount.gl_account),
        transaction_date: transferDate,
        description: transferDescription,
        debit_amount: transferAmount,
        credit_amount: 0,
        source_type: 'transfer',
        source_id: toBankTx.id
      }
    ];

    const { error: glInsertError } = await supabase
      .from('GLTransaction')
      .insert(glTransactions)
      .select();

    if (glInsertError) throw new Error(glInsertError.message);

    try {
      await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: fromAccountId }
      });
      await supabase.functions.invoke('autopro-calculateBankBalances', {
        body: { bankAccountId: toAccountId }
      });
    } catch (balanceError) {
      console.error('Error recalculating balances:', balanceError);
      // Continue even if balance calculation fails - transactions are already recorded
    }

    return res({
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
    });
  } catch (error: any) {
    console.error('Transfer error:', error);
    return res({
      success: false,
      error: error.message || 'Failed to process transfer',
      details: error.toString()
    });
  }
});
