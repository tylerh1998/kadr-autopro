import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const getMountainDate = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date());
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ro_number } = await req.json();

    if (!ro_number) {
      return Response.json({ error: 'Missing ro_number' }, { status: 400 });
    }

    const projectsResponse = await base44.functions.invoke('workProProxy', {
      entityName: 'Project',
      method: 'filter',
      params: { work_order: ro_number }
    });

    if (!projectsResponse?.data?.success) {
      return Response.json({ error: projectsResponse?.data?.error || 'Failed to load projects' }, { status: 500 });
    }

    const projects = Array.isArray(projectsResponse.data.data)
      ? projectsResponse.data.data
      : (projectsResponse.data.data?.records || []);

    if (projects.length === 0) {
      return Response.json({ success: true, total_found: 0, archived_count: 0 });
    }

    const dateArchived = getMountainDate();
    const projectsToArchive = projects.filter((project) => project.status !== 'archived');

    for (const project of projectsToArchive) {
      await base44.functions.invoke('workProProxy', {
        entityName: 'Project',
        method: 'update',
        id: project.id,
        params: {
          status: 'archived',
          date_archived: dateArchived
        }
      });
    }

    return Response.json({
      success: true,
      total_found: projects.length,
      archived_count: projectsToArchive.length,
      date_archived: dateArchived
    });
  } catch (error) {
    console.error('Error in archiveWorkOrderProjects:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});