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
            return Response.json({ error: 'Cannot merge a vehicle into itself' }, { status: 400 });
        }

        const supabase = createSupabaseClient();

        // Fetch both vehicles
        const [
            { data: masterVehicle },
            { data: duplicateVehicle }
        ] = await Promise.all([
            supabase.from('Vehicle').select('*').eq('id', masterId).single(),
            supabase.from('Vehicle').select('*').eq('id', duplicateId).single()
        ]);

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
            const duplicateInfo = `${duplicateVehicle.year || ''} ${duplicateVehicle.make || ''} ${duplicateVehicle.model || ''}`;
            updatesToMaster.notes = (masterVehicle.notes || '') + separator + 
                                   `--- Merged Data from ${duplicateInfo.trim()} (${duplicateVehicle.vin || 'No VIN'}) ---\n` + 
                                   duplicateVehicle.notes;
        }

        const now = new Date().toISOString();

        if (Object.keys(updatesToMaster).length > 0) {
            updatesToMaster.updated_date = now;
            const { error: masterUpdateError } = await supabase.from('Vehicle').update(updatesToMaster).eq('id', masterId);
            if (masterUpdateError) throw masterUpdateError;
        }

        // 2. Reassign Related Records
        
        // Work Orders (Supabase)
        const { data: workOrdersData, error: workOrdersError } = await supabase
            .from('WorkOrder')
            .update({ vehicle_id: masterId, updated_at: now })
            .eq('vehicle_id', duplicateId)
            .select('id');
            
        if (workOrdersError) throw workOrdersError;

        // Appointments (Base44)
        const appointments = await base44.entities.Appointment.filter({ vehicle_id: duplicateId }, undefined, 1000);
        if (appointments.length > 0) {
            await Promise.all(appointments.map(app => 
                base44.entities.Appointment.update(app.id, { vehicle_id: masterId })
            ));
        }

        // 3. Deactivate Duplicate Vehicle and Update Audit Trail
        const masterInfo = `${masterVehicle.year || ''} ${masterVehicle.make || ''} ${masterVehicle.model || ''}`;
        const auditNote = `merged into ${masterInfo.trim()} - ${masterId} for audit trail creation`;
        
        const currentNotes = duplicateVehicle.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;

        const { error: duplicateUpdateError } = await supabase.from('Vehicle').update({
            is_active: false,
            notes: newNotes,
            updated_date: now
        }).eq('id', duplicateId);

        if (duplicateUpdateError) throw duplicateUpdateError;

        return Response.json({ 
            success: true, 
            message: 'Vehicles merged successfully',
            mergedCount: {
                workOrders: workOrdersData?.length || 0,
                appointments: appointments.length
            }
        });

    } catch (error) {
        console.error("Merge Vehicles Error:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});