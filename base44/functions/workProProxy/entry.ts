import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { entityName, method, params = {}, id, sort, limit } = body;

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        if (!entityName || !method) {
            return Response.json({ error: 'entityName and method are required' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const table = entityName;
        let responseData;

        const getSortConfig = (inputSort) => {
            if (!inputSort) return null;
            const descending = inputSort.startsWith('-');
            return {
                field: descending ? inputSort.slice(1) : inputSort,
                ascending: !descending
            };
        };

        const cleanFilterParams = (rawParams = {}) => {
            const next = { ...rawParams };
            delete next._sort;
            delete next._limit;
            delete next.skip;
            delete next.limit;
            return next;
        };

        switch (method) {
            case 'list': {
                const listSort = params?.sort || sort || params?._sort;
                const listLimit = params?.limit || limit || params?._limit;
                const listSkip = Number(params?.skip || 0);
                const listQuery = cleanFilterParams(params?.query || {});

                let query = supabase.from(table).select('*');

                if (Object.keys(listQuery).length > 0) {
                    query = query.match(listQuery);
                }

                const sortConfig = getSortConfig(listSort);
                if (sortConfig) {
                    query = query.order(sortConfig.field, { ascending: sortConfig.ascending });
                }

                if (listLimit) {
                    query = query.range(listSkip, listSkip + Number(listLimit) - 1);
                } else if (listSkip > 0) {
                    query = query.range(listSkip, listSkip + 999);
                }

                const result = await query;
                if (result.error) throw result.error;
                responseData = result.data || [];
                break;
            }

            case 'filter': {
                const filterSort = sort || params?._sort;
                const filterLimit = limit || params?._limit;
                const filterSkip = Number(params?.skip || 0);
                const filterParams = cleanFilterParams(params);

                let query = supabase.from(table).select('*');

                if (Object.keys(filterParams).length > 0) {
                    for (const [key, value] of Object.entries(filterParams)) {
                        if (value && typeof value === 'object' && '$ne' in value) {
                            query = query.neq(key, value.$ne);
                        } else {
                            query = query.eq(key, value);
                        }
                    }
                }

                const sortConfig = getSortConfig(filterSort);
                if (sortConfig) {
                    query = query.order(sortConfig.field, { ascending: sortConfig.ascending });
                }

                if (filterLimit) {
                    query = query.range(filterSkip, filterSkip + Number(filterLimit) - 1);
                } else if (filterSkip > 0) {
                    query = query.range(filterSkip, filterSkip + 999);
                }

                const result = await query;
                if (result.error) throw result.error;
                responseData = result.data || [];
                break;
            }

            case 'get': {
                if (!id) {
                    return Response.json({ error: 'ID is required for get method' }, { status: 400 });
                }

                const result = await supabase.from(table).select('*').eq('id', id).maybeSingle();
                if (result.error) throw result.error;
                responseData = result.data || null;
                break;
            }

            case 'create': {
                const payload = {
                    id: params.id || crypto.randomUUID().replace(/-/g, '').substring(0, 24),
                    ...params,
                    created_date: params.created_date || new Date().toISOString(),
                    created_by: params.created_by || user.email,
                    created_by_id: params.created_by_id || user.id
                };

                const result = await supabase.from(table).insert([payload]).select().single();
                if (result.error) throw result.error;
                responseData = result.data;
                break;
            }

            case 'update': {
                if (!id) {
                    return Response.json({ error: 'ID is required for update method' }, { status: 400 });
                }

                const payload = { ...params };
                const result = await supabase.from(table).update(payload).eq('id', id).select().single();
                if (result.error) throw result.error;
                responseData = result.data;
                break;
            }

            case 'delete': {
                if (!id) {
                    return Response.json({ error: 'ID is required for delete method' }, { status: 400 });
                }

                const result = await supabase.from(table).delete().eq('id', id).select().single();
                if (result.error) throw result.error;
                responseData = result.data;
                break;
            }

            default:
                return Response.json({ error: `Unsupported method: ${method}` }, { status: 400 });
        }

        return Response.json({ success: true, data: responseData });
    } catch (error) {
        console.error('WorkPRO Proxy Error:', error);
        return Response.json({ error: error.message, details: error }, { status: 500 });
    }
});