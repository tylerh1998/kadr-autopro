import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Project ID is required' }, { status: 400 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseKey = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: 'Supabase configuration missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: sessions, error } = await supabase
            .from('ProjectTimeSession')
            .select('*')
            .eq('project_id', projectId);

        if (error) {
            console.error('Supabase ProjectTimeSession query error:', error);
            return Response.json({ error: error.message }, { status: 500 });
        }

        const sortedLogs = (sessions || [])
            .map(session => ({
                id: session.id,
                date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
                hours: parseFloat(session.total_hours) || 0,
                workpro_user_name: session.user_name || session.employee_name || 'Unknown User',
                workpro_start_time: session.start_time,
                workpro_end_time: session.end_time,
                notes: session.notes || '',
                isRunning: session.start_time && !session.end_time,
                ...session
            }))
            .sort((a, b) => {
                const dateCompare = new Date(b.date) - new Date(a.date);
                if (dateCompare !== 0) return dateCompare;
                
                if (a.workpro_start_time && b.workpro_start_time) {
                    return new Date(b.workpro_start_time) - new Date(a.workpro_start_time);
                }
                return 0;
            });

        return Response.json({ success: true, logs: sortedLogs });

    } catch (error) {
        console.error('Error in getProjectTimeSessions:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});