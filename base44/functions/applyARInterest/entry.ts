import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { selectedCalculations } = body;

    if (!selectedCalculations || !Array.isArray(selectedCalculations)) {
      return Response.json({ error: 'selectedCalculations array is required' }, { status: 400 });
    }

    const response = await base44.functions.invoke('processCustomerARAccounting', {
      action: 'apply_interest',
      selectedCalculations
    });

    return Response.json(response.data);
  } catch (error) {
    console.error('Error applying interest:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});