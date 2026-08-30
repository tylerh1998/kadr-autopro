import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sanitizeDescription = (value: any) => String(value || '')
  .replace(/:/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const parseArApplyTo = (value: any) => {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};

const buildArApplyTo = (entries: any[]) => {
  return entries.map((e) => `${e.id}:${e.type}:${(Number(e.amount) || 0).toFixed(2)}:${sanitizeDescription(e.description)}`).join(',');
};

// Decodes the JWT payload directly (no network call to auth.getUser(), which fails
// for this app's cross-project/SSO-issued tokens - see autopro-getCustomerARData /
// base44-proxy history for why). The gateway (verify_jwt: true) already validated
// the signature before this function runs.
const decodeJwtPayload = (token: string): any => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res({ success: false, error: 'Authentication required' });
    }

    const claims = decodeJwtPayload(authHeader.substring(7));
    const mykadrUserId = claims?.sub;
    const jwtEmail = claims?.email;
    if (!mykadrUserId) {
      return res({ success: false, error: 'Invalid session token' });
    }

    const { data: employee, error: employeeError } = await supabase
      .from('Employee')
      .select('full_name, email')
      .eq('mykadr_user_id', mykadrUserId)
      .single();

    if (employeeError || !employee) {
      return res({
        success: false,
        error: 'Your myKADR account is not linked to an Employee record. Please ask your administrator to add you in the Employee table.'
      });
    }

    // mykadr_user_id is the forward-looking identity key here - autopro_user_id is being deprecated.
    const user = { id: mykadrUserId, email: employee.email || jwtEmail || '' };
    const userDisplay = employee.full_name || employee.email || jwtEmail || mykadrUserId;

    const payload = await req.json().catch(() => ({}));
    const { action } = payload;

    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };
    const getCurrentMountainDate = () => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date());
      const getPart = (type: string) => parts.find((part) => part.type === type)?.value || '';
      return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    };
    const createId = () => crypto.randomUUID();

    const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    // Canadian cash rounding: physical cash only comes in 5-cent increments (the penny was
    // discontinued in 2013), so a cash payment is rounded to the nearest nickel. Mirrors the
    // same formula already used for invoice-conversion cash payments in InvoicePaymentModal.jsx.
    const roundToNickel = (num: number) => round2(Math.round(num * 20) / 20);

    const formatCustomerDisplayName = (customer: any) => {
      if (!customer) return '';
      if (customer.org_name) {
        const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
        return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
      }
      return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    };

    const fetchCustomer = async (customerId: string) => {
      const { data, error } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .eq('id', customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const fetchWorkOrderDescription = async (woId: string) => {
      if (!woId) return '';
      try {
        const { data: wo } = await supabase.from('WorkOrder').select('description').eq('id', woId).single();
        return wo?.description || '';
      } catch (e) {
        console.error(`Failed to fetch WO for AR: ${woId}`, e);
        return '';
      }
    };

    const insertCustomerPayment = async (data: any) => {
      const nowIso = getCurrentMountainTimeISO();
      const row = {
        id: data.id || createId(),
        created_date: data.created_date || nowIso,
        updated_date: data.updated_date || nowIso,
        ...data
      };
      const { data: result, error } = await supabase
        .from('CustomerPayments')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return result;
    };

    const updateCustomerPayment = async (id: string, data: any) => {
      const row = {
        updated_date: data.updated_date || getCurrentMountainTimeISO(),
        ...data
      };
      const { data: result, error } = await supabase
        .from('CustomerPayments')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    };

    const fetchCustomerPayment = async (id: string) => {
      const { data, error } = await supabase
        .from('CustomerPayments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const deleteCustomerPayment = async (id: string) => {
      const { error } = await supabase.from('CustomerPayments').delete().eq('id', id);
      if (error) throw error;
    };

    const insertAdjustment = async (data: any) => {
      const nowIso = getCurrentMountainTimeISO();
      const row = {
        id: data.id || createId(),
        created_date: data.created_date || nowIso,
        updated_date: data.updated_date || nowIso,
        created_by: data.created_by || userDisplay,
        created_by_id: data.created_by_id || user.id,
        ...data
      };
      const { data: result, error } = await supabase
        .from('CustomerARAdjustment')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return result;
    };

    const updateAdjustment = async (id: string, data: any) => {
      const row = {
        updated_date: data.updated_date || getCurrentMountainTimeISO(),
        ...data
      };
      const { data: result, error } = await supabase
        .from('CustomerARAdjustment')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    };

    const fetchAdjustment = async (id: string) => {
      const { data, error } = await supabase
        .from('CustomerARAdjustment')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const deleteAdjustment = async (id: string) => {
      const { error } = await supabase.from('CustomerARAdjustment').delete().eq('id', id);
      if (error) throw error;
    };

    const insertGLTransactions = async (rows: any[]) => {
      if (!rows.length) return [];
      const nowIso = getCurrentMountainTimeISO();
      const preparedRows = rows.map((row) => ({
        id: row.id || createId(),
        created_date: row.created_date || nowIso,
        updated_date: row.updated_date || nowIso,
        created_by: row.created_by || userDisplay,
        created_by_id: row.created_by_id || user.id,
        updated_by: row.updated_by || userDisplay,
        ...row
      }));
      const { data, error } = await supabase.from('GLTransaction').insert(preparedRows).select();
      if (error) throw error;
      return data || [];
    };

    const buildOutstandingCharges = async (customerId: string) => {
      const [{ data: payments, error: paymentsError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
        supabase.from('CustomerPayments').select('*').eq('customer_id', customerId),
        supabase.from('CustomerARAdjustment').select('*').eq('customer_id', customerId)
      ]);

      if (paymentsError) throw paymentsError;
      if (adjustmentsError) throw adjustmentsError;

      const charges: any[] = [];

      (payments || [])
        .filter((payment: any) => payment.payment_method === 'on_account')
        .forEach((payment: any) => {
          const balance = (Number(payment.amount) || 0) - (Number(payment.ar_paid) || 0);
          if (balance > 0.01) {
            charges.push({
              id: payment.id,
              type: 'invoice',
              date: payment.payment_date,
              amount: Number(payment.amount) || 0,
              ar_paid: Number(payment.ar_paid) || 0,
              balance,
              work_order_id: payment.work_order_id || '',
              notes: payment.notes || ''
            });
          }
        });

      (adjustments || []).forEach((adjustment: any) => {
        const balance = (Number(adjustment.amount) || 0) - (Number(adjustment.ar_paid) || 0);
        if (Math.abs(balance) > 0.01) {
          charges.push({
            id: adjustment.id,
            type: 'adjustment',
            date: adjustment.adjustment_date,
            amount: Number(adjustment.amount) || 0,
            ar_paid: Number(adjustment.ar_paid) || 0,
            balance,
            reference: adjustment.reference || '',
            description: adjustment.description || '',
            adjustment
          });
        }
      });

      charges.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return charges;
    };

    const createAdjustmentGLRows = ({ adjustment, referenceOverride, descriptionOverride, sourceType = 'adjustment' }: any) => {
      const amount = Math.abs(Number(adjustment.amount) || 0);
      const reference = referenceOverride || adjustment.reference || `ADJ-${adjustment.id}`;
      const description = descriptionOverride || `AR Adjustment: ${adjustment.description || 'Adjustment'}`;

      if (amount <= 0 || !adjustment.gl_account) return [];

      if (Number(adjustment.amount) > 0) {
        return [
          {
            transaction_date: adjustment.adjustment_date,
            account_number: '1100',
            description,
            debit_amount: amount,
            credit_amount: 0,
            reference,
            source_type: sourceType,
            source_id: adjustment.id
          },
          {
            transaction_date: adjustment.adjustment_date,
            account_number: adjustment.gl_account,
            description,
            debit_amount: 0,
            credit_amount: amount,
            reference,
            source_type: sourceType,
            source_id: adjustment.id
          }
        ];
      }

      return [
        {
          transaction_date: adjustment.adjustment_date,
          account_number: adjustment.gl_account,
          description,
          debit_amount: amount,
          credit_amount: 0,
          reference,
          source_type: sourceType,
          source_id: adjustment.id
        },
        {
          transaction_date: adjustment.adjustment_date,
          account_number: '1100',
          description,
          debit_amount: 0,
          credit_amount: amount,
          reference,
          source_type: sourceType,
          source_id: adjustment.id
        }
      ];
    };

    const reverseAdjustmentGLRows = ({ adjustment, reversalDate, referenceOverride, descriptionOverride, sourceType = 'adjustment' }: any) => {
      const amount = Math.abs(Number(adjustment.amount) || 0);
      const reference = referenceOverride || `REV-${adjustment.reference || adjustment.id}`;
      const description = descriptionOverride || `Reversal: ${adjustment.description || 'Adjustment'}`;

      if (amount <= 0 || !adjustment.gl_account) return [];

      if (Number(adjustment.amount) > 0) {
        return [
          {
            transaction_date: reversalDate,
            account_number: adjustment.gl_account,
            description,
            debit_amount: amount,
            credit_amount: 0,
            reference,
            source_type: sourceType,
            source_id: adjustment.id
          },
          {
            transaction_date: reversalDate,
            account_number: '1100',
            description,
            debit_amount: 0,
            credit_amount: amount,
            reference,
            source_type: sourceType,
            source_id: adjustment.id
          }
        ];
      }

      return [
        {
          transaction_date: reversalDate,
          account_number: '1100',
          description,
          debit_amount: amount,
          credit_amount: 0,
          reference,
          source_type: sourceType,
          source_id: adjustment.id
        },
        {
          transaction_date: reversalDate,
          account_number: adjustment.gl_account,
          description,
          debit_amount: 0,
          credit_amount: amount,
          reference,
          source_type: sourceType,
          source_id: adjustment.id
        }
      ];
    };

    const isOverpaymentAdjustment = (adjustment: any) => adjustment.description === 'Overpayment' || adjustment.overpayment === true;

    // Overpayment adjustments are NOT created via createAdjustmentGLRows - the create_payment
    // handler posts them with deliberately inverted polarity (1100 debit / gl_account credit)
    // so the liability account is correctly credited when the credit is established. Reusing
    // reverseAdjustmentGLRows on them would reproduce that same pattern again instead of
    // inverting it, doubling up the GL instead of canceling it out. This mirrors the actual
    // original entries.
    const reverseOverpaymentGLRows = ({ adjustment, reversalDate }: any) => {
      const amount = Math.abs(Number(adjustment.amount) || 0);
      const reference = `REV-${adjustment.id}`;
      const description = `Reversal: ${adjustment.description || 'Overpayment'}`;

      if (amount <= 0 || !adjustment.gl_account) return [];

      return [
        {
          transaction_date: reversalDate,
          account_number: '1100',
          description,
          debit_amount: 0,
          credit_amount: amount,
          reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        },
        {
          transaction_date: reversalDate,
          account_number: adjustment.gl_account,
          description,
          debit_amount: amount,
          credit_amount: 0,
          reference,
          source_type: 'adjustment',
          source_id: adjustment.id
        }
      ];
    };

    const buildAdjustmentReversalGLRows = (adjustment: any, reversalDate: string) => {
      return isOverpaymentAdjustment(adjustment)
        ? reverseOverpaymentGLRows({ adjustment, reversalDate })
        : reverseAdjustmentGLRows({ adjustment, reversalDate, sourceType: 'adjustment' });
    };

    const isPaymentGeneratedAdjustment = (adjustment: any, payment: any, amountApplied: number) => {
      const reference = adjustment.reference || '';
      if (
        reference === `CCFEE-${payment.id}` ||
        reference === `OVERPAY-${payment.id}` ||
        reference === `PENNY-${payment.id}`
      ) return true;

      const adjustmentAmount = Number(adjustment.amount) || 0;
      const appliedAmount = Number(amountApplied) || 0;
      const sameDate = adjustment.adjustment_date === payment.payment_date;
      const sameCustomer = adjustment.customer_id === payment.customer_id;

      if (
        sameDate &&
        sameCustomer &&
        adjustment.description === 'Credit Card Processing Fee (3%)' &&
        adjustmentAmount > 0 &&
        Math.abs(adjustmentAmount - appliedAmount) < 0.01
      ) {
        return true;
      }

      if (
        sameDate &&
        sameCustomer &&
        (adjustment.description === 'Overpayment' || adjustment.overpayment === true) &&
        adjustmentAmount < 0 &&
        Math.abs(Math.abs(adjustmentAmount) - appliedAmount) < 0.01
      ) {
        return true;
      }

      if (
        sameDate &&
        sameCustomer &&
        adjustment.description === 'Penny Adjustment' &&
        Math.abs(Math.abs(adjustmentAmount) - appliedAmount) < 0.01
      ) {
        return true;
      }

      return false;
    };

    if (action === 'create_payment') {
      const {
        customer_id,
        payment_date,
        payment_amount,
        payment_method,
        reference,
        apply_mode,
        selected_charge_ids = [],
        credit_card_fee_amount = 0
      } = payload;

      const paymentAmount = Number(payment_amount) || 0;
      const creditCardFeeAmount = Number(credit_card_fee_amount) || 0;

      if (!customer_id || !payment_date || !payment_method) {
        return res({ success: false, error: 'Missing required payment data' });
      }

      const customer = await fetchCustomer(customer_id);
      const customerName = formatCustomerDisplayName(customer);
      const outstandingCharges = await buildOutstandingCharges(customer_id);
      const chargeItems = outstandingCharges.filter((charge) => (Number(charge.balance) || 0) > 0.01);
      const creditItems = outstandingCharges.filter((charge) => (Number(charge.balance) || 0) < -0.01);
      const selectedSet = new Set((selected_charge_ids || []).filter(Boolean));

      let chargesToPay: any[] = [];
      if (apply_mode === 'selected') {
        chargesToPay = chargeItems
          .filter((charge) => selectedSet.has(charge.id))
          .map((charge) => ({ ...charge, amountToApply: Number(charge.balance) || 0 }));
      } else {
        let remainingAmount = paymentAmount;
        for (const charge of chargeItems) {
          if (remainingAmount <= 0) break;
          const amountToApply = Math.min(remainingAmount, Number(charge.balance) || 0);
          if (amountToApply > 0.01) {
            chargesToPay.push({ ...charge, amountToApply });
            remainingAmount -= amountToApply;
          }
        }
      }

      const totalChargesSelected = chargesToPay.reduce((sum, charge) => sum + (Number(charge.amountToApply) || 0), 0);

      // A customer can pay with zero outstanding charges to apply against (e.g. they already
      // paid in full and are overpaying again) - that's fine as long as there's a real amount
      // being paid; it all becomes an overpayment below. Only block true no-ops.
      if (totalChargesSelected <= 0.01 && paymentAmount <= 0.01) {
        return res({ success: false, error: 'No outstanding charges were selected and no payment amount was provided.' });
      }

      // Credits are drawn against the charges above: explicitly selected in 'selected' mode
      // (credits are just rows in the same selectable table), auto-folded in oldest-first mode
      // since that tab has no manual selection step.
      const eligibleCredits = apply_mode === 'selected'
        ? creditItems.filter((credit) => selectedSet.has(credit.id))
        : creditItems;

      const creditPool = eligibleCredits.map((credit) => ({ ...credit, available: Math.abs(Number(credit.balance) || 0) }));
      let creditAppliedTotal = 0;
      const creditConsumption: { credit: any; amount: number }[] = [];
      for (const charge of chargesToPay) {
        let remainingOnCharge = charge.amountToApply;
        for (const credit of creditPool) {
          if (remainingOnCharge <= 0.01) break;
          if (credit.available <= 0.01) continue;
          const draw = Math.min(remainingOnCharge, credit.available);
          credit.available -= draw;
          remainingOnCharge -= draw;
          creditAppliedTotal += draw;
          creditConsumption.push({ credit, amount: draw });
        }
      }

      // usesRealCash reflects whether the customer is actually handing over new money (vs. the
      // handleSubmitCreditOnly path, which explicitly submits payment_amount: 0 to reallocate
      // existing credit against a charge with no new cash). It must key off paymentAmount itself,
      // not off the charges being paid down - a full overpayment has zero charges to apply against
      // but is still real cash received.
      const usesRealCash = paymentAmount > 0.01;

      // Canadian cash rounding: physical cash settles to the nearest nickel, so a cash payment's
      // actual collected amount can differ from the exact amount owed by a cent or two. The gap
      // is booked as its own "Penny Adjustment" CustomerARAdjustment below (same GL account and
      // convention already used for cash payments at invoice-conversion time), not silently
      // absorbed into AR - charges/overpayment still settle at the exact penny amount owed.
      const roundedPaymentAmount = (usesRealCash && payment_method === 'cash') ? roundToNickel(paymentAmount) : paymentAmount;
      const pennyAdjustment = round2(roundedPaymentAmount - paymentAmount);

      const totalAmountWithFee = usesRealCash ? (roundedPaymentAmount + creditCardFeeAmount) : creditAppliedTotal;
      const effectivePaymentMethod = usesRealCash ? payment_method : 'credit_applied';
      const effectivePaymentDate = usesRealCash ? payment_date : getCurrentMountainDate();
      const paymentId = createId();
      const paymentReference = usesRealCash ? `ARPMT-${paymentId}` : `CREDITAPPLY-${paymentId}`;

      const paymentRecord = await insertCustomerPayment({
        id: paymentId,
        customer_id,
        amount: totalAmountWithFee,
        payment_method: effectivePaymentMethod,
        payment_date: effectivePaymentDate,
        reference: usesRealCash ? (reference || '') : paymentReference,
        notes: usesRealCash
          ? `AR Payment for ${customerName}${creditCardFeeAmount > 0 ? ` (includes $${creditCardFeeAmount.toFixed(2)} CC fee)` : ''}`
          : `AR Credit Applied for ${customerName}`,
        ar_pmt: true,
        ar_applyto: ''
      });

      const applyToEntries: any[] = [];

      if (usesRealCash && creditCardFeeAmount > 0.01) {
        const feeAdjustment = await insertAdjustment({
          customer_id,
          adjustment_date: payment_date,
          amount: creditCardFeeAmount,
          gl_account: '4009',
          description: 'Credit Card Processing Fee (3%)',
          reference: `CCFEE-${paymentRecord.id}`,
          ar_paid: creditCardFeeAmount
        });

        await insertGLTransactions([
          {
            transaction_date: payment_date,
            account_number: '1100',
            description: `Credit Card Fee - ${customerName}`,
            debit_amount: creditCardFeeAmount,
            credit_amount: 0,
            reference: feeAdjustment.reference,
            source_type: 'customer_ar_adjustment',
            source_id: feeAdjustment.id
          },
          {
            transaction_date: payment_date,
            account_number: '4009',
            description: `Credit Card Fee - ${customerName}`,
            debit_amount: 0,
            credit_amount: creditCardFeeAmount,
            reference: feeAdjustment.reference,
            source_type: 'customer_ar_adjustment',
            source_id: feeAdjustment.id
          }
        ]);

        applyToEntries.push({
          id: feeAdjustment.id,
          type: 'adj',
          amount: creditCardFeeAmount,
          description: feeAdjustment.description
        });
      }

      if (pennyAdjustment !== 0) {
        const pennyAdjustmentRecord = await insertAdjustment({
          customer_id,
          adjustment_date: payment_date,
          amount: pennyAdjustment,
          gl_account: '4013',
          description: 'Penny Adjustment',
          reference: `PENNY-${paymentRecord.id}`,
          ar_paid: pennyAdjustment
        });

        await insertGLTransactions(
          createAdjustmentGLRows({
            adjustment: pennyAdjustmentRecord,
            descriptionOverride: `Penny Adjustment - ${customerName}`,
            sourceType: 'customer_ar_adjustment'
          })
        );

        applyToEntries.push({
          id: pennyAdjustmentRecord.id,
          type: 'adj',
          amount: Math.abs(pennyAdjustment),
          description: pennyAdjustmentRecord.description
        });
      }

      if (usesRealCash) {
        await insertGLTransactions([
          {
            transaction_date: payment_date,
            account_number: '1010',
            description: `AR Payment - ${customerName}`,
            debit_amount: totalAmountWithFee,
            credit_amount: 0,
            reference: paymentReference,
            source_type: 'customer_payment',
            source_id: paymentRecord.id
          },
          {
            transaction_date: payment_date,
            account_number: '1100',
            description: `AR Payment - ${customerName}`,
            debit_amount: 0,
            credit_amount: totalAmountWithFee,
            reference: paymentReference,
            source_type: 'customer_payment',
            source_id: paymentRecord.id
          }
        ]);
      }

      for (const { credit, amount } of creditConsumption) {
        if (amount <= 0.01) continue;

        const glAccount = credit.adjustment?.gl_account;
        if (glAccount) {
          await insertGLTransactions([
            {
              transaction_date: effectivePaymentDate,
              account_number: glAccount,
              description: `Credit Applied - ${customerName}`,
              debit_amount: amount,
              credit_amount: 0,
              reference: paymentReference,
              source_type: 'customer_payment',
              source_id: paymentRecord.id
            },
            {
              transaction_date: effectivePaymentDate,
              account_number: '1100',
              description: `Credit Applied - ${customerName}`,
              debit_amount: 0,
              credit_amount: amount,
              reference: paymentReference,
              source_type: 'customer_payment',
              source_id: paymentRecord.id
            }
          ]);
        }

        const newCreditArPaid = (Number(credit.ar_paid) || 0) - amount;
        await updateAdjustment(credit.id, { ar_paid: newCreditArPaid });

        applyToEntries.push({
          id: credit.id,
          type: 'credit_source',
          amount,
          description: credit.description || ''
        });
      }

      let totalApplied = 0;
      for (const charge of chargesToPay) {
        const amountToApply = Number(charge.amountToApply) || 0;
        if (amountToApply <= 0.01) continue;

        const newArPaid = (Number(charge.ar_paid) || 0) + amountToApply;
        if (charge.type === 'invoice') {
          await updateCustomerPayment(charge.id, { ar_paid: newArPaid });
        } else if (charge.type === 'adjustment') {
          await updateAdjustment(charge.id, { ar_paid: newArPaid });
        }

        if (charge.type === 'invoice') {
          let description = await fetchWorkOrderDescription(charge.work_order_id);
          if (!description) {
            description = charge.notes || '';
          }
          applyToEntries.push({ id: charge.id, type: 'pmt', amount: amountToApply, description });
        } else {
          applyToEntries.push({ id: charge.id, type: 'adj', amount: amountToApply, description: charge.description || '' });
        }
        totalApplied += amountToApply;
      }

      const overpaymentAmount = usesRealCash ? (paymentAmount - totalApplied) : 0;
      if (overpaymentAmount > 0.01) {
        const overpaymentAdjustment = await insertAdjustment({
          customer_id,
          adjustment_date: payment_date,
          amount: -overpaymentAmount,
          gl_account: '2100',
          description: 'Overpayment',
          reference: '',
          ar_paid: 0,
          overpayment: true
        });

        await insertGLTransactions([
          {
            transaction_date: payment_date,
            account_number: '1100',
            description: `Overpayment Credit - ${customerName}`,
            debit_amount: overpaymentAmount,
            credit_amount: 0,
            reference: overpaymentAdjustment.reference,
            source_type: 'adjustment',
            source_id: overpaymentAdjustment.id
          },
          {
            transaction_date: payment_date,
            account_number: '2100',
            description: `Overpayment Credit - ${customerName}`,
            debit_amount: 0,
            credit_amount: overpaymentAmount,
            reference: overpaymentAdjustment.reference,
            source_type: 'adjustment',
            source_id: overpaymentAdjustment.id
          }
        ]);

        applyToEntries.push({
          id: overpaymentAdjustment.id,
          type: 'adj',
          amount: overpaymentAmount,
          description: overpaymentAdjustment.description
        });
      }

      const updatedPayment = await updateCustomerPayment(paymentRecord.id, {
        ar_applyto: buildArApplyTo(applyToEntries)
      });

      return res({ success: true, payment: updatedPayment });
    }

    if (action === 'create_adjustment') {
      const { adjustmentData } = payload;
      if (!adjustmentData?.customer_id || !adjustmentData?.adjustment_date || !adjustmentData?.gl_account) {
        return res({ success: false, error: 'Missing required adjustment data' });
      }

      const adjustment = await insertAdjustment({
        customer_id: adjustmentData.customer_id,
        adjustment_date: adjustmentData.adjustment_date,
        amount: adjustmentData.amount,
        gl_account: adjustmentData.gl_account,
        description: adjustmentData.description,
        reference: adjustmentData.reference || '',
        ar_paid: adjustmentData.ar_paid || 0,
        overpayment: adjustmentData.overpayment || false
      });

      await insertGLTransactions(
        createAdjustmentGLRows({
          adjustment,
          referenceOverride: adjustment.reference || `ADJ-${adjustment.id}`,
          descriptionOverride: `AR Adjustment: ${adjustment.description}`,
          sourceType: 'adjustment'
        })
      );

      return res({ success: true, adjustment });
    }

    if (action === 'reverse_payment') {
      const { payment_id } = payload;
      if (!payment_id) {
        return res({ success: false, error: 'payment_id is required' });
      }

      const payment = await fetchCustomerPayment(payment_id);
      if (!payment) {
        return res({ success: false, error: 'Payment not found' });
      }
      if (payment.deposited === true) {
        return res({ success: false, error: 'Cannot delete a payment that has already been deposited.' });
      }

      const customer = payment.customer_id ? await fetchCustomer(payment.customer_id) : null;
      const customerName = formatCustomerDisplayName(customer);
      const arApplyToEntries = parseArApplyTo(payment.ar_applyto);
      const reversalDate = getCurrentMountainDate();

      const autoAdjustmentsToReverse = new Map();

      for (const entry of arApplyToEntries) {
        const recordId = entry?.id;
        const amountApplied = Number(entry?.amount) || 0;
        if (!recordId || amountApplied <= 0) continue;

        if (entry.type === 'credit_source') {
          const sourceCredit = await fetchAdjustment(recordId);
          if (sourceCredit) {
            const restoredArPaid = Math.min(0, (Number(sourceCredit.ar_paid) || 0) + amountApplied);
            await updateAdjustment(recordId, { ar_paid: restoredArPaid });

            if (sourceCredit.gl_account) {
              await insertGLTransactions([
                {
                  transaction_date: reversalDate,
                  account_number: '1100',
                  description: `Reversal: Credit Applied - ${customerName}`,
                  debit_amount: amountApplied,
                  credit_amount: 0,
                  reference: `REV-${payment.reference || payment.id}`,
                  source_type: 'customer_payment',
                  source_id: payment.id
                },
                {
                  transaction_date: reversalDate,
                  account_number: sourceCredit.gl_account,
                  description: `Reversal: Credit Applied - ${customerName}`,
                  debit_amount: 0,
                  credit_amount: amountApplied,
                  reference: `REV-${payment.reference || payment.id}`,
                  source_type: 'customer_payment',
                  source_id: payment.id
                }
              ]);
            }
          }
          continue;
        }

        const appliedPayment = await fetchCustomerPayment(recordId);
        if (appliedPayment) {
          const newArPaid = Math.max(0, (Number(appliedPayment.ar_paid) || 0) - amountApplied);
          await updateCustomerPayment(recordId, { ar_paid: newArPaid });
          continue;
        }

        const appliedAdjustment = await fetchAdjustment(recordId);
        if (appliedAdjustment) {
          if (isPaymentGeneratedAdjustment(appliedAdjustment, payment, amountApplied)) {
            autoAdjustmentsToReverse.set(appliedAdjustment.id, appliedAdjustment);
          } else {
            const newArPaid = Math.max(0, (Number(appliedAdjustment.ar_paid) || 0) - amountApplied);
            await updateAdjustment(recordId, { ar_paid: newArPaid });
          }
        }
      }

      // 'credit_applied' payments never had a real 1010 cash leg (no cash was ever collected -
      // the whole thing was funded by credit_source entries above), so there is nothing to reverse here.
      if (payment.payment_method !== 'credit_applied') {
        await insertGLTransactions([
          {
            transaction_date: reversalDate,
            account_number: '1100',
            description: `Reversal: AR Payment - ${customerName}`,
            debit_amount: Number(payment.amount) || 0,
            credit_amount: 0,
            reference: `REV-ARPMT-${payment.id}`,
            source_type: 'customer_payment',
            source_id: payment.id
          },
          {
            transaction_date: reversalDate,
            account_number: '1010',
            description: `Reversal: AR Payment - ${customerName}`,
            debit_amount: 0,
            credit_amount: Number(payment.amount) || 0,
            reference: `REV-ARPMT-${payment.id}`,
            source_type: 'customer_payment',
            source_id: payment.id
          }
        ]);
      }

      for (const adjustment of autoAdjustmentsToReverse.values()) {
        await insertGLTransactions(buildAdjustmentReversalGLRows(adjustment, reversalDate));
        await deleteAdjustment(adjustment.id);
      }

      await deleteCustomerPayment(payment.id);
      return res({ success: true });
    }

    if (action === 'reverse_adjustment') {
      const { adjustment_id } = payload;
      if (!adjustment_id) {
        return res({ success: false, error: 'adjustment_id is required' });
      }

      const adjustment = await fetchAdjustment(adjustment_id);
      if (!adjustment) {
        return res({ success: false, error: 'Adjustment not found' });
      }

      if (adjustment.ar_paid && Number(adjustment.ar_paid) !== 0) {
        return res({
          success: false,
          error: 'Cannot delete this adjustment because a payment or credit has already been applied against it. Record a correcting adjustment instead.'
        });
      }

      const reversalDate = getCurrentMountainDate();
      await insertGLTransactions(buildAdjustmentReversalGLRows(adjustment, reversalDate));
      await deleteAdjustment(adjustment.id);

      return res({ success: true });
    }

    if (action === 'apply_interest') {
      const { selectedCalculations } = payload;
      if (!Array.isArray(selectedCalculations)) {
        return res({ success: false, error: 'selectedCalculations array is required' });
      }

      if (selectedCalculations.length === 0) {
        return res({ success: true, created_count: 0 });
      }

      const adjustmentDate = getCurrentMountainDate();
      const nowIso = getCurrentMountainTimeISO();
      const adjustmentsToInsert: any[] = [];
      const glTransactionsToInsert: any[] = [];

      for (const calc of selectedCalculations) {
        const customer = calc.customer;
        if (!customer?.id || !(Number(calc.totalInterest) > 0)) continue;

        const adjustmentId = createId();
        const reference = '';
        const customerName = formatCustomerDisplayName(customer);

        adjustmentsToInsert.push({
          id: adjustmentId,
          customer_id: customer.id,
          adjustment_date: adjustmentDate,
          amount: Number(calc.totalInterest) || 0,
          gl_account: '4010',
          description: `Interest charge - 24% APR (${(calc.interestDetails || []).length} item(s))`,
          reference,
          created_date: nowIso,
          updated_date: nowIso,
          created_by: userDisplay,
          created_by_id: user.id
        });

        glTransactionsToInsert.push(
          {
            transaction_date: adjustmentDate,
            account_number: '1100',
            description: `Interest - ${customerName}`,
            debit_amount: Number(calc.totalInterest) || 0,
            credit_amount: 0,
            reference,
            source_type: 'adjustment',
            source_id: adjustmentId
          },
          {
            transaction_date: adjustmentDate,
            account_number: '4010',
            description: `Interest - ${customerName}`,
            debit_amount: 0,
            credit_amount: Number(calc.totalInterest) || 0,
            reference,
            source_type: 'adjustment',
            source_id: adjustmentId
          }
        );
      }

      if (adjustmentsToInsert.length > 0) {
        const { error: adjustmentsError } = await supabase.from('CustomerARAdjustment').insert(adjustmentsToInsert);
        if (adjustmentsError) throw adjustmentsError;
      }

      if (glTransactionsToInsert.length > 0) {
        await insertGLTransactions(glTransactionsToInsert);
      }

      return res({ success: true, created_count: adjustmentsToInsert.length });
    }

    return res({ success: false, error: 'Invalid action' });
  } catch (error: any) {
    console.error('Error processing customer AR accounting:', error);
    return res({ success: false, error: error.message });
  }
});
