import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const BACKUP_FOLDER_ID = '1tK4Y51c34IvvvECpHaTrzUd_8s6ziOxc';

Deno.serve(async (req) => {
    console.log('--- backupToGoogleDrive function invoked ---');
    const base44 = createClientFromRequest(req);

    try {
        // No user authentication required - designed to be triggered by cron jobs
        console.log('Fetching Google Drive access token...');
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

        if (!accessToken) {
            return Response.json({ 
                error: 'Google Drive not authorized. Please authorize Google Drive first.' 
            }, { status: 401 });
        }

        console.log('Starting data export...');

        // Get all entity names from the app
        const entityNames = [
            'WorkOrder', 'Customer', 'Vehicle', 'InventoryItem', 'Employee',
            'Appointment', 'Supplier', 'SupplierInvoiceLine', 'SupplierPayment',
            'ChartOfAccount', 'GLTransaction', 'BankAccount', 'BankTransaction',
            'SalesClass', 'TagAlong', 'OtherChargeList', 'InventoryReturn',
            'ReturnReason', 'TechTimeLog', 'SentEmailLog', 'CustomerPortalWorkOrder',
            'CustomerPayments', 'CustomerARAdjustment', 'InventoryTxs', 'InventoryLocation',
            'FiscalPeriod', 'LinesOfCredit', 'LinesOfCreditTransaction', 'Statement',
            'PayrollTransaction', 'SystemSettings', 'CashDrawerAdjustment',
            'BankReconciliation', 'WorkOrderStatus', 'GSTReturn', 'DepositSlipBreakdown'
        ];

        const backupData = {
            backup_date: new Date().toISOString(),
            app_name: 'AutoPRO',
            entities: {}
        };

        // Fetch all entity data
        for (const entityName of entityNames) {
            try {
                console.log(`Fetching ${entityName}...`);
                const data = await base44.asServiceRole.entities[entityName].list();
                backupData.entities[entityName] = data;
                console.log(`  → ${data.length} records`);
            } catch (err) {
                console.log(`  → Skipped ${entityName}: ${err.message}`);
                backupData.entities[entityName] = { error: err.message };
            }
        }

        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `AutoPRO_Backup_${timestamp}.json`;

        console.log('Creating backup file...');
        const jsonContent = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });

        // Upload to Google Drive
        console.log('Uploading to Google Drive...');
        const metadata = {
            name: filename,
            parents: [BACKUP_FOLDER_ID],
            mimeType: 'application/json'
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const uploadResponse = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                body: form
            }
        );

        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.text();
            console.error('Google Drive upload error:', errorData);
            throw new Error(`Failed to upload to Google Drive: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        const fileData = await uploadResponse.json();
        const fileUrl = `https://drive.google.com/file/d/${fileData.id}/view`;

        console.log('Backup completed successfully!');
        console.log('File ID:', fileData.id);
        console.log('File URL:', fileUrl);

        return Response.json({
            success: true,
            message: 'Backup completed successfully',
            filename: filename,
            fileId: fileData.id,
            fileUrl: fileUrl,
            recordCount: Object.keys(backupData.entities).length
        });

    } catch (error) {
        console.error('Error in backupToGoogleDrive:', error);
        return Response.json({ 
            error: error.message || 'Backup failed' 
        }, { status: 500 });
    }
});