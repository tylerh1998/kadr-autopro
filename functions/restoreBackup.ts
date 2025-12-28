import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
        }

        const { backupData } = await req.json();

        if (!backupData || !backupData.entities) {
            return Response.json({ error: "Invalid backup file format" }, { status: 400 });
        }

        console.log(`Starting restore for app: ${backupData.app_name}, Date: ${backupData.backup_date}`);

        let totalProcessed = 0;
        let totalFailed = 0;
        const results = {};

        // Process each entity type
        for (const [entityName, records] of Object.entries(backupData.entities)) {
            // Skip if it's an error object or empty
            if (!Array.isArray(records) || records.length === 0) {
                console.log(`Skipping ${entityName} (no records or invalid format)`);
                continue;
            }

            // Check if entity exists in SDK (simple check)
            if (!base44.asServiceRole.entities[entityName]) {
                console.log(`Skipping ${entityName} (entity not found in SDK)`);
                results[entityName] = { status: 'skipped', reason: 'Entity not found' };
                continue;
            }

            console.log(`Restoring ${entityName}: ${records.length} records...`);

            // Batch insert
            const BATCH_SIZE = 50;
            let entityProcessed = 0;
            let entityFailed = 0;

            for (let i = 0; i < records.length; i += BATCH_SIZE) {
                const batch = records.slice(i, i + BATCH_SIZE);
                try {
                    // Try to insert. Note: IDs might be ignored or cause conflicts depending on DB
                    // We attempt to keep the ID if possible to preserve relationships
                    // If the backend doesn't support setting ID, relationships will break.
                    await base44.asServiceRole.entities[entityName].bulkCreate(batch);
                    entityProcessed += batch.length;
                } catch (err) {
                    console.error(`Error batch inserting ${entityName}:`, err.message);
                    entityFailed += batch.length;
                }
            }

            totalProcessed += entityProcessed;
            totalFailed += entityFailed;
            results[entityName] = { processed: entityProcessed, failed: entityFailed };
            console.log(`  -> ${entityName}: ${entityProcessed} ok, ${entityFailed} failed`);
        }

        return Response.json({
            success: true,
            total_processed: totalProcessed,
            total_failed: totalFailed,
            details: results
        });

    } catch (error) {
        console.error("Critical error in restoreBackup:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});