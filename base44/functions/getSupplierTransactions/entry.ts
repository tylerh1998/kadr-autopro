import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
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

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const { data: supplierDataArr, error: supplierErr } = await supabase
            .from('Supplier')
            .select('*')
            .eq('id', supplierId)
            .limit(1);

        const supplierData = supplierDataArr?.[0];

        if (supplierErr || !supplierData) {
            return Response.json({ error: 'Supplier not found' }, { status: 404 });
        }

        const [chartOfAccountsData, paymentsResponse, rpcResponse, bankAccountsResponse] = await Promise.all([
            base44.asServiceRole.entities.ChartOfAccount.list('', 1000),
            supabase
                .from('SupplierPayment')
                .select('*')
                .eq('supplier_id', supplierId)
                .order('payment_date', { ascending: false }),
            supabase.rpc('get_supplier_transactions_optimized', {
                p_supplier_id: supplierId,
                p_from_date: fromDate,
                p_to_date: toDate
            }),
            supabase
                .from('BankAccount')
                .select('id, name')
        ]);

        if (paymentsResponse.error) {
            return Response.json({
                success: false,
                error: paymentsResponse.error.message || 'Failed to fetch supplier payments'
            }, { status: 500 });
        }

        if (rpcResponse.error) {
            console.error('RPC Error:', rpcResponse.error);
            return Response.json({
                success: false,
                error: rpcResponse.error.message || 'Failed to fetch supplier transactions'
            }, { status: 500 });
        }

        if (bankAccountsResponse.error) {
            return Response.json({
                success: false,
                error: bankAccountsResponse.error.message || 'Failed to fetch bank accounts'
            }, { status: 500 });
        }

        const bankAccountMap = new Map((bankAccountsResponse.data || []).map((account) => [account.id, account.name]));
        const paymentsWithBankNames = (paymentsResponse.data || []).map((payment) => {
            if (payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque') {
                return {
                    ...payment,
                    bank_account_name: bankAccountMap.get(payment.source) || '-'
                };
            }

            return payment;
        });

        return Response.json({
            success: true,
            data: {
                supplier: supplierData,
                chartOfAccounts: chartOfAccountsData,
                payments: paymentsWithBankNames,
                conceptualInvoices: rpcResponse.data?.conceptualInvoices || [],
                allConceptualInvoices: rpcResponse.data?.allConceptualInvoices || [],
                invoiceLines: rpcResponse.data?.invoiceLines || [],
                allInvoiceLines: rpcResponse.data?.allInvoiceLines || [],
                currentBalance: Number(rpcResponse.data?.currentBalance || 0),
                dateRangeTotal: Number(rpcResponse.data?.dateRangeTotal || 0)
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