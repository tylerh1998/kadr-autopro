import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all bank accounts
        const bankAccounts = await base44.asServiceRole.entities.BankAccount.list();
        
        let flushedCount = 0;
        
        // Clear locks on all bank accounts
        for (const account of bankAccounts) {
            if (account.locked_by_user || account.locked_timestamp) {
                await base44.asServiceRole.entities.BankAccount.update(account.id, {
                    locked_by_user: null,
                    locked_timestamp: null
                });
                flushedCount++;
            }
        }

        return Response.json({ 
            success: true, 
            message: `Flushed locks on ${flushedCount} bank account(s)`,
            flushedCount 
        });

    } catch (error) {
        console.error('Error in flushBankLocks:', error);
        return Response.json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        }, { status: 500 });
    }
});