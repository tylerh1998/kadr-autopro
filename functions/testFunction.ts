import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        const lines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({ supplier_id: '3d980a03d4104824aaf8c27c' });
        
        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");
        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });
        
        let deleteResult = null;
        if (lines.length > 0) {
            try {
                await base44.asServiceRole.entities.SupplierInvoiceLine.delete(lines[0].id);
                deleteResult = "Success";
            } catch (e) {
                deleteResult = e.message;
            }
        }

        return Response.json({ 
            success: true, 
            message: 'Test function works!',
            user: user?.email || 'No user',
            linesCount: lines.length,
            lines: lines.map(l => l.id),
            deleteResult
        });
    } catch (error) {
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});