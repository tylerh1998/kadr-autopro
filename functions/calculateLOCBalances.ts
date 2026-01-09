import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { lineOfCreditId } = await req.json();

        if (!lineOfCreditId) {
            return new Response(JSON.stringify({ success: false, error: 'lineOfCreditId is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const lineOfCredit = await base44.asServiceRole.entities.LinesOfCredit.get(lineOfCreditId);

        if (!lineOfCredit) {
            return new Response(JSON.stringify({ success: false, error: 'Line of Credit not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const transactions = await base44.asServiceRole.entities.LinesOfCreditTransaction.filter({
            line_of_credit_id: lineOfCreditId,
        });

        // Use all transactions for balance calculation
        const balanceTransactions = transactions;

        let cumulativeBalance = 0;

        for (const tx of balanceTransactions) {
            if (tx.source_type === 'payment_made') {
                cumulativeBalance -= (tx.payment_amount || 0);
            } else {
                cumulativeBalance += (tx.charge_amount || 0);
                cumulativeBalance -= (tx.credit_amount || 0);
                // We ignore payment_amount on charges as we track payments via payment_made records
            }
        }

        const newCurrentBalance = cumulativeBalance;
        const newAvailableCredit = (lineOfCredit.credit_limit || 0) - newCurrentBalance;

        await base44.asServiceRole.entities.LinesOfCredit.update(lineOfCreditId, {
            current_balance: newCurrentBalance,
            available_credit: newAvailableCredit,
            last_recalculated_date: new Date().toISOString(),
        });

        return new Response(JSON.stringify({ success: true, newCurrentBalance, newAvailableCredit }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in calculateLOCBalances:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});