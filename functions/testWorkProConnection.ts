import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // List last 5 projects from WorkPro to inspect structure
        const response = await base44.functions.invoke('workProProxy', {
            entityName: 'Project',
            method: 'list',
            limit: 5,
            sort: '-created_date'
        });

        return Response.json(response.data);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});