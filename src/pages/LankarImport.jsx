import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Upload, Package, Users, Car, Loader2, CheckCircle, AlertTriangle, RotateCcw, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { InventoryItem, TagAlong } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import LankarImportReturnModal from '@/components/inventory/LankarImportReturnModal';
import AddLegacyInvoiceModal from '@/components/lankar/AddLegacyInvoiceModal';
import LegacyWorkOrderImportModal from '@/components/lankar/LegacyWorkOrderImportModal';

export default function LankarImport() {
  const [selectedType, setSelectedType] = useState('inventory');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showLegacyInvoiceModal, setShowLegacyInvoiceModal] = useState(false);
  const [showWorkOrderImportModal, setShowWorkOrderImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [tagAlongs, setTagAlongs] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    loadTagAlongs();
  }, []);

  const loadTagAlongs = async () => {
    try {
      const data = await TagAlong.list();
      setTagAlongs(data);
    } catch (error) {
      console.error('Error loading tag alongs:', error);
    }
  };

  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
      setParsedData([]); // We don't parse on client anymore
      setUploadedFileUrl(null);
      setImporting(true); // Reuse state to show uploading

      try {
        // Just upload the file
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setUploadedFileUrl(file_url);
        // We set parsedData to a dummy array to enable the Import button (since we don't parse client-side anymore)
        setParsedData([{ placeholder: true }]); 
      } catch (error) {
        console.error('Error uploading file:', error);
        setImportResult({ success: false, message: 'Error uploading file: ' + error.message });
      } finally {
        setImporting(false);
      }
    }
  };

  const handleImport = async () => {
    if (!uploadedFileUrl) return;

    setImporting(true);
    setImportResult(null);

    try {
      if (selectedType === 'balance_sheet') {
        const dryRunResponse = await base44.functions.invoke('processDataImport', {
          file_url: uploadedFileUrl,
          type: selectedType,
          dry_run: true
        });

        if (dryRunResponse.data.success) {
          const { total_debits, total_credits } = dryRunResponse.data;
          const confirmed = window.confirm(`Please review the totals before importing:\n\nTotal Debits: $${total_debits.toFixed(2)}\nTotal Credits: $${total_credits.toFixed(2)}\n\nProceed with import?`);
          if (!confirmed) {
            setImporting(false);
            return;
          }
        } else {
          throw new Error(dryRunResponse.data.error || 'Failed to calculate totals');
        }
      }

      // Call the backend function
      const response = await base44.functions.invoke('processDataImport', {
        file_url: uploadedFileUrl,
        type: selectedType
      });

      if (response.data.success) {
        setImportResult({
          success: true,
          message: response.data.message
        });
      } else {
        throw new Error(response.data.error || 'Unknown error occurred during import');
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({ success: false, message: 'Import failed: ' + error.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => window.location.href = createPageUrl('Setup')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Setup
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Lankar Import</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Import data in bulk from CSV files</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowLegacyInvoiceModal(true)}
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
            >
              <FileText className="w-4 h-4 mr-2" />
              Add Legacy Invoice to AR
            </Button>
            <Button 
              onClick={() => setShowWorkOrderImportModal(true)}
              variant="outline"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30"
            >
              <FileText className="w-4 h-4 mr-2" />
              Import Work Order
            </Button>
            <Button 
              onClick={() => setShowReturnModal(true)}
              variant="outline"
              className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/30"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Add Legacy Return
            </Button>
          </div>
        </div>
      </div>

      <LegacyWorkOrderImportModal
        open={showWorkOrderImportModal}
        onClose={() => setShowWorkOrderImportModal(false)}
      />
      <LankarImportReturnModal 
        open={showReturnModal} 
        onClose={() => setShowReturnModal(false)}
        onUpdate={() => {
          // Optional: handle any post-update logic if needed
        }}
      />
      <AddLegacyInvoiceModal
        open={showLegacyInvoiceModal}
        onClose={() => setShowLegacyInvoiceModal(false)}
      />

      <div className="space-y-6">
        {/* Database Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Database Type</CardTitle>
            <CardDescription>Select the type of data you want to import</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedType} onValueChange={setSelectedType} className="space-y-3">
              {/* Customers */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="customers" id="customers" />
                <Label htmlFor="customers" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Users className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">Customers</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import customer records</p>
                  </div>
                </Label>
              </div>

              {/* Vehicles */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="vehicles" id="vehicles" />
                <Label htmlFor="vehicles" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Car className="w-5 h-5 text-purple-600" />
                  <div className="w-full">
                    <p className="font-medium">Vehicles</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import vehicle records</p>
                    {selectedType === 'vehicles' && (
                        <div className="mt-2 text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold mb-1">Required Columns:</p>
                            <code className="text-purple-700">cusid, vehid, year, make, model, vin, engsize, unitno, colour</code>
                        </div>
                    )}
                  </div>
                </Label>
              </div>

              {/* Suppliers */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="suppliers" id="suppliers" />
                <Label htmlFor="suppliers" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Package className="w-5 h-5 text-orange-600" />
                  <div>
                    <p className="font-medium">Suppliers</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import supplier records</p>
                    {selectedType === 'suppliers' && (
                        <div className="mt-2 text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold mb-1">Required Columns:</p>
                            <code className="text-orange-700">supid, company, Inventory_Supplier, contact, street, city, province, postal, atel, tel</code>
                        </div>
                    )}
                  </div>
                </Label>
              </div>

              {/* Inventory */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="inventory" id="inventory" />
                <Label htmlFor="inventory" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Package className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium">Inventory</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import inventory items and parts</p>
                    {selectedType === 'inventory' && (
                        <div className="mt-2 text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold mb-1">Required Columns:</p>
                            <code className="text-blue-700">partnum, description, qoh, lastcost, lastlist, location, chkhasacore, lastcorecost, category, reorderamt, reorderMAXamount</code>
                        </div>
                    )}
                  </div>
                </Label>
              </div>

              {/* Inventory Locations */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="inventory_locations" id="inventory_locations" />
                <Label htmlFor="inventory_locations" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Package className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="font-medium">Inventory Locations</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import location records from XLSX</p>
                    {selectedType === 'inventory_locations' && (
                        <div className="mt-2 text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold mb-1">Required Columns:</p>
                            <code className="text-indigo-700">Location (or Name), Description (optional)</code>
                        </div>
                    )}
                  </div>
                </Label>
              </div>

              {/* Balance Sheet */}
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <RadioGroupItem value="balance_sheet" id="balance_sheet" />
                <Label htmlFor="balance_sheet" className="flex items-center gap-3 cursor-pointer flex-1">
                  <FileText className="w-5 h-5 text-teal-600" />
                  <div>
                    <p className="font-medium">Balance Sheet</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Import closing balances as GL Transactions</p>
                    {selectedType === 'balance_sheet' && (
                        <div className="mt-2 text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            <p className="font-semibold mb-1">Required Columns:</p>
                            <code className="text-teal-700">Acct #, DR, CR</code>
                        </div>
                    )}
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select a CSV or Excel file to import</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
              />
              {selectedFile && (
                <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  <p>Selected: <span className="font-medium">{selectedFile.name}</span></p>
                  {parsedData.length > 0 && (
                    <p className="text-green-600 mt-1">File ready for import</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Import Result */}
        {importResult && (
          <Card className={importResult.success ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}>
            <CardContent className="py-4 flex items-center gap-3">
              {importResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              <p className={importResult.success ? 'text-green-800' : 'text-red-800'}>
                {importResult.message}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Import Button */}
        <Button 
          onClick={handleImport}
          disabled={parsedData.length === 0 || importing}
          className="w-full" 
          size="lg"
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Import Data (Batch Process)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}