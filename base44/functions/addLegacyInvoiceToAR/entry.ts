import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await req.json();
        const { customer_id, invoice_date, invoice_number, description, amount, lankar_invoice } = data;

        if (!customer_id || !invoice_date || !invoice_number || !description || !amount) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create CustomerPayment record
        // Note: For legacy invoices added to AR, we treat them as "on_account" method but they represent DEBT, not payment.
        // However, the prompt specifically asked for:
        // payment_method: on_account, ar_pmt: false, deposited:false, advance_pmt: false
        // And usually in this system, payments are Credits (negative balance impact if paid, positive if charge?). 
        // Typically CustomerPayments records with positive amounts DECREASE the AR balance (customer pays money).
        // If we are adding an INVOICE (legacy debt), it should technically be a CHARGE.
        // But CustomerPayments entity is usually for PAYMENTS.
        // If I create a payment record with POSITIVE amount, it typically means they PAID.
        // If I create a payment record with NEGATIVE amount, it might mean a CHARGE (reversal).
        // OR, "on_account" payment usually means "Paid using store credit".
        // HOWEVER, the user said "Add Legacy Invoice to AR".
        // If I add an invoice to AR, I want the customer to OWE money.
        // In this system's logic (inferred), if I want to ADD to AR balance (Owe more), I might need a negative payment or positive charge?
        // Let's look at CustomerARSummary logic if we could, but I can't see it now.
        // I will assume the user knows what they are doing with "create a customerpayment record". 
        // I will store the amount as provided. If the user enters positive amount for invoice value, I'll store it.
        // Wait, if it's an invoice, typically in `CustomerPayments`, `amount` is the amount PAID.
        // If we want to represent an invoice using `CustomerPayments` (which is weird, usually invoices are WorkOrders), 
        // we might be "creating a record that says this invoice exists and is unpaid"? 
        // No, `CustomerPayments` are payments.
        // Maybe the user implies "Add a record that CAN BE PAID"? 
        // But `CustomerPayments` are historically transactions.
        // If I look at `CustomerARAdjustment`, that's for charges/credits.
        // But the user insisted on `CustomerPayments`.
        // I will create the record exactly as asked.

        const newRecord = await base44.entities.CustomerPayments.create({
            customer_id,
            payment_date: invoice_date,
            invoice_number,
            notes: description,
            amount: parseFloat(amount),
            lankar_invoice: lankar_invoice || null,
            payment_method: 'on_account',
            ar_pmt: false,
            deposited: false,
            advance_pmt: false,
            gl_posted: false
        });

        return Response.json({ success: true, record: newRecord });

    } catch (error) {
        console.error('Error adding legacy invoice:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});