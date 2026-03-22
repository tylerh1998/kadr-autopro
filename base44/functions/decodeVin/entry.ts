import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const { vin } = await req.json();
        if (!vin || vin.length < 11) { // Basic VIN length validation
            return Response.json({ error: 'A valid VIN is required.' }, { status: 400 });
        }

        const apiUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`NHTSA API failed with status: ${response.status}`);
        }

        const data = await response.json();
        const results = data.Results;

        if (!results || results.length === 0) {
            return Response.json({ error: 'VIN could not be decoded.' }, { status: 404 });
        }
        
        const getValue = (variableName) => {
            const item = results.find(r => r.Variable === variableName && r.Value && r.Value.trim() !== 'Not Applicable');
            return item ? item.Value : null;
        };

        const year = getValue('Model Year');
        const make = getValue('Make');
        const model = getValue('Model');
        const trim = getValue('Trim') || getValue('Series') || '';
        
        // Construct a descriptive engine string
        const engineCylinders = getValue('Engine Number of Cylinders');
        const displacementL = getValue('Displacement (L)');
        const fuelType = getValue('Fuel Type - Primary');
        
        let engineString = '';
        if (engineCylinders) engineString += `V${engineCylinders} `;
        if (displacementL) engineString += `${displacementL}L `;
        if (fuelType) engineString += fuelType;
        
        const decodedData = {
            year: year || '',
            make: make || '',
            model: model || '',
            trim: trim,
            engine: engineString.trim() || '',
        };

        // Check if essential data was found
        if (!decodedData.year || !decodedData.make || !decodedData.model) {
             return Response.json({ error: 'VIN decoded, but essential data (Year, Make, Model) was not found.' }, { status: 404 });
        }

        return Response.json(decodedData, { status: 200 });

    } catch (error) {
        console.error('Error in decodeVin function:', error);
        return Response.json({ error: `An error occurred during VIN decoding: ${error.message}` }, { status: 500 });
    }
});