import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseKey = Deno.env.get("Supabase_Publishable_key");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");

        if (!supabaseUrl || !supabaseKey || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        // Use the official Supabase client
        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        
        // We use the secret key to bypass RLS if needed, or publishable key
        // The user mentioned they are using publishable and secret API keys.
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: {
                persistSession: false
            }
        });

        const reqBody = await req.json().catch(() => ({}));
        console.log("DEBUG SupabaseProxy received payload:", JSON.stringify(reqBody));
        const { action = 'read', id, ids, data: payloadData, table = 'SalesClass', match, params } = reqBody;
        const getCurrentMountainTimeISO = () => {
            const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
            return mountainNow.toISOString();
        };

        let result;
        let operationMeta = { action, table, id: id || null, ids: ids || null };
        
        if (action === 'read' || action === 'list') {
            let query = supabase.from(table).select('*');
            if (match) {
                query = query.match(match);
            }
            result = await query;
        } else if (action === 'filter') {
            let query = supabase.from(table).select('*');
            if (params) {
                query = query.match(params);
            }
            result = await query;
        } else if (action === 'create') {
            let insertData;

            if (table === 'Note') {
                insertData = {
                    ...payloadData,
                    created_by: payloadData?.created_by || user.id,
                    status: payloadData?.status || 'Private'
                };
            } else {
                const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
                insertData = {
                    id: newId,
                    ...payloadData
                };
            }

            if (table === 'BankTransaction' || table === 'SupplierInvoiceLine') {
                const nowIso = getCurrentMountainTimeISO();
                insertData = {
                    ...insertData,
                    created_date: payloadData?.created_date || nowIso,
                    updated_date: payloadData?.updated_date || nowIso,
                    created_by: payloadData?.created_by || user.email
                };
            }

            if (table === 'GLTransaction') {
                const nowIso = getCurrentMountainTimeISO();
                const userDisplay = payloadData?.created_by || user.full_name || user.email || user.id;
                insertData = {
                    ...insertData,
                    created_date: payloadData?.created_date || nowIso,
                    updated_date: payloadData?.updated_date || nowIso,
                    created_by: userDisplay,
                    created_by_id: payloadData?.created_by_id || user.id,
                    updated_by: payloadData?.updated_by || userDisplay
                };
            }

            result = await supabase.from(table).insert([insertData]).select();
        } else if (action === 'update') {
            let updateData = {
                ...payloadData
            };

            if (table === 'BankTransaction' || table === 'SupplierInvoiceLine') {
                updateData = {
                    ...updateData,
                    updated_date: payloadData?.updated_date || getCurrentMountainTimeISO()
                };
                delete updateData.created_by;
                delete updateData.created_date;
            }

            if (table === 'GLTransaction') {
                updateData = {
                    ...updateData,
                    updated_date: payloadData?.updated_date || getCurrentMountainTimeISO(),
                    updated_by: payloadData?.updated_by || user.full_name || user.email || user.id
                };
                delete updateData.created_by;
                delete updateData.created_by_id;
                delete updateData.created_date;
            }

            if (Array.isArray(ids) && ids.length > 0) {
                result = await supabase.from(table).update(updateData).in('id', ids).select();
            } else {
                result = await supabase.from(table).update(updateData).eq('id', id).select();
            }
        } else if (action === 'delete') {
            result = await supabase.from(table).delete().eq('id', id);
        }

        if (result.error) {
            console.error("Supabase error:", { ...operationMeta, error: result.error });
            return Response.json({
                error: result.error.message || 'Failed to perform Supabase operation',
                details: {
                    ...operationMeta,
                    code: result.error.code || null,
                    details: result.error.details || null,
                    hint: result.error.hint || null
                }
            }, { status: 500 });
        }
        
        return Response.json({ data: result.data });
    } catch (error) {
        console.error("SupabaseProxy error:", error);
        return Response.json({
            error: error.message,
            details: {
                stack: error.stack || null
            }
        }, { status: 500 });
    }
});