import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Papa from 'npm:papaparse@5.4.1';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { file_url, type, dry_run } = await req.json();

        if (!file_url) {
            return Response.json({ error: "No file URL provided" }, { status: 400 });
        }

        // Fetch the file content
        console.log(`Fetching file from ${file_url}`);
        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) throw new Error("Failed to fetch file");
        
        const fileBuffer = await fileResponse.arrayBuffer();
        let rows = [];

        // Check for Excel file extension
        // Note: The file_url from Base44 storage typically preserves the extension
        const isExcel = file_url.toLowerCase().includes('.xlsx') || file_url.toLowerCase().includes('.xls');

        if (isExcel) {
             console.log("Parsing Excel file...");
             const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });
             const sheetName = workbook.SheetNames[0];
             rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else {
             // Parse CSV
             console.log("Parsing CSV...");
             const fileText = new TextDecoder().decode(fileBuffer);
             const parseResult = Papa.parse(fileText, { header: true, skipEmptyLines: true });
             
             if (parseResult.errors.length > 0) {
                  console.warn("CSV Parse warnings:", parseResult.errors);
             }
             rows = parseResult.data;
        }
        
        console.log(`Parsed ${rows.length} rows.`);

        let recordsToCreate = [];
        let entityName = "";

        if (type === 'inventory') {
            entityName = "InventoryItem";
            
            // Fetch TagAlongs for mapping
            console.log("Fetching TagAlongs...");
            // Correct SDK usage: list(sort, limit)
            const tagAlongs = await base44.asServiceRole.entities.TagAlong.list(null, 1000);
            const tagAlongMap = new Map();
            tagAlongs.forEach(ta => {
                if (ta.tagalongid) tagAlongMap.set(String(ta.tagalongid), ta.id);
            });

            // Fetch Suppliers for mapping
            console.log("Fetching Suppliers for ID mapping...");
            // Correct SDK usage: list(sort, limit)
            const suppliers = await base44.asServiceRole.entities.Supplier.list(null, 1000);
            const supplierMap = new Map();
            suppliers.forEach(s => {
                if (s.supid) {
                    supplierMap.set(String(s.supid).trim(), s.id);
                }
            });
            console.log(`Fetched ${suppliers.length} suppliers. Mapped ${supplierMap.size} suppliers by legacy ID.`);
            if (suppliers.length > 0) {
                 console.log("Sample supplier mapping keys:", Array.from(supplierMap.keys()).slice(0, 5));
            }

            // Fetch Inventory Categories for mapping
            console.log("Fetching Inventory Categories for mapping...");
            const inventoryCategories = await base44.asServiceRole.entities.InventoryCategory.list(null, 1000);
            const legacyCategoryMap = new Map();
            
            inventoryCategories.forEach(cat => {
                if (cat.lankar_categories) {
                    // Split by comma and clean up
                    const legacyList = cat.lankar_categories.split(',').map(s => s.trim().toUpperCase());
                    legacyList.forEach(legacyName => {
                        if (legacyName) {
                            legacyCategoryMap.set(legacyName, cat.name);
                        }
                    });
                }
            });
            console.log(`Mapped ${legacyCategoryMap.size} legacy categories.`);

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

                const supidKey = getVal(['supid', 'Supid', 'SupID', 'SupplierId']);
                let supplier_id = null;
                if (supidKey) {
                    supplier_id = supplierMap.get(String(supidKey).trim());
                }

                const partNum = String(getVal(['partnum', 'Partnum', 'PartNum', 'part_number']) || '');
                // Skip empty rows if any
                if (!partNum) return null;

                const location = String(getVal(['location', 'Location']) || '');

                // Map legacy category
                const legacyCategory = String(getVal(['category', 'Category']) || '').trim().toUpperCase();
                let mappedCategory = '';
                if (legacyCategory && legacyCategoryMap.has(legacyCategory)) {
                    mappedCategory = legacyCategoryMap.get(legacyCategory);
                }

                // Map reorder amounts
                const minQty = parseInt(getVal(['reorderamt', 'reorderamount', 'ReorderAmt']) || 0) || 0;
                const maxQty = parseInt(getVal(['reorderMAXamount', 'reordermaxamount', 'ReorderMAXAmount']) || 0) || 0;

                return {
                    part_number: partNum,
                    description: String(getVal(['description', 'Description']) || ''),
                    quantity_on_hand: parseFloat(getVal(['qoh', 'QOH', 'quantity_on_hand']) || 0) || 0,
                    cost: parseFloat(getVal(['lastcost', 'LastCost', 'Lastcost', 'cost']) || 0) || 0,
                    location: location,
                    core: (getVal(['chkhasacore', 'ChkHasACore', 'core']) == 1 || getVal(['chkhasacore', 'ChkHasACore', 'core']) === '1'),
                    core_cost: parseFloat(getVal(['lastcorecost', 'LastCoreCost', 'Lastcorecost', 'core_cost']) || 0) || 0,
                    selling_price: parseFloat(getVal(['lastlist', 'LastList', 'lastlist', 'selling_price']) || 0) || 0,
                    minimum_quantity: minQty,
                    maximum_quantity: maxQty,
                    category: mappedCategory,
                    is_active: true,
                    stocked_item: location.trim().length > 0,
                    tag_along_id: tag_along_id,
                    supplier_id: supplier_id
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
                    cusid: String(getVal(['cusid', 'Cusid', 'CusId', 'CUSID', 'Customer ID', 'CustomerId', 'CustomerID']) || ''),
                    notes: notes,
                    default_taxable: true
                };
            }).filter(r => r !== null);

        } else if (type === 'vehicles') {
            entityName = "Vehicle";
            
            if (rows.length > 0) {
                console.log("Headers detected:", Object.keys(rows[0]));
            }

            // Fetch Customers for mapping cusid to customer_id
            console.log("Fetching Customers for ID mapping...");
            
            const customerMap = new Map();
            let hasMore = true;
            let skip = 0;
            const FETCH_LIMIT = 1000; 
            
            while (hasMore) {
                // Try fetching using list with correct arguments (sort, limit, skip)
                // Passing null for sort to use default
                const customers = await base44.asServiceRole.entities.Customer.list(null, FETCH_LIMIT, skip);
                
                if (!customers || customers.length === 0) {
                    hasMore = false;
                } else {
                    // Log the first customer to help debug field names
                    if (skip === 0 && customers.length > 0) {
                        console.log("DEBUG: Sample Customer Record from DB:", JSON.stringify(customers[0]));
                    }
                    
                    customers.forEach(c => {
                        // Handle flattened or nested data structure
                        const recordData = c.data || c;
                        const cusIdVal = recordData.cusid || c.cusid; // try both levels
                        
                        // Store trimmed string version of cusid
                        if (cusIdVal) {
                             customerMap.set(String(cusIdVal).trim(), c.id);
                        }
                    });
                    skip += customers.length;
                    console.log(`Fetched ${skip} customers so far...`);
                    
                    // Safety break to prevent infinite loops if something is wrong with pagination
                    if (customers.length < FETCH_LIMIT) {
                        hasMore = false;
                    }
                }
            }
            console.log(`Built customer map with ${customerMap.size} entries.`);
            
            // Debug: log first few keys in customer map
            console.log("Sample Customer IDs in DB:", Array.from(customerMap.keys()).slice(0, 5));

            let missingCusIdCount = 0;
            let customerNotFoundCount = 0;

             recordsToCreate = rows.map((row, index) => {
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                const rawCusId = getVal(['cusid', 'CusId', 'Cusid', 'CUSID']);
                const cusId = String(rawCusId || '').trim();
                
                if (!cusId) {
                    missingCusIdCount++;
                    if (missingCusIdCount <= 5) console.warn(`Row ${index}: Missing cusid in CSV (Raw: ${rawCusId})`);
                    return null;
                }

                const customer_id = customerMap.get(cusId);

                // If no customer found for this vehicle, we can't create it validly as customer_id is required.
                if (!customer_id) {
                    customerNotFoundCount++;
                    if (customerNotFoundCount <= 5) console.warn(`Row ${index}: Skipped - Customer ID '${cusId}' not found in DB.`);
                    return null;
                }

                return {
                    customer_id: customer_id,
                    vehid: String(getVal(['vehid', 'VehId', 'Vehid']) || ''),
                    year: parseFloat(getVal(['year', 'Year']) || 0) || 0,
                    make: String(getVal(['make', 'Make']) || ''),
                    model: String(getVal(['model', 'Model']) || ''),
                    vin: String(getVal(['vin', 'VIN']) || ''),
                    engine: String(getVal(['engsize', 'EngSize', 'Engine']) || ''),
                    unit_number: String(getVal(['unitno', 'UnitNo', 'UnitNumber']) || ''),
                    color: String(getVal(['colour', 'Colour', 'Color']) || ''),
                };
            }).filter(r => r !== null);

            if (recordsToCreate.length === 0) {
                 const details = ` (Stats: ${rows.length} rows in file. ${missingCusIdCount} missing ID in CSV. ${customerNotFoundCount} IDs not found in DB. DB has ${customerMap.size} customers with legacy IDs)`;
                 console.log(details);
                 return Response.json({ success: true, count: 0, message: "No valid records matched." + details });
            }
        } else if (type === 'suppliers') {
            entityName = "Supplier";
            recordsToCreate = rows.map(row => {
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                // Phone logic
                const atel = String(getVal(['atel', 'Atel']) || '').trim();
                const tel = String(getVal(['tel', 'Tel']) || '').trim();
                let phone = "";
                if (atel && tel) {
                    phone = `${atel}${tel}`;
                } else {
                    phone = atel || tel || "";
                }

                // Inventory Supplier logic
                const invSupVal = String(getVal(['Inventory_Supplier', 'inventory_supplier', 'InventorySupplier']) || '').toLowerCase();
                const isInventorySupplier = invSupVal === 'yes' || invSupVal === 'true' || invSupVal === '1';

                return {
                    supid: String(getVal(['supid', 'SupId', 'SupID']) || ''),
                    name: String(getVal(['company', 'Company', 'org_name']) || ''),
                    inventory_supplier: isInventorySupplier,
                    default_gl_account: String(getVal(['Default_GL_Account', 'default_gl_account', 'glacct', 'GLAcct', 'DefaultGLAccount', 'GLAccount']) || '5000'), 
                    contact_person: String(getVal(['contact', 'Contact']) || ''),
                    address: String(getVal(['street', 'Street', 'address']) || ''),
                    town: String(getVal(['city', 'City', 'town']) || ''),
                    province: String(getVal(['province', 'Province']) || ''),
                    postal_code: String(getVal(['postal', 'Postal', 'postal_code']) || ''),
                    phone: phone,
                    notes: String(getVal(['SupplierNote', 'Suppliernote', 'supplier_note', 'notes']) || ''),
                    pin_to_top: false
                };
            }).filter(r => r.name);

        } else if (type === 'inventory_locations') {
            entityName = "InventoryLocation";
            recordsToCreate = rows.map(row => {
                 const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                const name = String(getVal(['Location', 'location', 'Name', 'name', 'LocationName']) || '').trim();
                if (!name) return null;

                return {
                    location_name: name,
                    description: String(getVal(['Description', 'description']) || ''),
                    is_active: true
                };
            }).filter(r => r !== null);
        } else if (type === 'balance_sheet') {
            entityName = "GLTransaction";
            recordsToCreate = rows.map(row => {
                const getVal = (keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                    }
                    return undefined;
                };

                const accountNumber = String(getVal(['Acct #', 'acct #', 'Account #', 'account #', 'account_number']) || '').trim();
                const debit = parseFloat(getVal(['DR', 'dr', 'Debit', 'debit']) || 0) || 0;
                const credit = parseFloat(getVal(['CR', 'cr', 'Credit', 'credit']) || 0) || 0;

                if (!accountNumber || (debit === 0 && credit === 0)) {
                    return null;
                }

                return {
                    account_number: accountNumber,
                    transaction_date: '2025-12-31',
                    description: 'Closing balance 2025',
                    reference: 'Balance-Sheet-Import',
                    debit_amount: debit,
                    credit_amount: credit,
                    source_type: 'manual'
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