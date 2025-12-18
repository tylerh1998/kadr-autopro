import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Upload, Package, Users, Car, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { InventoryItem, TagAlong } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function LankarImport() {
  const [selectedType, setSelectedType] = useState('inventory');
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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
      setParsedData([]);
      
      try {
        // Upload file first
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        // Extract data using the integration
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                partnum: { type: "string" },
                description: { type: "string" },
                qoh: { type: "number" },
                lastcost: { type: "number" },
                location: { type: "string" },
                chkhasacore: { type: "number" },
                lastcorecost: { type: "number" },
                TagAlongId: { type: "string" }
              }
            }
          }
        });
        
        if (result.status === 'success' && result.output) {
          const data = Array.isArray(result.output) ? result.output : [result.output];
          setParsedData(data);
        } else {
          setImportResult({ success: false, message: 'Error parsing file: ' + (result.details || 'Unknown error') });
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        setImportResult({ success: false, message: 'Error parsing file: ' + error.message });
      }
    }
  };

  const handleImport = async () => {
    if (selectedType !== 'inventory' || parsedData.length === 0) return;

    setImporting(true);
    setImportResult(null);

    let successCount = 0;
    let errorCount = 0;
    let skippedTagAlongs = 0;

    try {
      for (const row of parsedData) {
        try {
          // Find matching tagalong by tagalongid
          let tag_along_id = null;
          if (row.TagAlongId || row.tagalongid || row.TagAlongID) {
            const tagAlongIdValue = String(row.TagAlongId || row.tagalongid || row.TagAlongID);
            const matchingTagAlong = tagAlongs.find(ta => ta.tagalongid === tagAlongIdValue);
            if (matchingTagAlong) {
              tag_along_id = matchingTagAlong.id;
            } else {
              skippedTagAlongs++;
            }
          }

          const inventoryItem = {
            part_number: String(row.partnum || row.Partnum || row.PartNum || ''),
            description: String(row.description || row.Description || ''),
            quantity_on_hand: parseFloat(row.qoh || row.QOH || 0) || 0,
            cost: parseFloat(row.lastcost || row.LastCost || row.Lastcost || 0) || 0,
            location: String(row.location || row.Location || ''),
            core: (row.chkhasacore === 1 || row.chkhasacore === '1' || row.ChkHasACore === 1 || row.ChkHasACore === '1'),
            core_cost: parseFloat(row.lastcorecost || row.LastCoreCost || row.Lastcorecost || 0) || 0,
            selling_price: 0,
            is_active: true,
          };

          if (tag_along_id) {
            inventoryItem.tag_along_id = tag_along_id;
          }

          await InventoryItem.create(inventoryItem);
          successCount++;
        } catch (error) {
          console.error('Error importing row:', row, error);
          errorCount++;
        }
      }

      setImportResult({
        success: true,
        message: `Import complete: ${successCount} items imported, ${errorCount} errors${skippedTagAlongs > 0 ? `, ${skippedTagAlongs} tag-alongs not found` : ''}`
      });
    } catch (error) {
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
        <h1 className="text-3xl font-bold text-slate-900">Lankar Import</h1>
        <p className="text-slate-600 mt-1">Import data in bulk from CSV files</p>
      </div>

      <div className="space-y-6">
        {/* Database Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Database Type</CardTitle>
            <CardDescription>Select the type of data you want to import</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedType} onValueChange={setSelectedType} className="space-y-3">
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="inventory" id="inventory" />
                <Label htmlFor="inventory" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Package className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium">Inventory</p>
                    <p className="text-sm text-slate-500">Import inventory items and parts</p>
                  </div>
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="customers" id="customers" />
                <Label htmlFor="customers" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Users className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">Customers</p>
                    <p className="text-sm text-slate-500">Import customer records</p>
                  </div>
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="vehicles" id="vehicles" />
                <Label htmlFor="vehicles" className="flex items-center gap-3 cursor-pointer flex-1">
                  <Car className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="font-medium">Vehicles</p>
                    <p className="text-sm text-slate-500">Import vehicle records</p>
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
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
              />
              {selectedFile && (
                <div className="mt-4 text-sm text-slate-600">
                  <p>Selected: <span className="font-medium">{selectedFile.name}</span></p>
                  {parsedData.length > 0 && (
                    <p className="text-green-600 mt-1">{parsedData.length} rows found</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Import Result */}
        {importResult && (
          <Card className={importResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
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
          disabled={selectedType !== 'inventory' || parsedData.length === 0 || importing}
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
              Import {parsedData.length > 0 ? `${parsedData.length} Items` : 'Data'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}