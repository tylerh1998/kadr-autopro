import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        const accounts = await base44.asServiceRole.entities.ChartOfAccount.list('', 1000);
        return Response.json({ 
            success: true, 
            message: 'Test function works!',
            user: user?.email || 'No user',
            accountsCount: accounts.length,
            accounts: accounts.map(a => a.account_number)
        });
    } catch (error) {
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});