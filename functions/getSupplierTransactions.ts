import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getMountainDateString = (value) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return year && month && day ? `${year}-${month}-${day}` : null;
};

Deno.serve(async (req) => {
    console.log('--- getSupplierTransactions: Function invoked ---');

    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { supplierId, dateRange } = await req.json();

        if (!supplierId) {
            return Response.json({ error: 'supplierId is required' }, { status: 400 });
        }

        const fromDate = getMountainDateString(dateRange?.from);
        const toDate = getMountainDateString(dateRange?.to);

        console.log(`Fetching data for supplier: ${supplierId}`);
        console.log(`Date range: ${fromDate || 'N/A'} to ${toDate || 'N/A'}`);

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        console.log('Fetching supplier...');
        const { data: supplierDataArr, error: supplierErr } = await supabase
            .from('Supplier')
            .select('*')
            .eq('id', supplierId)
            .limit(1);

        const supplierData = supplierDataArr?.[0];

        if (supplierErr || !supplierData) {
            return Response.json({ error: 'Supplier not found' }, { status: 404 });
        }

        console.log('Fetching chart of accounts...');
        const chartOfAccountsData = await base44.asServiceRole.entities.ChartOfAccount.list('', 1000);

        console.log('Fetching supplier payments...');
        const paymentsData = await base44.asServiceRole.entities.SupplierPayment.filter({ supplier_id: supplierId });

        console.log('Invoking optimized supplier transactions RPC...');
        const { data: aggregatedData, error: rpcError } = await supabase.rpc('get_supplier_transactions_optimized', {
            p_supplier_id: supplierId,
            p_from_date: fromDate,
            p_to_date: toDate
        });

        if (rpcError) {
            console.error('RPC Error:', rpcError);
            return Response.json({
                success: false,
                error: rpcError.message || 'Failed to fetch supplier transactions'
            }, { status: 500 });
        }

        console.log(`Total payments fetched: ${paymentsData.length}`);
        console.log('Data aggregation complete. Returning response...');

        return Response.json({
            success: true,
            data: {
                supplier: supplierData,
                chartOfAccounts: chartOfAccountsData,
                payments: paymentsData,
                conceptualInvoices: aggregatedData?.conceptualInvoices || [],
                allConceptualInvoices: aggregatedData?.allConceptualInvoices || [],
                invoiceLines: aggregatedData?.invoiceLines || [],
                allInvoiceLines: aggregatedData?.allInvoiceLines || [],
                currentBalance: Number(aggregatedData?.currentBalance || 0),
                dateRangeTotal: Number(aggregatedData?.dateRangeTotal || 0)
            }
        });
    } catch (error) {
        console.error('--- Error in getSupplierTransactions ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);

        return Response.json({
            success: false,
            error: error.message || 'Failed to fetch supplier transactions'
        }, { status: 500 });
    }
});