import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { part_number, description, supplier_name } = await req.json();

    if (!part_number && !description) {
      return Response.json({ error: 'Part number or description required' }, { status: 400 });
    }

    // Rule 1: Check if supplier is Jard
    if (supplier_name && supplier_name.toLowerCase().includes('jard')) {
      return Response.json({ category: 'Jard' });
    }

    // Fetch available categories
    const categories = await base44.entities.InventoryCategory.list();
    const categoryNames = categories.map(c => c.name);

    if (categoryNames.length === 0) {
      return Response.json({ category: 'other' });
    }

    // Use LLM to suggest category
    const prompt = `
      You are an automotive parts inventory expert.
      First, search the internet to identify what this part is based on the Part Number and Description.
      Then, classify it into one of the existing categories below.
      
      Part Number: ${part_number || 'N/A'}
      Description: ${description || 'N/A'}
      
      Available Categories:
      ${categoryNames.join(', ')}
      
      Return ONLY the exact name of the best matching category from the list above. 
      If the part does not fit clearly into any specific category, return 'other'.
      Do not make up new categories.
      Do not add explanations or quotes.
    `;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      add_context_from_internet: true
    });

    let suggestedCategory = aiResponse.trim().replace(/^['"]|['"]$/g, ''); // Remove quotes if present
    
    // Validate that the suggestion exists in our list (case-insensitive check)
    const match = categoryNames.find(c => c.toLowerCase() === suggestedCategory.toLowerCase());
    if (match) {
        suggestedCategory = match;
    } else {
        // Fallback: Try to find 'other' (case-insensitive), otherwise use first category
        const otherCategory = categoryNames.find(c => c.toLowerCase() === 'other');
        suggestedCategory = otherCategory || categoryNames[0];
    }

    return Response.json({ category: suggestedCategory });

  } catch (error) {
    console.error('Error suggesting category:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});