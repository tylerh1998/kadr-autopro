import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { supplierId } = await req.json();

        if (!supplierId) {
            return Response.json({ success: false, error: 'supplierId is required' }, { status: 400 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const escapedEmail = user.email.replaceAll('"', '\\"');

        const { data: lockedSupplier, error: updateError } = await supabase
            .from('Supplier')
            .update({ LockedByUser: user.email })
            .eq('id', supplierId)
            .or(`LockedByUser.is.null,LockedByUser.eq."",LockedByUser.eq."${escapedEmail}"`)
            .select('id, name, LockedByUser')
            .maybeSingle();

        if (updateError) {
            return Response.json({ success: false, error: updateError.message || 'Failed to acquire supplier lock' }, { status: 500 });
        }

        if (lockedSupplier) {
            return Response.json({
                success: true,
                lockAcquired: true,
                supplierId: lockedSupplier.id,
                lockedByUser: user.email
            });
        }

        const { data: supplier, error: readError } = await supabase
            .from('Supplier')
            .select('id, name, LockedByUser')
            .eq('id', supplierId)
            .maybeSingle();

        if (readError) {
            return Response.json({ success: false, error: readError.message || 'Failed to read supplier lock status' }, { status: 500 });
        }

        if (!supplier) {
            return Response.json({ success: false, error: 'Supplier not found' }, { status: 404 });
        }

        const lockedByUser = supplier.LockedByUser || '';

        return Response.json({
            success: false,
            lockAcquired: false,
            lockedByUser,
            message: lockedByUser
                ? `Edit lock was not obtained. ${lockedByUser} locked this supplier before your lock completed.`
                : 'Edit lock was not obtained.'
        }, { status: 409 });
    } catch (error) {
        return Response.json({ success: false, error: error.message || 'Failed to acquire supplier lock' }, { status: 500 });
    }
});