import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const accounts = await base44.asServiceRole.entities.ChartOfAccount.filter({}, undefined, 5000);
    
    const acc2051 = accounts.find(a => a.account_number === "2051");
    const children = accounts.filter(a => a.parent_account === "2051");

    return Response.json({
      success: true,
      acc2051,
      children
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});