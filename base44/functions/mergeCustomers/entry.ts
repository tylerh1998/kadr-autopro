import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Fetch both customers
        const [masterCustomer] = await base44.entities.Customer.filter({ id: masterId });
        const [duplicateCustomer] = await base44.entities.Customer.filter({ id: duplicateId });

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
                                   `--- Merged Data from ${duplicateCustomer.first_name} ${duplicateCustomer.last_name} (${duplicateCustomer.org_name || ''}) ---\n` + 
                                   duplicateCustomer.notes;
        }

        if (Object.keys(updatesToMaster).length > 0) {
            await base44.entities.Customer.update(masterId, updatesToMaster);
        }

        // 2. Reassign Related Records
        
        // Vehicles
        const vehicles = await base44.entities.Vehicle.filter({ customer_id: duplicateId }, undefined, 1000); // Pagination safety
        if (vehicles.length > 0) {
            // Process in chunks if needed, but for now Promise.all is okay for typical volumes
            await Promise.all(vehicles.map(v => 
                base44.entities.Vehicle.update(v.id, { customer_id: masterId })
            ));
        }

        // Work Orders
        const workOrders = await base44.entities.WorkOrder.filter({ customer_id: duplicateId }, undefined, 1000);
        if (workOrders.length > 0) {
            await Promise.all(workOrders.map(wo => 
                base44.entities.WorkOrder.update(wo.id, { customer_id: masterId })
            ));
        }

        // Customer Payments
        const payments = await base44.entities.CustomerPayments.filter({ customer_id: duplicateId }, undefined, 1000);
        if (payments.length > 0) {
            await Promise.all(payments.map(p => 
                base44.entities.CustomerPayments.update(p.id, { customer_id: masterId })
            ));
        }

        // Customer AR Adjustments
        const adjustments = await base44.entities.CustomerARAdjustment.filter({ customer_id: duplicateId }, undefined, 1000);
        if (adjustments.length > 0) {
            await Promise.all(adjustments.map(adj => 
                base44.entities.CustomerARAdjustment.update(adj.id, { customer_id: masterId })
            ));
        }

        // 3. Deactivate Duplicate Customer and Update Audit Trail
        const masterName = masterCustomer.org_name || `${masterCustomer.first_name} ${masterCustomer.last_name}`;
        const auditNote = `merged into ${masterName} - ${masterId} for audit trail creation`;
        
        const currentNotes = duplicateCustomer.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;

        await base44.entities.Customer.update(duplicateId, {
            is_active: false,
            notes: newNotes
        });

        return Response.json({ 
            success: true, 
            message: 'Customers merged successfully',
            mergedCount: {
                vehicles: vehicles.length,
                workOrders: workOrders.length,
                payments: payments.length,
                adjustments: adjustments.length
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});