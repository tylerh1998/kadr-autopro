import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);

    const url = Deno.env.get('Supabase_project_url');
    const anonKey = Deno.env.get('Supabase_Publishable_key');

    if (!url || !anonKey) {
      return Response.json({ error: 'Missing Supabase realtime configuration' }, { status: 500 });
    }

    return Response.json({ url, anonKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});