import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseKey = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: 'Supabase configuration is missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: bankAccounts, error: bankAccountsError } = await supabase
            .from('BankAccount')
            .select('id, locked_by_user, locked_timestamp');

        if (bankAccountsError) {
            throw new Error(bankAccountsError.message);
        }
        
        let flushedCount = 0;
        
        for (const account of bankAccounts || []) {
            if (account.locked_by_user || account.locked_timestamp) {
                const { error: updateError } = await supabase
                    .from('BankAccount')
                    .update({
                        locked_by_user: null,
                        locked_timestamp: null
                    })
                    .eq('id', account.id);

                if (updateError) {
                    throw new Error(updateError.message);
                }

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