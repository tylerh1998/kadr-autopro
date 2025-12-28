import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check authentication
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Project ID is required' }, { status: 400 });
        }

        const apiKey = Deno.env.get('WORKPRO_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'WORKPRO_API_KEY not set' }, { status: 500 });
        }

        // Fetch ProjectTimeSession directly from WorkPRO API
        const response = await fetch(`${API_BASE_URL}/ProjectTimeSession?project_id=${projectId}`, {
            headers: { 'api_key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`WorkPRO API error: ${response.status}`);
        }

        const data = await response.json();
        const sessions = Array.isArray(data) ? data : (data?.records || []);

        // Map to expected format and sort by date and start time (most recent first)
        const sortedLogs = sessions
            .map(session => ({
                id: session.id,
                date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
                hours: parseFloat(session.total_hours) || 0,
                workpro_user_name: session.user_name || session.employee_name || 'Unknown User',
                workpro_start_time: session.start_time,
                workpro_end_time: session.end_time,
                notes: session.notes || '',
                isRunning: session.start_time && !session.end_time,
                // Include raw session data just in case
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