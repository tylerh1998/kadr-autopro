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
            return Response.json({ error: 'Cannot merge a vehicle into itself' }, { status: 400 });
        }

        // Fetch both vehicles
        const [masterVehicle] = await base44.entities.Vehicle.filter({ id: masterId });
        const [duplicateVehicle] = await base44.entities.Vehicle.filter({ id: duplicateId });

        if (!masterVehicle || !duplicateVehicle) {
            return Response.json({ error: 'One or both vehicles not found' }, { status: 404 });
        }

        // 1. Merge Vehicle Details (Master prevails, fill empty fields from duplicate)
        const fieldsToMerge = [
            'year', 'make', 'model', 'trim', 
            'vin', 'license_plate', 'unit_number', 
            'color', 'engine', 'customer_id'
        ];

        const updatesToMaster = {};
        
        // Helper to check if value is "empty"
        const isEmpty = (val) => val === null || val === undefined || val === '';

        fieldsToMerge.forEach(field => {
            if (isEmpty(masterVehicle[field]) && !isEmpty(duplicateVehicle[field])) {
                updatesToMaster[field] = duplicateVehicle[field];
            }
        });

        // Special Logic: Mileage (Largest)
        const masterMileage = parseFloat(masterVehicle.mileage) || 0;
        const duplicateMileage = parseFloat(duplicateVehicle.mileage) || 0;
        if (duplicateMileage > masterMileage) {
            updatesToMaster.mileage = duplicateMileage;
        }

        // Special Logic: Odometer Date (Latest)
        const masterDate = masterVehicle.odometer_date ? new Date(masterVehicle.odometer_date).getTime() : 0;
        const duplicateDate = duplicateVehicle.odometer_date ? new Date(duplicateVehicle.odometer_date).getTime() : 0;
        if (duplicateDate > masterDate) {
            updatesToMaster.odometer_date = duplicateVehicle.odometer_date;
        }

        // Handle notes - append duplicate notes to master
        if (!isEmpty(duplicateVehicle.notes)) {
            const separator = masterVehicle.notes ? '\n\n' : '';
            const duplicateInfo = `${duplicateVehicle.year} ${duplicateVehicle.make} ${duplicateVehicle.model}`;
            updatesToMaster.notes = (masterVehicle.notes || '') + separator + 
                                   `--- Merged Data from ${duplicateInfo} (${duplicateVehicle.vin || 'No VIN'}) ---\n` + 
                                   duplicateVehicle.notes;
        }

        if (Object.keys(updatesToMaster).length > 0) {
            await base44.entities.Vehicle.update(masterId, updatesToMaster);
        }

        // 2. Reassign Related Records
        
        // Work Orders
        const workOrders = await base44.entities.WorkOrder.filter({ vehicle_id: duplicateId }, undefined, 1000);
        if (workOrders.length > 0) {
            await Promise.all(workOrders.map(wo => 
                base44.entities.WorkOrder.update(wo.id, { vehicle_id: masterId })
            ));
        }

        // Appointments
        const appointments = await base44.entities.Appointment.filter({ vehicle_id: duplicateId }, undefined, 1000);
        if (appointments.length > 0) {
            await Promise.all(appointments.map(app => 
                base44.entities.Appointment.update(app.id, { vehicle_id: masterId })
            ));
        }

        // 3. Deactivate Duplicate Vehicle and Update Audit Trail
        const masterInfo = `${masterVehicle.year} ${masterVehicle.make} ${masterVehicle.model}`;
        const auditNote = `merged into ${masterInfo} - ${masterId} for audit trail creation`;
        
        const currentNotes = duplicateVehicle.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;

        await base44.entities.Vehicle.update(duplicateId, {
            is_active: false,
            notes: newNotes
        });

        return Response.json({ 
            success: true, 
            message: 'Vehicles merged successfully',
            mergedCount: {
                workOrders: workOrders.length,
                appointments: appointments.length
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});