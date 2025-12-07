Deno.serve(async (req) => {
  try {
    const WORKPRO_API_KEY = Deno.env.get("WORKPRO_API_KEY");
    const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
    
    if (!WORKPRO_API_KEY) {
      return Response.json(
        { error: 'WORKPRO_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Fetch technicians from WorkPRO
    const response = await fetch(
      `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities/Employee?employee_type=tech`,
      {
        headers: {
          'api_key': WORKPRO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return Response.json(
        { error: `WorkPRO API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const techs = Array.isArray(data) ? data : (data?.records || []);

    // Return sanitized data
    const sanitizedTechs = techs.map(tech => ({
      id: tech.id,
      employee_id: tech.employee_id,
      first_name: tech.first_name,
      last_name: tech.last_name,
      full_name: tech.full_name,
      user_email: tech.user_email,
      employee_type: tech.employee_type
    }));

    return Response.json({ techs: sanitizedTechs });
  } catch (error) {
    console.error('Error fetching WorkPRO techs:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});