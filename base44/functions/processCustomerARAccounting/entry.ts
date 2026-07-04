import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { formatInTimeZone } from 'npm:date-fns-tz@3.1.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const payload = await req.json().catch(() => ({}));
    const { action } = payload;

    const userDisplay = user.full_name || user.email || user.id;
    const getCurrentMountainTimeISO = () => {
      const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
      return mountainNow.toISOString();
    };
    const getCurrentMountainDate = () => formatInTimeZone(new Date(), 'America/Edmonton', 'yyyy-MM-dd');
    const createId = () => crypto.randomUUID();

    const formatCustomerDisplayName = (customer) => {
      if (!customer) return '';
      if (customer.org_name) {
        const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
        return contactName ? `${customer.org_name} (${contactName})` : customer.org_name;
      }
      return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    };

    const fetchCustomer = async (customerId) => {
      const { data, error } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .eq('id', customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const insertCustomerPayment = async (data) => {
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

    const updateCustomerPayment = async (id, data) => {
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

    const fetchCustomerPayment = async (id) => {
      const { data, error } = await supabase
        .from('CustomerPayments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const deleteCustomerPayment = async (id) => {
      const { error } = await supabase.from('CustomerPayments').delete().eq('id', id);
      if (error) throw error;
    };

    const insertAdjustment = async (data) => {
      const nowIso = getCurrentMountainTimeISO();
      const row = {
        id: data.id || createId(),
        created_date: data.created_date || nowIso,
        updated_date: data.updated_date || nowIso,
        created_by: data.created_by || user.email,
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

    const updateAdjustment = async (id, data) => {
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

    const fetchAdjustment = async (id) => {
      const { data, error } = await supabase
        .from('CustomerARAdjustment')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const deleteAdjustment = async (id) => {
      const { error } = await supabase.from('CustomerARAdjustment').delete().eq('id', id);
      if (error) throw error;
    };

    const insertGLTransactions = async (rows) => {
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

    const buildOutstandingCharges = async (customerId) => {
      const [{ data: payments, error: paymentsError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
        supabase.from('CustomerPayments').select('*').eq('customer_id', customerId),
        supabase.from('CustomerARAdjustment').select('*').eq('customer_id', customerId)
      ]);

      if (paymentsError) throw paymentsError;
      if (adjustmentsError) throw adjustmentsError;

      const charges = [];

      (payments || [])
        .filter((payment) => payment.payment_method === 'on_account')
        .forEach((payment) => {
          const balance = (Number(payment.amount) || 0) - (Number(payment.ar_paid) || 0);
          if (balance > 0.01) {
            charges.push({
              id: payment.id,
              type: 'invoice',
              date: payment.payment_date,
              amount: Number(payment.amount) || 0,
              ar_paid: Number(payment.ar_paid) || 0,
              balance
            });
          }
        });

      (adjustments || []).forEach((adjustment) => {
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

    const createAdjustmentGLRows = ({ adjustment, customerName, referenceOverride, descriptionOverride, sourceType = 'adjustment' }) => {
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

    const reverseAdjustmentGLRows = ({ adjustment, reversalDate, referenceOverride, descriptionOverride, sourceType = 'adjustment' }) => {
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

    const isPaymentGeneratedAdjustment = (adjustment, payment, amountApplied) => {
      const reference = adjustment.reference || '';
      if (reference === `CCFEE-${payment.id}` || reference === `OVERPAY-${payment.id}`) return true;

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
      const totalAmountWithFee = paymentAmount + creditCardFeeAmount;

      if (!customer_id || !payment_date || !payment_method || totalAmountWithFee <= 0) {
        return Response.json({ error: 'Missing required payment data' }, { status: 400 });
      }

      const customer = await fetchCustomer(customer_id);
      const customerName = formatCustomerDisplayName(customer);
      const outstandingCharges = await buildOutstandingCharges(customer_id);
      const positiveOutstandingCharges = outstandingCharges.filter((charge) => (Number(charge.balance) || 0) > 0.01);

      let chargesToPay = [];
      if (apply_mode === 'selected') {
        const selectedSet = new Set((selected_charge_ids || []).filter(Boolean));
        chargesToPay = positiveOutstandingCharges
          .filter((charge) => selectedSet.has(charge.id))
          .map((charge) => ({ ...charge, amountToApply: Number(charge.balance) || 0 }));
      } else {
        let remainingAmount = paymentAmount;
        for (const charge of positiveOutstandingCharges) {
          if (remainingAmount <= 0) break;
          const amountToApply = Math.min(remainingAmount, Number(charge.balance) || 0);
          if (amountToApply > 0.01) {
            chargesToPay.push({ ...charge, amountToApply });
            remainingAmount -= amountToApply;
          }
        }
      }

      if (apply_mode === 'selected' && chargesToPay.length === 0 && paymentAmount > 0.01) {
        return Response.json({ error: 'No valid outstanding charges were selected.' }, { status: 400 });
      }

      const paymentRecord = await insertCustomerPayment({
        customer_id,
        amount: totalAmountWithFee,
        payment_method,
        payment_date,
        reference: reference || '',
        notes: `AR Payment for ${customerName}${creditCardFeeAmount > 0 ? ` (includes $${creditCardFeeAmount.toFixed(2)} CC fee)` : ''}`,
        ar_pmt: true,
        ar_applyto: ''
      });

      const applyToEntries = [];
      const paymentReference = `ARPMT-${paymentRecord.id}`;

      if (creditCardFeeAmount > 0.01) {
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

        applyToEntries.push(`${feeAdjustment.id}:${creditCardFeeAmount.toFixed(2)}`);
      }

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

        applyToEntries.push(`${charge.id}:${amountToApply.toFixed(2)}`);
        totalApplied += amountToApply;
      }

      const overpaymentAmount = paymentAmount - totalApplied;
      if (overpaymentAmount > 0.01) {
        const overpaymentAdjustment = await insertAdjustment({
          customer_id,
          adjustment_date: payment_date,
          amount: -overpaymentAmount,
          gl_account: '2100',
          description: 'Overpayment',
          reference: `OVERPAY-${paymentRecord.id}`,
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

        applyToEntries.push(`${overpaymentAdjustment.id}:${overpaymentAmount.toFixed(2)}`);
      }

      const updatedPayment = await updateCustomerPayment(paymentRecord.id, {
        ar_applyto: applyToEntries.join(',')
      });

      return Response.json({ success: true, payment: updatedPayment });
    }

    if (action === 'create_adjustment') {
      const { adjustmentData } = payload;
      if (!adjustmentData?.customer_id || !adjustmentData?.adjustment_date || !adjustmentData?.gl_account) {
        return Response.json({ error: 'Missing required adjustment data' }, { status: 400 });
      }

      const customer = await fetchCustomer(adjustmentData.customer_id);
      const customerName = formatCustomerDisplayName(customer);
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
          customerName,
          referenceOverride: adjustment.reference || `ADJ-${adjustment.id}`,
          descriptionOverride: `AR Adjustment: ${adjustment.description}`,
          sourceType: 'adjustment'
        })
      );

      return Response.json({ success: true, adjustment });
    }

    if (action === 'reverse_payment') {
      const { payment_id } = payload;
      if (!payment_id) {
        return Response.json({ error: 'payment_id is required' }, { status: 400 });
      }

      const payment = await fetchCustomerPayment(payment_id);
      if (!payment) {
        return Response.json({ error: 'Payment not found' }, { status: 404 });
      }
      if (payment.deposited === true) {
        return Response.json({ error: 'Cannot delete a payment that has already been deposited.' }, { status: 400 });
      }

      const customer = payment.customer_id ? await fetchCustomer(payment.customer_id) : null;
      const customerName = formatCustomerDisplayName(customer);
      const arApplyToEntries = String(payment.ar_applyto || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      const autoAdjustmentsToReverse = new Map();

      for (const entry of arApplyToEntries) {
        const [recordId, amountStr] = entry.split(':');
        const amountApplied = Number(amountStr) || 0;
        if (!recordId || amountApplied <= 0) continue;

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

      const reversalDate = getCurrentMountainDate();
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

      for (const adjustment of autoAdjustmentsToReverse.values()) {
        await insertGLTransactions(
          reverseAdjustmentGLRows({
            adjustment,
            reversalDate,
            sourceType: 'adjustment'
          })
        );
        await deleteAdjustment(adjustment.id);
      }

      await deleteCustomerPayment(payment.id);
      return Response.json({ success: true });
    }

    if (action === 'reverse_adjustment') {
      const { adjustment_id } = payload;
      if (!adjustment_id) {
        return Response.json({ error: 'adjustment_id is required' }, { status: 400 });
      }

      const adjustment = await fetchAdjustment(adjustment_id);
      if (!adjustment) {
        return Response.json({ error: 'Adjustment not found' }, { status: 404 });
      }

      const reversalDate = getCurrentMountainDate();
      await insertGLTransactions(
        reverseAdjustmentGLRows({
          adjustment,
          reversalDate,
          sourceType: 'adjustment'
        })
      );
      await deleteAdjustment(adjustment.id);

      return Response.json({ success: true });
    }

    if (action === 'apply_interest') {
      const { selectedCalculations } = payload;
      if (!Array.isArray(selectedCalculations)) {
        return Response.json({ error: 'selectedCalculations array is required' }, { status: 400 });
      }

      if (selectedCalculations.length === 0) {
        return Response.json({ success: true, created_count: 0 });
      }

      const now = new Date();
      const adjustmentDate = formatInTimeZone(now, 'America/Edmonton', 'yyyy-MM-dd');
      const dateStr = formatInTimeZone(now, 'America/Edmonton', 'yyyyMMdd');
      const nowIso = getCurrentMountainTimeISO();
      const adjustmentsToInsert = [];
      const glTransactionsToInsert = [];

      for (const calc of selectedCalculations) {
        const customer = calc.customer;
        if (!customer?.id || !(Number(calc.totalInterest) > 0)) continue;

        const adjustmentId = createId();
        const reference = `INT-${dateStr}-${customer.id.substring(0, 6)}`;
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
          created_by: user.email,
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

      return Response.json({ success: true, created_count: adjustmentsToInsert.length });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing customer AR accounting:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});