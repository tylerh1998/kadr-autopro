import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const { part_number, description, supplier_name } = await req.json();

    if (!part_number && !description) {
      return new Response(JSON.stringify({ error: 'Part number or description required' }), { status: 200, headers: jsonHeaders });
    }

    // Rule 1: hardcoded Jard supplier match — ported verbatim from Base44, no AI call
    if (supplier_name && supplier_name.toLowerCase().includes('jard')) {
      return new Response(JSON.stringify({ category: 'Jard' }), { status: 200, headers: jsonHeaders });
    }

    // Fetch valid category names from the native InventoryCategory table
    const { data: categories, error: catError } = await supabaseAdmin
      .from('InventoryCategory')
      .select('name');
    if (catError) {
      console.error('Error fetching InventoryCategory:', catError);
      return new Response(JSON.stringify({ error: catError.message }), { status: 200, headers: jsonHeaders });
    }
    const categoryNames = (categories || []).map((c) => c.name);
    if (categoryNames.length === 0) {
      return new Response(JSON.stringify({ category: 'other' }), { status: 200, headers: jsonHeaders });
    }

    // Grounded call preserving Base44's original internet-search classification
    // behavior — no response_mime_type, since structured JSON mode and Google
    // Search grounding aren't reliably combinable on the same Gemini request.
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }), { status: 200, headers: jsonHeaders });
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const prompt = `You are an automotive parts inventory expert.
First, search the internet to identify what this part is based on the Part Number and Description.
Then, classify it into one of the existing categories below.

Part Number: ${part_number || 'N/A'}
Description: ${description || 'N/A'}

Available Categories:
${categoryNames.join(', ')}

Return ONLY the exact name of the best matching category from the list above.
If the part does not fit clearly into any specific category, return 'other'.
Do not make up new categories.
Do not add explanations or quotes.`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 }
    };

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to get category suggestion from Gemini' }), { status: 200, headers: jsonHeaders });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Failed to extract text from Gemini response' }), { status: 200, headers: jsonHeaders });
    }

    // Free-text parsing — same approach Base44's original InvokeLLM call already used
    let suggestedCategory = rawText.trim().replace(/^['"]|['"]$/g, '');

    // Validate against real category list (case-insensitive), fallback to 'other'
    const match = categoryNames.find((c) => c.toLowerCase() === suggestedCategory.toLowerCase());
    if (match) {
      suggestedCategory = match;
    } else {
      const otherCategory = categoryNames.find((c) => c.toLowerCase() === 'other');
      suggestedCategory = otherCategory || categoryNames[0];
    }

    return new Response(JSON.stringify({ category: suggestedCategory }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error('Error in autopro-suggestInventoryCategory:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
