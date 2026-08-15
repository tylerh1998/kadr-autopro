import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { vin } = await req.json();
    if (!vin || vin.length < 11) {
      return new Response(JSON.stringify({ error: 'A valid VIN is required.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`);
    if (!response.ok) throw new Error(`NHTSA API failed with status: ${response.status}`);
    const data = await response.json();
    const results = data.Results;
    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: 'VIN could not be decoded.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const getValue = (variableName) => {
      const item = results.find((r) => r.Variable === variableName && r.Value && r.Value.trim() !== 'Not Applicable');
      return item ? item.Value.trim() : null;
    };

    const year = getValue('Model Year');
    const make = getValue('Make');
    const model = getValue('Model');
    const trimVal = getValue('Trim');
    const seriesVal = getValue('Series');
    const uniqueTrimParts = [];
    if (trimVal) uniqueTrimParts.push(trimVal);
    if (seriesVal && !uniqueTrimParts.includes(seriesVal)) uniqueTrimParts.push(seriesVal);
    const combinedTrim = uniqueTrimParts.join(' ');

    const engineCylinders = getValue('Engine Number of Cylinders');
    const displacementL = getValue('Displacement (L)');
    const fuelType = getValue('Fuel Type - Primary');
    let engineString = '';
    if (engineCylinders) engineString += `V${engineCylinders} `;
    if (displacementL) engineString += `${displacementL}L `;
    if (fuelType) engineString += fuelType;

    const decodedData = { year: year || '', make: make || '', model: model || '', trim: combinedTrim, engine: engineString.trim() || '' };
    if (!decodedData.year || !decodedData.make || !decodedData.model) {
      return new Response(JSON.stringify({ error: 'VIN decoded, but essential data (Year, Make, Model) was not found.' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(decodedData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: `An error occurred during VIN decoding: ${error.message}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
