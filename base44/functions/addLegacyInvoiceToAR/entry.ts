import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

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

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const payload = {
            id: crypto.randomUUID(),
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
            gl_posted: false,
            created_date: new Date().toISOString(),
            updated_date: new Date().toISOString()
        };

        const { data: newRecord, error } = await supabase
            .from('CustomerPayments')
            .insert(payload)
            .select()
            .single();

        if (error) {
            throw error;
        }

        return Response.json({ success: true, record: newRecord });

    } catch (error) {
        console.error('Error adding legacy invoice:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});