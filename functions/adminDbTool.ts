import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

const BUILT_IN_FIELDS = [
  { name: 'id', type: 'string', built_in: true },
  { name: 'created_date', type: 'string', format: 'date-time', built_in: true },
  { name: 'updated_date', type: 'string', format: 'date-time', built_in: true },
  { name: 'created_by', type: 'string', built_in: true }
];

async function buildFieldMeta(adminEntities, entityName, observedKeys = []) {
  const metaMap = new Map(BUILT_IN_FIELDS.map(field => [field.name, field]));

  try {
    const schema = await adminEntities[entityName].schema();
    const schemaProps = schema?.properties || {};

    Object.entries(schemaProps).forEach(([name, config]) => {
      metaMap.set(name, {
        name,
        type: config?.type || 'unknown',
        format: config?.format,
        enum: config?.enum,
        built_in: false
      });
    });
  } catch (_error) {
    if (entityName === 'User') {
      metaMap.set('role', { name: 'role', type: 'string', built_in: false });
    }
  }

  observedKeys.forEach((name) => {
    if (!metaMap.has(name)) metaMap.set(name, { name, type: 'unknown', observed: true });
  });

  return Array.from(metaMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { mode, entityName, startDate, endDate, field, searchTerm } = await req.json();
    const adminEntities = base44.asServiceRole.entities;

    if (!adminEntities[entityName]) {
      return new Response(JSON.stringify({ error: `Entity '${entityName}' not found` }), { status: 400 });
    }

    let results = [];

    if (mode === 'extract') {
      const query = {};
      if (startDate || endDate) {
        query.created_date = {};
        if (startDate) query.created_date.$gte = startDate;
        if (endDate) query.created_date.$lte = endDate;
      }
      results = await adminEntities[entityName].filter(query, '-created_date', 5000);
    }
    else if (mode === 'search') {
      const query = {};
      if (field && searchTerm) {
        const fieldMeta = buildFieldMeta(entityName).find(f => f.name === field);
        const isNumericField = fieldMeta?.type === 'number' || ['amount', 'total', 'cost', 'price', 'qty', 'quantity'].some(k => field.toLowerCase().includes(k));
        const isBooleanField = fieldMeta?.type === 'boolean';

        if (isNumericField && !isNaN(searchTerm)) {
          query[field] = Number(searchTerm);
        } else if (isBooleanField) {
          query[field] = searchTerm === 'true';
        } else if (field === 'id' || field.endsWith('_id')) {
          query[field] = searchTerm;
        } else {
          query[field] = { $regex: searchTerm, $options: 'i' };
        }
      }
      results = await adminEntities[entityName].filter(query, '-created_date', 100);
    }
    else if (mode === 'get_schema') {
      const sample = await adminEntities[entityName].list(50);
      const observedKeys = [...new Set((sample || []).flatMap(record => Object.keys(record || {})))];
      const fieldMeta = buildFieldMeta(entityName, observedKeys);
      const fields = fieldMeta.map(field => field.name);
      return new Response(JSON.stringify({ fields, fieldMeta }), {
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