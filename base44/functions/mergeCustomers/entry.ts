import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('Supabase_project_url');
  const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false }
  });
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { masterId, duplicateId } = await req.json();

        if (!masterId || !duplicateId) {
            return Response.json({ error: 'Master ID and Duplicate ID are required' }, { status: 400 });
        }

        if (masterId === duplicateId) {
            return Response.json({ error: 'Cannot merge a customer into itself' }, { status: 400 });
        }

        const supabase = createSupabaseClient();

        // Fetch both customers
        const [
            { data: masterCustomer },
            { data: duplicateCustomer }
        ] = await Promise.all([
            supabase.from('Customer').select('*').eq('id', masterId).single(),
            supabase.from('Customer').select('*').eq('id', duplicateId).single()
        ]);

        if (!masterCustomer || !duplicateCustomer) {
            return Response.json({ error: 'One or both customers not found' }, { status: 404 });
        }

        // 1. Merge Customer Details (Master prevails, fill empty fields from duplicate)
        const fieldsToMerge = [
            'org_name', 'first_name', 'last_name', 
            'phone', 'secondary_phone', 'email', 
            'address', 'city', 'state', 'zip_code', 
            'default_taxable'
        ];

        const updatesToMaster = {};
        
        // Helper to check if value is "empty"
        const isEmpty = (val) => val === null || val === undefined || val === '';

        fieldsToMerge.forEach(field => {
            if (isEmpty(masterCustomer[field]) && !isEmpty(duplicateCustomer[field])) {
                updatesToMaster[field] = duplicateCustomer[field];
            }
        });

        // Handle notes separately - append duplicate notes to master if they exist
        if (!isEmpty(duplicateCustomer.notes)) {
            const separator = masterCustomer.notes ? '\n\n' : '';
            updatesToMaster.notes = (masterCustomer.notes || '') + separator + 
                                   `--- Merged Data from ${duplicateCustomer.first_name || ''} ${duplicateCustomer.last_name || ''} (${duplicateCustomer.org_name || ''}) ---\n` + 
                                   duplicateCustomer.notes;
        }

        if (Object.keys(updatesToMaster).length > 0) {
            updatesToMaster.updated_date = new Date().toISOString();
            const { error: masterUpdateError } = await supabase.from('Customer').update(updatesToMaster).eq('id', masterId);
            if (masterUpdateError) throw masterUpdateError;
        }

        // 2. Reassign Related Records using Supabase bulk updates
        const now = new Date().toISOString();
        
        const [
            { data: vehiclesData, error: vehiclesError },
            { data: workOrdersData, error: workOrdersError },
            { data: paymentsData, error: paymentsError },
            { data: adjustmentsData, error: adjustmentsError }
        ] = await Promise.all([
            supabase.from('Vehicle').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id'),
            supabase.from('WorkOrder').update({ customer_id: masterId, updated_at: now }).eq('customer_id', duplicateId).select('id'),
            supabase.from('CustomerPayments').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id'),
            supabase.from('CustomerARAdjustment').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id')
        ]);

        if (vehiclesError) throw vehiclesError;
        if (workOrdersError) throw workOrdersError;
        if (paymentsError) throw paymentsError;
        if (adjustmentsError) throw adjustmentsError;

        // 3. Deactivate Duplicate Customer and Update Audit Trail
        const masterName = masterCustomer.org_name || `${masterCustomer.first_name || ''} ${masterCustomer.last_name || ''}`;
        const auditNote = `merged into ${masterName.trim()} - ${masterId} for audit trail creation`;
        
        const currentNotes = duplicateCustomer.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;

        const { error: duplicateUpdateError } = await supabase.from('Customer').update({
            is_active: false,
            notes: newNotes,
            updated_date: now
        }).eq('id', duplicateId);

        if (duplicateUpdateError) throw duplicateUpdateError;

        return Response.json({ 
            success: true, 
            message: 'Customers merged successfully',
            mergedCount: {
                vehicles: vehiclesData?.length || 0,
                workOrders: workOrdersData?.length || 0,
                payments: paymentsData?.length || 0,
                adjustments: adjustmentsData?.length || 0
            }
        });

    } catch (error) {
        console.error("Merge Customers Error:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});