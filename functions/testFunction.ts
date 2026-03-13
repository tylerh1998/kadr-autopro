import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        const lines = await base44.asServiceRole.entities.SupplierInvoiceLine.filter({ supplier_id: '3d980a03d4104824aaf8c27c' });
        return Response.json({ 
            success: true, 
            message: 'Test function works!',
            user: user?.email || 'No user',
            linesCount: lines.length,
            lines: lines.map(l => l.id)
        });
    } catch (error) {
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});