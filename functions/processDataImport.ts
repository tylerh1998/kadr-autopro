import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Papa from 'npm:papaparse@5.4.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { file_url, type } = await req.json();

        if (!file_url) {
            return Response.json({ error: "No file URL provided" }, { status: 400 });
        }

        // Fetch the file content
        console.log(`Fetching file from ${file_url}`);
        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) throw new Error("Failed to fetch file");
        const fileText = await fileResponse.text();

        // Parse CSV
        console.log("Parsing CSV...");
        const parseResult = Papa.parse(fileText, { header: true, skipEmptyLines: true });
        
        if (parseResult.errors.length > 0) {
             console.warn("CSV Parse warnings:", parseResult.errors);
        }
        
        const rows = parseResult.data;
        console.log(`Parsed ${rows.length} rows.`);

        let recordsToCreate = [];
        let entityName = "";

        if (type === 'inventory') {
            entityName = "InventoryItem";
            
            // Fetch TagAlongs for mapping
            console.log("Fetching TagAlongs...");
            const tagAlongs = await base44.asServiceRole.entities.TagAlong.list({ limit: 1000 });
            const tagAlongMap = new Map();
            tagAlongs.forEach(ta => {
                if (ta.tagalongid) tagAlongMap.set(String(ta.tagalongid), ta.id);
            });

            // Map rows to entity
            recordsToCreate = rows.map(row => {
                // Flexible header matching
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                const tagAlongIdKey = getVal(['TagAlongId', 'tagalongid', 'TagAlongID']);
                let tag_along_id = null;
                if (tagAlongIdKey) {
                    tag_along_id = tagAlongMap.get(String(tagAlongIdKey));
                }

                const partNum = String(getVal(['partnum', 'Partnum', 'PartNum', 'part_number']) || '');
                // Skip empty rows if any
                if (!partNum) return null;

                return {
                    part_number: partNum,
                    description: String(getVal(['description', 'Description']) || ''),
                    quantity_on_hand: parseFloat(getVal(['qoh', 'QOH', 'quantity_on_hand']) || 0) || 0,
                    cost: parseFloat(getVal(['lastcost', 'LastCost', 'Lastcost', 'cost']) || 0) || 0,
                    location: String(getVal(['location', 'Location']) || ''),
                    core: (getVal(['chkhasacore', 'ChkHasACore', 'core']) == 1 || getVal(['chkhasacore', 'ChkHasACore', 'core']) === '1'),
                    core_cost: parseFloat(getVal(['lastcorecost', 'LastCoreCost', 'Lastcorecost', 'core_cost']) || 0) || 0,
                    selling_price: 0, // Default
                    is_active: true,
                    tag_along_id: tag_along_id
                };
            }).filter(r => r !== null);
        
        } else if (type === 'customers') {
            entityName = "Customer";
            recordsToCreate = rows.map(row => {
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                // Helper to clean phone numbers (digits only)
                const cleanPhone = (str) => String(str || '').replace(/\D/g, '');

                // Phone logic: acell + cell
                const acell = cleanPhone(getVal(['acell', 'ACell']));
                const cell = cleanPhone(getVal(['cell', 'Cell']));
                // Only use cell columns. If empty, leave empty.
                const phone = (acell && cell) ? `${acell}${cell}` : (cell || '');

                // Phone is no longer required for import
                // if (!phone) return null;

                // Secondary phone logic: ahtel + htel
                const ahtel = cleanPhone(getVal(['ahtel', 'AHTel']));
                const htel = cleanPhone(getVal(['htel', 'HTel']));
                const secondary_phone = (ahtel && htel) ? `${ahtel}${htel}` : (htel || '');

                // Business phone logic for notes: abtel + btel (assuming user meant btel when saying htel in notes rule)
                const abtel = cleanPhone(getVal(['abtel', 'ABTel']));
                const btel = cleanPhone(getVal(['btel', 'BTel']));
                const business_phone = (abtel && btel) ? `${abtel}${btel}` : (btel || '');

                let notes = "";
                if (business_phone) {
                    notes = `Legacy Business Phone: ${business_phone}`;
                }

                return {
                    org_name: String(getVal(['company', 'Company', 'org_name']) || ''),
                    first_name: String(getVal(['fname', 'Fname', 'first_name']) || ''),
                    last_name: String(getVal(['lname', 'Lname', 'last_name']) || ''),
                    phone: phone,
                    secondary_phone: secondary_phone,
                    email: String(getVal(['email', 'Email']) || ''),
                    address: String(getVal(['street', 'Street', 'address']) || ''),
                    city: String(getVal(['city', 'City']) || ''),
                    state: String(getVal(['province', 'Province', 'state']) || ''),
                    zip_code: String(getVal(['postal', 'Postal', 'zip_code']) || ''),
                    cusid: String(getVal(['cusid', 'Cusid', 'CusId']) || ''),
                    notes: notes,
                    default_taxable: true
                };
            }).filter(r => r !== null);

        } else if (type === 'vehicles') {
            entityName = "Vehicle";
            // Note: Vehicles typically require a customer_id. This is tricky in batch import without lookup.
            // For now, we'll map what we can, but this might fail validation if customer_id is missing.
            // Assuming simple mapping for now.
             recordsToCreate = rows.map(row => {
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                return {
                    year: parseFloat(getVal(['year', 'Year']) || 0) || 0,
                    make: String(getVal(['make', 'Make']) || ''),
                    model: String(getVal(['model', 'Model']) || ''),
                    vin: String(getVal(['vin', 'VIN']) || ''),
                    license_plate: String(getVal(['license_plate', 'LicensePlate', 'Plate']) || ''),
                    // customer_id mapping would be needed here in a real scenario
                };
            }).filter(r => r !== null);
        }

        if (recordsToCreate.length === 0) {
            return Response.json({ success: true, count: 0, message: "No valid records found to import" });
        }

        console.log(`Ready to import ${recordsToCreate.length} records into ${entityName}`);

        // Batch Insert
        const BATCH_SIZE = 100;
        let processed = 0;
        let errors = 0;

        for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
            const batch = recordsToCreate.slice(i, i + BATCH_SIZE);
            try {
                if (entityName) {
                    await base44.asServiceRole.entities[entityName].bulkCreate(batch);
                }
                processed += batch.length;
                console.log(`Processed batch ${i / BATCH_SIZE + 1}: ${processed} / ${recordsToCreate.length}`);
            } catch (err) {
                console.error(`Error importing batch starting at index ${i}:`, err);
                errors += batch.length; 
            }
        }

        return Response.json({
            success: true,
            message: `Imported ${processed} items. Failed ${errors}.`,
            total_processed: processed,
            total_failed: errors
        });

    } catch (error) {
        console.error("Critical error in processDataImport:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});