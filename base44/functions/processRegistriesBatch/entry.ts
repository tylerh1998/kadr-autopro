import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const REGISTRIES_CUSTOMER_ID = '695627c5aaf0df8c6b8fb427';
const REGISTRIES_SUPPLIER_ID = '694de1b2ec612e85e330ac35';
const CASH_DRAWER_GL = '1010';
const AR_GL = '1100';
const REGISTRIES_PAYABLE_GL = '2050';
const REGISTRIES_COMMISSION_GL = '4101';

const CATEGORY_CODES = {
  'Motor Vehicles': 'MV',
  'Vital Statistics': 'VS',
  'Land Titles': 'LT',
  'Corporate Registries': 'CR',
  'APPRES': 'AP',
  'Other': 'OT'
};

function toMountainDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseBatchDate(value) {
  const clean = String(value || '').trim();
  const [day, mon, yy] = clean.split('-');
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return `${year}-${months[mon]}-${String(day).padStart(2, '0')}`;
}

function parseBracketDate(label) {
  const match = label.match(/\(([^)]+)\)/);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return toMountainDateParts(parsed);
}

function parseAmount(value) {
  const num = parseFloat(String(value || '').replace(/[$,]/g, '').trim());
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function parseRegistriesCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let batchDate = null;
  const categories = [];
  const settlements = [];
  let bankDepositAmount = 0;
  let totalServiceFees = 0;
  let grandTotal = 0;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const left = cols[0] || '';
    const right = cols[1] || '';

    if (left === 'Batch Date') {
      batchDate = parseBatchDate(right);
      continue;
    }

    if (CATEGORY_CODES[left]) {
      const amount = parseAmount(right);
      if (amount !== 0) {
        categories.push({ name: left, code: CATEGORY_CODES[left], amount });
      }
      continue;
    }

    if (left === 'Total Service Fees') {
      totalServiceFees = parseAmount(right);
      continue;
    }

    if (left === 'Grand Total') {
      grandTotal = parseAmount(right);
      continue;
    }

    if (left.startsWith('Card Settlement (')) {
      const paymentDate = parseBracketDate(left);
      const amount = parseAmount(right);
      if (paymentDate && amount !== 0) {
        settlements.push({ label: left, payment_date: paymentDate, amount });
      }
      continue;
    }

    if (left === 'Bank Deposit Amount') {
      bankDepositAmount = parseAmount(right);
    }
  }

  if (!batchDate) throw new Error('Batch Date not found in CSV.');
  if (categories.length === 0) throw new Error('No registries category amounts found in CSV.');

  return { batchDate, categories, settlements, bankDepositAmount, totalServiceFees, grandTotal };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { csvText } = await req.json();
    const parsed = parseRegistriesCsv(csvText);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const batchReference = `DEP-${parsed.batchDate.replace(/-/g, '')}`;

    const glTransactions = [
      {
        account_number: AR_GL,
        transaction_date: parsed.batchDate,
        description: `Invoice Total - Registries Batch ${batchReference}`,
        reference: batchReference,
        debit_amount: parsed.grandTotal,
        credit_amount: 0,
        source_type: 'manual',
        source_id: batchReference
      },
      {
        account_number: REGISTRIES_PAYABLE_GL,
        transaction_date: parsed.batchDate,
        description: `Registries Sales - ${batchReference}`,
        reference: batchReference,
        debit_amount: 0,
        credit_amount: parsed.categories.reduce((sum, item) => sum + item.amount, 0),
        source_type: 'manual',
        source_id: batchReference
      }
    ];

    if (parsed.totalServiceFees !== 0) {
      glTransactions.push({
        account_number: REGISTRIES_COMMISSION_GL,
        transaction_date: parsed.batchDate,
        description: `Registries Commission - ${batchReference}`,
        reference: batchReference,
        debit_amount: 0,
        credit_amount: parsed.totalServiceFees,
        source_type: 'manual',
        source_id: batchReference
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
        reference: batchReference
      }).select().single();
      if (paymentCreate.error) throw paymentCreate.error;

      glTransactions.push(
        {
          account_number: CASH_DRAWER_GL,
          transaction_date: settlement.payment_date,
          description: `Registries Settlement - ${batchReference}`,
          reference: batchReference,
          debit_amount: settlement.amount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: batchReference
        },
        {
          account_number: AR_GL,
          transaction_date: settlement.payment_date,
          description: `Registries Settlement - ${batchReference}`,
          reference: batchReference,
          debit_amount: 0,
          credit_amount: settlement.amount,
          source_type: 'manual',
          source_id: batchReference
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
        reference: batchReference
      }).select().single();
      if (depositCreate.error) throw depositCreate.error;

      glTransactions.push(
        {
          account_number: CASH_DRAWER_GL,
          transaction_date: parsed.batchDate,
          description: `Registries Deposit - ${batchReference}`,
          reference: batchReference,
          debit_amount: parsed.bankDepositAmount,
          credit_amount: 0,
          source_type: 'manual',
          source_id: batchReference
        },
        {
          account_number: AR_GL,
          transaction_date: parsed.batchDate,
          description: `Registries Deposit - ${batchReference}`,
          reference: batchReference,
          debit_amount: 0,
          credit_amount: parsed.bankDepositAmount,
          source_type: 'manual',
          source_id: batchReference
        }
      );
    }

    const now = new Date().toISOString();
    const supplierInvoiceLines = parsed.categories.map((category) => ({
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      created_date: now,
      updated_date: now,
      created_by: user.email,
      created_by_id: user.id,
      gst_amount: null,
      purchase_amount: category.amount,
      paid_amount: 0,
      description: `${category.name} Registries Batch`,
      gst_override: true,
      inventory: false,
      supplier_id: REGISTRIES_SUPPLIER_ID,
      invoice_number: `${category.code}${parsed.batchDate.replace(/-/g, '')}`,
      gl_account: Number(REGISTRIES_PAYABLE_GL),
      invoice_date: parsed.batchDate,
      inventory_credit: false
    }));

    const supplierInsert = await supabase.from('SupplierInvoiceLine').insert(supplierInvoiceLines).select();
    if (supplierInsert.error) throw supplierInsert.error;

    const glCreate = await base44.asServiceRole.entities.GLTransaction.bulkCreate(glTransactions);

    return Response.json({
      success: true,
      message: `Imported registries batch with ${supplierInvoiceLines.length} invoice lines, ${parsed.settlements.length + (parsed.bankDepositAmount !== 0 ? 1 : 0)} payments, and ${glCreate.length} GL transactions.`
    });
  } catch (error) {
    console.error('processRegistriesBatch error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});