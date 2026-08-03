import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Shield, Database, Search, Download, Loader2, Table as TableIcon, Columns, Upload } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RecordDetailsModal from "@/components/admin/RecordDetailsModal";

const SUPABASE_TABLES = [
  "Appointment", "ChartOfAccount", "Customer", "CustomerARAdjustment", "CustomerPayments", "InventoryItem", "SalesClass", "Supplier",
  "SupplierInvoiceLine", "SupplierPayment", "Vehicle", "WorkOrder"
].sort();

const LOCAL_ENTITIES = [
  "BankAccount", "BankReconciliation", "BankTransaction", "CashDrawerAdjustment",
  "CashFlowEntry", "CashFlowSummary", "ChartOfAccount", "CustomerPortalWorkOrder",
  "DepositSlipBreakdown", "Employee", "FiscalPeriod", "GLTransaction", "GSTReturn",
  "InventoryCategory", "InventoryLocation", "InventoryReturn", "InventoryTxs", "Levies",
  "LinesOfCredit", "LinesOfCreditTransaction", "OtherChargeList", "PayrollTransaction",
  "ReturnReason", "SentEmailLog", "Statement", "SystemSettings", "TagAlong", "User",
  "WorkOrderStatus"
].sort();

export default function AdminPage() {
  const { employee } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Tool State
  const [selectedEntity, setSelectedEntity] = useState("");
  const [targetType, setTargetType] = useState(""); // 'local' or 'supabase'
  const [selectedLocalEntity, setSelectedLocalEntity] = useState("");
  const [selectedSupabaseTable, setSelectedSupabaseTable] = useState("");
  const [entityFields, setEntityFields] = useState([]);

  const handleSelectLocal = (val) => {
    setSelectedLocalEntity(val);
    setSelectedSupabaseTable("");
    setSelectedEntity(val);
    setTargetType('local');
  };

  const handleSelectSupabase = (val) => {
    setSelectedSupabaseTable(val);
    setSelectedLocalEntity("");
    setSelectedEntity(val);
    setTargetType('supabase');
  };
  const [fieldMeta, setFieldMeta] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  
  // Extract State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [extractAllDates, setExtractAllDates] = useState(false);
  
  // Search State
  const [searchField, setSearchField] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Results State
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  
  // Modal State
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  // Column State
  const [visibleColumns, setVisibleColumns] = useState([]);

  // Set default columns when results change
  useEffect(() => {
    if (results.length > 0) {
      // Default to first 8 columns of the first record
      setVisibleColumns(Object.keys(results[0]).slice(0, 8));
    } else {
      setVisibleColumns([]);
    }
  }, [results]);

  const toggleColumn = (column) => {
    if (visibleColumns.includes(column)) {
      setVisibleColumns(prev => prev.filter(c => c !== column));
    } else {
      if (visibleColumns.length < 8) {
        setVisibleColumns(prev => [...prev, column]);
      }
    }
  };

  useEffect(() => {
    if (employee?.admin === true) {
      setIsAdmin(true);
    }
    setLoading(false);
  }, [employee]);

  // Fetch schema when entity changes
  useEffect(() => {
    if (!selectedEntity) {
      setEntityFields([]);
      setFieldMeta([]);
      return;
    }

    const fetchSchema = async () => {
      setLoadingFields(true);
      try {
        if (targetType === 'supabase') {
          const response = await base44.functions.invoke('SupabaseProxy', {
             action: 'read',
             table: selectedEntity
          });
          const data = response.data?.data || [];
          if (data.length > 0) {
             const keys = Object.keys(data[0]);
             setEntityFields(keys);
             setFieldMeta(keys.map(k => ({ name: k, type: 'string' })));
          } else {
             setEntityFields([]);
             setFieldMeta([]);
          }
        } else {
          const response = await base44.functions.invoke('adminDbTool', {
            mode: 'get_schema',
            entityName: selectedEntity
          });
          if (response.data?.fields) {
            setEntityFields(response.data.fields);
            setFieldMeta(response.data.fieldMeta || []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch schema", error);
      } finally {
        setLoadingFields(false);
      }
    };
    fetchSchema();
  }, [selectedEntity]);

  const handleExtract = async () => {
    if (!selectedEntity) return;
    setProcessing(true);
    setResults([]);
    try {
        let isoStart = startDate ? new Date(startDate + "T00:00:00").toISOString() : null;
        let isoEnd = endDate ? new Date(endDate + "T23:59:59").toISOString() : null;

        if (targetType === 'supabase') {
            const response = await base44.functions.invoke('SupabaseProxy', {
                action: 'read',
                table: selectedEntity
            });
            let data = response.data?.data || [];
            if (isoStart || isoEnd) {
                data = data.filter(row => {
                    const rowDate = new Date(row.created_date || row.created_at || row.updated_date || row.updated_at || row.invoice_date);
                    if (isNaN(rowDate)) return true;
                    if (isoStart && rowDate < new Date(isoStart)) return false;
                    if (isoEnd && rowDate > new Date(isoEnd)) return false;
                    return true;
                });
            }
            setResults(data);
        } else {
            const response = await base44.functions.invoke('adminDbTool', {
                mode: 'extract',
                entityName: selectedEntity,
                startDate: isoStart,
                endDate: isoEnd
            });
            
            if (response.data?.results) {
                setResults(response.data.results);
            }
        }
    } catch (error) {
        console.error("Extract failed", error);
        alert("Extraction failed: " + error.message);
    } finally {
        setProcessing(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedEntity || !searchField || !searchTerm) return;
    setProcessing(true);
    setResults([]);
    try {
        if (targetType === 'supabase') {
            const response = await base44.functions.invoke('SupabaseProxy', {
                action: 'read',
                table: selectedEntity
            });
            let data = response.data?.data || [];
            data = data.filter(row => {
                const val = String(row[searchField] || '').toLowerCase();
                return val.includes(searchTerm.toLowerCase());
            });
            setResults(data);
        } else {
            const response = await base44.functions.invoke('adminDbTool', {
                mode: 'search',
                entityName: selectedEntity,
                field: searchField,
                searchTerm: searchTerm
            });
            
            if (response.data?.results) {
                setResults(response.data.results);
            }
        }
    } catch (error) {
        console.error("Search failed", error);
        alert("Search failed: " + error.message);
    } finally {
        setProcessing(false);
    }
  };

  const handleUpdateRecord = async (updatedRecord) => {
    if (!selectedEntity || !updatedRecord.id) return;
    try {
      if (targetType === 'supabase') {
         await base44.functions.invoke('SupabaseProxy', {
             action: 'update',
             table: selectedEntity,
             id: updatedRecord.id,
             data: updatedRecord
         });
      } else {
        if (base44.entities[selectedEntity]) {
          await base44.entities[selectedEntity].update(updatedRecord.id, updatedRecord);
        } else {
           await base44.functions.invoke('adminDbTool', {
              mode: 'update',
              entityName: selectedEntity,
              id: updatedRecord.id,
              data: updatedRecord
          });
        }
      }
      
      // Update local state
      setResults(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      setSelectedRecord(updatedRecord);
      alert('Record updated successfully');
    } catch (error) {
      console.error("Update failed", error);
      throw error;
    }
  };

  const downloadData = (format) => {
    if (!results.length) return;

    let content = "";
    if (format === 'csv') {
        const headers = entityFields.length ? entityFields : Object.keys(results[0]);
        content += headers.join(",") + "\n";
        results.forEach(row => {
            const line = headers.map(header => {
                let cell = row[header] === null || row[header] === undefined ? "" : String(row[header]);
                cell = cell.replace(/"/g, '""');
                return `"${cell}"`;
            }).join(",");
            content += line + "\n";
        });
    } else {
        // TXT format - JSON pretty print for readability
        content = JSON.stringify(results, null, 2);
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedEntity}_${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h1 className="text-2xl font-bold text-slate-700">Access Denied</h1>
          <p className="text-slate-500 mt-2">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Admin Database Tools</h1>
            <p className="text-slate-500">Extract and inspect database records for troubleshooting.</p>
          </div>
        </div>
        <Button 
          onClick={() => window.location.href = createPageUrl('LankarImport')}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Upload className="w-4 h-4 mr-2" />
          Lankar Import
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    Database Query Tool
                </CardTitle>
                <CardDescription>Select an entity to begin.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 max-w-2xl">
                    <div>
                        <Label>Local Entity</Label>
                        <Select value={selectedLocalEntity} onValueChange={handleSelectLocal}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Local Entity..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {LOCAL_ENTITIES.map(entity => (
                                    <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Supabase Table</Label>
                        <Select value={selectedSupabaseTable} onValueChange={handleSelectSupabase}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Supabase Table..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                {SUPABASE_TABLES.map(table => (
                                    <SelectItem key={table} value={table}>{table}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {selectedEntity && (
                    <Tabs defaultValue="extract" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="extract" className="gap-2"><Download className="w-4 h-4"/> Extract Full Database</TabsTrigger>
                            <TabsTrigger value="search" className="gap-2"><Search className="w-4 h-4"/> Find Transaction</TabsTrigger>
                        </TabsList>

                        <TabsContent value="extract" className="space-y-4 border rounded-lg p-6 bg-slate-50">
                            <div className="flex items-center space-x-2 mb-2">
                                <Checkbox 
                                    id="allDates" 
                                    checked={extractAllDates}
                                    onCheckedChange={(checked) => {
                                        setExtractAllDates(checked);
                                        if(checked) {
                                            setStartDate("");
                                            setEndDate("");
                                        }
                                    }}
                                />
                                <Label htmlFor="allDates" className="cursor-pointer">For all date periods</Label>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label className={extractAllDates ? "text-slate-400" : ""}>Start Date (Created)</Label>
                                    <Input 
                                        type="date" 
                                        value={startDate} 
                                        onChange={e => {
                                            setStartDate(e.target.value);
                                            setExtractAllDates(false);
                                        }} 
                                        disabled={extractAllDates}
                                    />
                                </div>
                                <div>
                                    <Label className={extractAllDates ? "text-slate-400" : ""}>End Date (Created)</Label>
                                    <Input 
                                        type="date" 
                                        value={endDate} 
                                        onChange={e => {
                                            setEndDate(e.target.value);
                                            setExtractAllDates(false);
                                        }} 
                                        disabled={extractAllDates}
                                    />
                                </div>
                            </div>
                            <Button 
                                onClick={handleExtract} 
                                disabled={processing} 
                                className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
                            >
                                {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
                                Run Extract
                            </Button>
                        </TabsContent>

                        <TabsContent value="search" className="space-y-4 border rounded-lg p-6 bg-slate-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Search Field</Label>
                                    <Select value={searchField} onValueChange={setSearchField} disabled={loadingFields}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={loadingFields ? "Loading fields..." : "Select Field"} />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                            {fieldMeta.map(field => (
                                                <SelectItem key={field.name} value={field.name}>{`${field.name} (${field.type}${field.format ? `:${field.format}` : ''})`}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Search Term (Exact or Partial)</Label>
                                    <Input 
                                        value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)} 
                                        placeholder="Enter value..."
                                    />
                                </div>
                            </div>
                            <Button 
                                onClick={handleSearch} 
                                disabled={processing || !searchField || !searchTerm} 
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Search className="w-4 h-4 mr-2"/>}
                                Search Records
                            </Button>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>

        {results.length > 0 && (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TableIcon className="w-5 h-5 text-blue-600" />
                        Query Results ({results.length})
                    </CardTitle>
                    <div className="flex gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Columns className="w-4 h-4" /> Columns
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 max-h-[300px] overflow-y-auto">
                                <DropdownMenuLabel>Visible Columns (Max 8)</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {(fieldMeta.length > 0 ? fieldMeta.map(field => field.name) : (entityFields.length > 0 ? entityFields : (results.length > 0 ? Object.keys(results[0]) : []))).map(field => (
                                    <DropdownMenuCheckboxItem 
                                        key={field}
                                        checked={visibleColumns.includes(field)}
                                        onCheckedChange={() => toggleColumn(field)}
                                        disabled={!visibleColumns.includes(field) && visibleColumns.length >= 8}
                                    >
                                        {field}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" size="sm" onClick={() => downloadData('csv')}>Download .csv</Button>
                        <Button variant="outline" size="sm" onClick={() => downloadData('txt')}>Download .txt</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border max-h-[500px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {visibleColumns.map(key => (
                                        <TableHead key={key} className="whitespace-nowrap">{key}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.map((row, i) => (
                                    <TableRow 
                                        key={i} 
                                        onClick={() => setSelectedRecord(row)}
                                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                                    >
                                        {visibleColumns.map(key => (
                                            <TableCell key={key} className="max-w-[200px] truncate" title={String(row[key] ?? '')}>
                                                {String(row[key] ?? '')}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {results.length > 0 && (
                        <p className="text-xs text-slate-500 mt-2 italic text-center">
                            (Showing {visibleColumns.length} columns. Download to see full data.)
                        </p>
                    )}
                </CardContent>
            </Card>
        )}
      </div>
      
      <RecordDetailsModal 
        open={!!selectedRecord} 
        onClose={() => setSelectedRecord(null)} 
        record={selectedRecord} 
        entityName={selectedEntity}
        onUpdate={handleUpdateRecord}
      />
    </div>
  );
}