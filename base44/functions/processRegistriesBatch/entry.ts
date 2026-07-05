import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const REGISTRIES_CUSTOMER_ID = '695627c5aaf0df8c6b8fb427';
const REGISTRIES_SUPPLIER_ID = '694de1b2ec612e85e330ac35';
const CASH_DRAWER_GL = '1010';
const AR_GL = '1100';
const REGISTRIES_PAYABLE_GL = '2050';
const REGISTRIES_COMMISSION_GL = '4101';
const ACCOUNTS_PAYABLE_GL = '2000';

function normalizeAmount(value, fieldName) {
  const num = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[$,]/g, '').trim());
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid amount for ${fieldName}`);
  }
  return Math.round(num * 100) / 100;
}

function normalizeDate(value, fieldName) {
  const clean = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`Invalid date for ${fieldName}. Expected YYYY-MM-DD.`);
  }
  return clean;
}

function normalizeRegistriesPayload(payload) {
  const batchDate = normalizeDate(payload.batchDate, 'batchDate');
  const confirmation = String(payload.confirmation || '').trim();
  if (!confirmation) {
    throw new Error('Missing confirmation in payload.');
  }

  const registriesItems = Array.isArray(payload.registriesItems) ? payload.registriesItems : [];
  const categories = registriesItems
    .map((item, index) => {
      const code = String(item.categoryCode || '').trim().toUpperCase();
      const name = String(item.description || '').trim();
      if (!code) {
        throw new Error(`Missing categoryCode for registriesItems[${index}]`);
      }
      if (!name) {
        throw new Error(`Missing description for registriesItems[${index}]`);
      }
      return {
        code,
        name,
        amount: normalizeAmount(item.amount, `registriesItems[${index}].amount`)
      };
    })
    .filter((item) => item.amount !== 0);

  if (categories.length === 0) {
    throw new Error('No registriesItems with non-zero amounts found in payload.');
  }

  const settlementsInput = Array.isArray(payload.settlements) ? payload.settlements : [];
  const settlements = settlementsInput
    .map((item, index) => ({
      payment_date: normalizeDate(item.payment_date, `settlements[${index}].payment_date`),
      amount: normalizeAmount(item.amount, `settlements[${index}].amount`)
    }))
    .filter((item) => item.amount !== 0);

  return {
    batchDate,
    confirmation,
    categories,
    settlements,
    bankDepositAmount: normalizeAmount(payload.bankDepositAmount || 0, 'bankDepositAmount'),
    totalServiceFees: normalizeAmount(payload.totalServiceFees || 0, 'totalServiceFees'),
    grandTotal: normalizeAmount(payload.grandTotal, 'grandTotal')
  };
}

function buildInvoiceNumber(code, batchDate) {
  if (code === 'MV') {
    return `${code}${batchDate.replace(/-/g, '')}`;
  }

  if (['VS', 'LT', 'PP', 'OT'].includes(code)) {
    const [year, month] = batchDate.split('-');
    return `${code}${month}${year}`;
  }

  return `${code}${batchDate.replace(/-/g, '')}`;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    const providedSecret = req.headers.get('x-registries-batch-secret') || payload.sharedSecret;
    const expectedSecret = Deno.env.get('REGISTRIES_BATCH_SHARED_SECRET');

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const parsed = normalizeRegistriesPayload(payload);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const batchReference = `DEP-${parsed.batchDate.replace(/-/g, '')}`;
    const confirmationReference = parsed.confirmation;

    const auditFields = {
      created_by: 'registries-batch-service',
      created_by_id: 'registries-batch-service',
      updated_by: 'registries-batch-service'
    };

    const glTransactions = [
      {
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...auditFields,
        account_number: AR_GL,
        transaction_date: parsed.batchDate,
        description: `Invoice Total - Registries Batch ${batchReference}`,
        reference: confirmationReference,
        debit_amount: parsed.grandTotal,
        credit_amount: 0,
        source_type: 'manual',
        source_id: confirmationReference
      },
      {
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...auditFields,
        account_number: REGISTRIES_PAYABLE_GL,
        transaction_date: parsed.batchDate,
        description: `Registries Sales - ${batchReference}`,
        reference: confirmationReference,
        debit_amount: 0,
        credit_amount: parsed.categories.reduce((sum, item) => sum + item.amount, 0),
        source_type: 'manual',
        source_id: confirmationReference
      }
    ];

    if (parsed.totalServiceFees !== 0) {
      glTransactions.push({
        id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        ...auditFields,
        account_number: REGISTRIES_COMMISSION_GL,
        transaction_date: parsed.batchDate,
        description: `Registries Commission - ${batchReference}`,
        reference: confirmationReference,
        debit_amount: 0,
        credit_amount: parsed.totalServiceFees,
        source_type: 'manual',
        source_id: confirmationReference
      });
    }

    for (const settlement of parsed.settlements) {
      const paymentCreate = await supabase.from('CustomerPayments').insert({
        id: crypto.randomUUID(),
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
        customer_id: REGISTRIES_CUSTOMER_ID,
        amount: settlement.amount,
        payment_method: 'other',
        notes: 'Registries Settlement/Deposit',
        payment_date: settlement.payment_date,
        reference: confirmationReference
      }).select().single();
      if (paymentCreate.error) throw paymentCreate.error;

      glTransactions.push(
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...auditFields,
          account_number: CASH_DRAWER_GL,
          transaction_date: settlement.payment_date,
          description: `Registries Settlement - ${batchReference}`,
          reference: confirmationReference,
          debit_amount: settlement.amount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: confirmationReference
        },
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...auditFields,
          account_number: AR_GL,
          transaction_date: settlement.payment_date,
          description: `Registries Settlement - ${batchReference}`,
          reference: confirmationReference,
          debit_amount: 0,
          credit_amount: settlement.amount,
          source_type: 'manual',
          source_id: confirmationReference
        }
      );
    }

    if (parsed.bankDepositAmount !== 0) {
      const depositCreate = await supabase.from('CustomerPayments').insert({
        id: crypto.randomUUID(),
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
        customer_id: REGISTRIES_CUSTOMER_ID,
        amount: parsed.bankDepositAmount,
        payment_method: 'other',
        notes: 'Registries Settlement/Deposit',
        payment_date: parsed.batchDate,
        reference: confirmationReference
      }).select().single();
      if (depositCreate.error) throw depositCreate.error;

      glTransactions.push(
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...auditFields,
          account_number: CASH_DRAWER_GL,
          transaction_date: parsed.batchDate,
          description: `Registries Deposit - ${batchReference}`,
          reference: confirmationReference,
          debit_amount: parsed.bankDepositAmount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: confirmationReference
        },
        {
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...auditFields,
          account_number: AR_GL,
          transaction_date: parsed.batchDate,
          description: `Registries Deposit - ${batchReference}`,
          reference: confirmationReference,
          debit_amount: 0,
          credit_amount: parsed.bankDepositAmount,
          source_type: 'manual',
          source_id: confirmationReference
        }
      );
    }

    const now = new Date().toISOString();
    const supplierInvoiceLines = parsed.categories.map((category) => ({
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      created_date: now,
      updated_date: now,
      created_by: 'registries-batch-service',
      created_by_id: 'registries-batch-service',
      gst_amount: null,
      purchase_amount: category.amount,
      paid_amount: 0,
      description: `${category.name} Registries Batch`,
      gst_override: true,
      inventory: false,
      supplier_id: REGISTRIES_SUPPLIER_ID,
      invoice_number: buildInvoiceNumber(category.code, parsed.batchDate),
      gl_account: Number(REGISTRIES_PAYABLE_GL),
      invoice_date: parsed.batchDate,
      inventory_credit: false
    }));

    const supplierInsert = await supabase.from('SupplierInvoiceLine').insert(supplierInvoiceLines).select();
    if (supplierInsert.error) throw supplierInsert.error;

    const insertedSupplierLines = supplierInsert.data || [];
    for (const line of insertedSupplierLines) {
      const baseDescription = `Supplier Inv Line: ${line.description || 'No description'} - Alberta Registries`;
      const reference = confirmationReference;
      const purchaseAmount = normalizeAmount(line.purchase_amount || 0, `supplierInvoiceLine.${line.id}.purchase_amount`);

      if (purchaseAmount !== 0) {
        glTransactions.push(
          {
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...auditFields,
            account_number: REGISTRIES_PAYABLE_GL,
            transaction_date: line.invoice_date,
            description: `${baseDescription} - ${REGISTRIES_PAYABLE_GL} - Alberta Registries Payable`,
            reference,
            debit_amount: purchaseAmount,
            credit_amount: 0,
            source_type: 'supplier_invoice',
            source_id: line.id || ''
          },
          {
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...auditFields,
            account_number: ACCOUNTS_PAYABLE_GL,
            transaction_date: line.invoice_date,
            description: `${baseDescription} - Accounts Payable`,
            reference,
            debit_amount: 0,
            credit_amount: purchaseAmount,
            source_type: 'supplier_invoice',
            source_id: line.id || ''
          }
        );
      }
    }

    const { data: glCreate, error: glInsertError } = await supabase.from('GLTransaction').insert(glTransactions).select();
    if (glInsertError) throw new Error(glInsertError.message);

    return Response.json({
      success: true,
      message: `Imported registries batch with ${supplierInvoiceLines.length} invoice lines, ${parsed.settlements.length + (parsed.bankDepositAmount !== 0 ? 1 : 0)} payments, and ${glCreate?.length || glTransactions.length} GL transactions.`
    });
  } catch (error) {
    console.error('processRegistriesBatch error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});