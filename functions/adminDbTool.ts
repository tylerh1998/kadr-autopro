import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

export default async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { mode, entityName, startDate, endDate, field, searchTerm } = await req.json();

    // Use service role for robust access to all entities
    const adminEntities = base44.asServiceRole.entities;

    if (!adminEntities[entityName]) {
      return new Response(JSON.stringify({ error: `Entity '${entityName}' not found` }), { status: 400 });
    }

    let results = [];

    if (mode === 'extract') {
      // Date range query
      const query = {};
      if (startDate || endDate) {
        query.created_date = {};
        if (startDate) query.created_date.$gte = startDate;
        if (endDate) query.created_date.$lte = endDate;
      }
      
      console.log(`Extracting ${entityName} with query:`, JSON.stringify(query));
      
      // Fetch with a high limit for extract
      results = await adminEntities[entityName].filter(query, '-created_date', 5000);
      console.log(`Found ${results.length} records`);
    } 
    else if (mode === 'search') {
      const query = {};
      if (field && searchTerm) {
        // Try to determine if search term is numeric or string
        const isNumericField = ['amount', 'total', 'cost', 'price', 'qty', 'quantity'].some(k => field.toLowerCase().includes(k));
        
        if (isNumericField && !isNaN(searchTerm)) {
             query[field] = Number(searchTerm);
        } else if (field === 'id' || field.endsWith('_id') || field === 'boolean') {
             query[field] = searchTerm;
        } else {
             query[field] = { $regex: searchTerm, $options: 'i' };
        }
      }
      
      console.log(`Searching ${entityName} with query:`, JSON.stringify(query));
      results = await adminEntities[entityName].filter(query, '-created_date', 100);
    }
    else if (mode === 'get_schema') {
        const sample = await adminEntities[entityName].list(1);
        let fields = ['id', 'created_date', 'updated_date', 'created_by'];
        if (sample && sample.length > 0) {
            fields = [...new Set([...fields, ...Object.keys(sample[0])])];
        }
        return new Response(JSON.stringify({ fields }), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    return new Response(JSON.stringify({ results }), { 
        headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Admin DB Tool Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

import { createClientFromRequest as createClient } from 'npm:@base44/sdk@0.8.3';
Deno.serve(async (req) => {
    return await handler(req);
});