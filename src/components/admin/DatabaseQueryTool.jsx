import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, Calendar, Filter, X, Copy, Check, Link2, 
  User, Car, Package, FileText, Briefcase, ChevronRight, ChevronLeft
} from 'lucide-react';
import JsonTreeViewer from './JsonTreeViewer';
import { Button } from "@/components/ui/button";

const SEARCHABLE_TABLES = ['Customer', 'Vehicle', 'InventoryItem', 'WorkOrder', 'Supplier'];

const TABLE_ICONS = {
  Customer: User,
  Vehicle: Car,
  InventoryItem: Package,
  WorkOrder: FileText,
  Supplier: Briefcase
};

export default function DatabaseQueryTool() {
  const [query, setQuery] = useState('');
  const [selectedTables, setSelectedTables] = useState(SEARCHABLE_TABLES);
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  
  // Date states
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [removeDate, setRemoveDate] = useState(true);
  
  // Two-month calendar state
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  // Locks / Scopes
  const [customerLock, setCustomerLock] = useState(null);
  const [vehicleLock, setVehicleLock] = useState(null);

  // Search Results
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected row for detail inspector
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState('grid');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [copiedField, setCopiedField] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Trigger search on change/lock update
  useEffect(() => {
    handleSearch();
  }, [selectedTables, removeDate, dateFrom, dateTo, customerLock, vehicleLock]);

  const handleSearch = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('autopro_search_entities', {
        query_text: query,
        tables_filter: selectedTables,
        date_from: removeDate || !dateFrom ? null : new Date(dateFrom).toISOString(),
        date_to: removeDate || !dateTo ? null : new Date(dateTo).toISOString(),
        customer_id_lock: customerLock?.id || null,
        vehicle_id_lock: vehicleLock?.id || null
      });

      if (error) throw error;
      setResults(data || []);
      
      // Auto-select first result if current selected record is no longer in results
      if (data && data.length > 0) {
        const stillExists = data.some(r => r.row_id === selectedRecord?.row_id);
        if (!stillExists) {
          setSelectedRecord(data[0]);
        }
      } else {
        setSelectedRecord(null);
      }
    } catch (err) {
      console.error("Search error:", err);
      setErrorMsg("Failed to execute search. Make sure the database functions are up to date.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text, fieldName) => {
    navigator.clipboard.writeText(String(text));
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleCopyJson = (obj) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  const handleToggleTable = (table) => {
    if (selectedTables.includes(table)) {
      if (selectedTables.length > 1) {
        setSelectedTables(selectedTables.filter(t => t !== table));
      }
    } else {
      setSelectedTables([...selectedTables, table]);
    }
  };

  // Preset Date handlers
  const applyPreset = (preset) => {
    const now = new Date();
    let fromDate = new Date();
    setRemoveDate(false);

    if (preset === 'today') {
      fromDate.setHours(0,0,0,0);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (preset === '30days') {
      fromDate.setDate(now.getDate() - 30);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (preset === '60days') {
      fromDate.setDate(now.getDate() - 60);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (preset === '90days') {
      fromDate.setDate(now.getDate() - 90);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (preset === 'thisyear') {
      fromDate = new Date(now.getFullYear(), 0, 1);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (preset === 'lastyear') {
      fromDate = new Date(now.getFullYear() - 1, 0, 1);
      const toDate = new Date(now.getFullYear() - 1, 11, 31);
      setDateFrom(fromDate.toISOString().split('T')[0]);
      setDateTo(toDate.toISOString().split('T')[0]);
    }
  };

  // Dynamic grouping of results
  const groupedResults = results.reduce((acc, curr) => {
    if (!acc[curr.table_name]) acc[curr.table_name] = [];
    acc[curr.table_name].push(curr);
    return acc;
  }, {});

  // Two-Month Calendar Rendering logic
  const renderCalendarMonth = (monthOffset) => {
    const date = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + monthOffset, 1);
    const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const startDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    const dayElements = [];
    // Blank days
    for (let i = 0; i < startDay; i++) {
      dayElements.push(<div key={`blank-${i}`} className="h-8 w-8"></div>);
    }
    // Month days
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDayStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isSelected = dateFrom === currentDayStr || dateTo === currentDayStr;
      const isInRange = dateFrom && dateTo && currentDayStr > dateFrom && currentDayStr < dateTo;

      dayElements.push(
        <button
          key={day}
          type="button"
          onClick={() => {
            setRemoveDate(false);
            if (!dateFrom || (dateFrom && dateTo)) {
              setDateFrom(currentDayStr);
              setDateTo('');
            } else if (currentDayStr < dateFrom) {
              setDateFrom(currentDayStr);
            } else {
              setDateTo(currentDayStr);
            }
          }}
          className={`h-8 w-8 text-xs rounded-full flex items-center justify-center transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40 ${
            isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' :
            isInRange ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' :
            'text-slate-700 dark:text-slate-300'
          }`}
        >
          {day}
        </button>
      );
    }

    return (
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 text-center">{monthName}</h4>
        <div className="grid grid-cols-7 gap-1 text-center font-medium text-xs text-slate-400 mb-1">
          <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dayElements}
        </div>
      </div>
    );
  };

  // Relation link action
  const jumpToRelation = async (tableName, rowId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', rowId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        // Construct standard showcase fields
        let displayTitle = '';
        let showcaseData = {};
        if (tableName === 'Customer') {
          displayTitle = data.org_name || `${data.first_name} ${data.last_name}`;
          showcaseData = { 'ID/CusID': data.cusid || data.id, 'Name': displayTitle, 'Phone': data.phone };
        } else if (tableName === 'Vehicle') {
          displayTitle = `${data.year} ${data.make} ${data.model}`;
          showcaseData = { 'Plate': data.license_plate, 'VIN': data.vin, 'Make/Model': `${data.make} ${data.model}` };
        } else if (tableName === 'WorkOrder') {
          displayTitle = `WO #${data.wo_number || data.ro_number}`;
          showcaseData = { 'RO/WO #': data.ro_number, 'Stage': data.stage, 'Status': data.status };
        }

        setSelectedRecord({
          table_name: tableName,
          row_id: rowId,
          display_title: displayTitle,
          showcase_data: showcaseData,
          full_row: data
        });
      } else {
        alert("Related record not found.");
      }
    } catch (err) {
      console.error("Relation jump error:", err);
      alert("Failed to load relation details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-slate-900 dark:text-slate-100">
      {/* OmniSearch Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Main search bar */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Fuzzy search fields (e.g. name, vin, part, note...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
            />
          </div>

          {/* Table Filters dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTableDropdown(!showTableDropdown)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Tables ({selectedTables.length})</span>
            </button>

            {showTableDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-2 z-50">
                <div className="px-3 py-1 text-xs font-semibold text-slate-400">Include Tables:</div>
                {SEARCHABLE_TABLES.map(table => (
                  <label 
                    key={table} 
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTables.includes(table)}
                      onChange={() => handleToggleTable(table)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>{table}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date Filter Button */}
          <button
            onClick={() => setShowDateModal(true)}
            className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              removeDate 
                ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800' 
                : 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Date: {removeDate ? 'All Time' : `${dateFrom || '?'} to ${dateTo || '?'}`}</span>
          </button>

          <Button 
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {/* Filters and Scope Status Row */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Table display tags */}
          <div className="flex flex-wrap gap-1.5 items-center text-xs">
            <span className="text-slate-400">Showing:</span>
            {selectedTables.map(t => (
              <span key={t} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-medium">
                {t}
              </span>
            ))}
          </div>

          {/* Scope locks */}
          {(customerLock || vehicleLock) && (
            <div className="flex items-center gap-2 ml-auto border-l border-slate-200 dark:border-slate-800 pl-3">
              <span className="text-xs text-yellow-600 dark:text-yellow-500 font-semibold flex items-center gap-1">
                🔒 Scopes Active:
              </span>
              {customerLock && (
                <span className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs px-2 py-1 rounded">
                  Customer: {customerLock.name}
                  <button onClick={() => setCustomerLock(null)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {vehicleLock && (
                <span className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs px-2 py-1 rounded">
                  Vehicle: {vehicleLock.name}
                  <button onClick={() => setVehicleLock(null)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Main Split-Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-h-[60vh]">
        
        {/* LEFT PANEL: Grouped Search Results */}
        <div className="lg:col-span-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
          {results.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-400">
              No records match your search criteria.
            </div>
          ) : (
            Object.keys(groupedResults).map(tableName => {
              const TableIcon = TABLE_ICONS[tableName] || FileText;
              return (
                <div key={tableName} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  {/* Table Header */}
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                    <TableIcon className="w-4 h-4 text-blue-600 dark:text-blue-500" />
                    <span className="font-bold text-sm tracking-wide uppercase text-slate-700 dark:text-slate-300">
                      {tableName}s ({groupedResults[tableName].length})
                    </span>
                  </div>

                  {/* List of matching rows */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupedResults[tableName].map(record => {
                      const isSelected = selectedRecord?.row_id === record.row_id;
                      const columns = Object.keys(record.showcase_data);
                      
                      return (
                        <div
                          key={record.row_id}
                          onClick={() => setSelectedRecord(record)}
                          className={`p-3 text-xs cursor-pointer transition-colors text-left ${
                            isSelected 
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-600' 
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
                            {record.display_title}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 text-slate-500 dark:text-slate-400">
                            {columns.map(col => (
                              <div key={col} className="truncate">
                                <span className="font-medium text-slate-400 dark:text-slate-500 mr-1">{col}:</span>
                                {String(record.showcase_data[col] || '')}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT PANEL: Record Inspector Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-24 max-h-[75vh] flex flex-col">
          {selectedRecord ? (
            <>
              {/* Detail Header */}
              <div className="bg-slate-50 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {React.createElement(TABLE_ICONS[selectedRecord.table_name] || FileText, {
                    className: "w-5 h-5 text-blue-600 dark:text-blue-500"
                  })}
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-slate-100">{selectedRecord.display_title}</h2>
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold px-1.5 py-0.5 rounded">
                      {selectedRecord.table_name} Row
                    </span>
                  </div>
                </div>
                
                {/* Tabs */}
                <div className="flex gap-1 bg-slate-200 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setActiveInspectorTab('grid')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      activeInspectorTab === 'grid' 
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Grid View
                  </button>
                  <button
                    onClick={() => setActiveInspectorTab('json')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      activeInspectorTab === 'json' 
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    JSON View
                  </button>
                </div>
              </div>

              {/* Detail Contents */}
              <div className="flex-1 p-4 overflow-y-auto max-h-[60vh] space-y-4">
                {activeInspectorTab === 'grid' ? (
                  <>
                    {/* Relation Explorer Area */}
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 border border-slate-150 dark:border-slate-800 space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        Relation Explorer & Scope Locking
                      </h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {/* CUSTOMER RELATIONS */}
                        {selectedRecord.table_name === 'Customer' && (
                          <>
                            <Button 
                              variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => {
                                setCustomerLock({ id: selectedRecord.row_id, name: selectedRecord.display_title });
                              }}
                            >
                              🔒 Lock Scope to Customer
                            </Button>
                          </>
                        )}

                        {/* VEHICLE RELATIONS */}
                        {selectedRecord.table_name === 'Vehicle' && (
                          <>
                            {selectedRecord.full_row.customer_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => jumpToRelation('Customer', selectedRecord.full_row.customer_id)}
                              >
                                👤 View Owner Customer
                              </Button>
                            )}
                            <Button 
                              variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => {
                                setVehicleLock({ id: selectedRecord.row_id, name: selectedRecord.display_title });
                              }}
                            >
                              🔒 Lock Scope to Vehicle
                            </Button>
                            {selectedRecord.full_row.customer_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => {
                                  // Lock parent customer
                                  setCustomerLock({ id: selectedRecord.full_row.customer_id, name: "Vehicle Owner" });
                                }}
                              >
                                🔒 Lock Scope to Owner Customer
                              </Button>
                            )}
                          </>
                        )}

                        {/* WORK ORDER RELATIONS */}
                        {selectedRecord.table_name === 'WorkOrder' && (
                          <>
                            {selectedRecord.full_row.customer_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => jumpToRelation('Customer', selectedRecord.full_row.customer_id)}
                              >
                                👤 View Customer
                              </Button>
                            )}
                            {selectedRecord.full_row.vehicle_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => jumpToRelation('Vehicle', selectedRecord.full_row.vehicle_id)}
                              >
                                🚗 View Vehicle
                              </Button>
                            )}
                            {selectedRecord.full_row.customer_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => {
                                  setCustomerLock({ id: selectedRecord.full_row.customer_id, name: "WO Customer" });
                                }}
                              >
                                🔒 Lock Scope to Customer
                              </Button>
                            )}
                            {selectedRecord.full_row.vehicle_id && (
                              <Button 
                                variant="outline" size="sm" className="h-7 text-xs"
                                onClick={() => {
                                  setVehicleLock({ id: selectedRecord.full_row.vehicle_id, name: "WO Vehicle" });
                                }}
                              >
                                🔒 Lock Scope to Vehicle
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Filter fields input */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter keys or values..."
                        value={propertyFilter}
                        onChange={(e) => setPropertyFilter(e.target.value)}
                        className="w-full pl-8 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Property Table */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                            <th className="px-3 py-2 text-left w-1/3">Column</th>
                            <th className="px-3 py-2 text-left">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                          {Object.keys(selectedRecord.full_row)
                            .filter(key => {
                              const val = selectedRecord.full_row[key];
                              const searchStr = `${key} ${typeof val === 'object' ? '' : String(val)}`.toLowerCase();
                              return searchStr.includes(propertyFilter.toLowerCase());
                            })
                            .map(key => {
                              const val = selectedRecord.full_row[key];
                              const isComplex = val !== null && typeof val === 'object';
                              
                              return (
                                <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 align-top">
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate max-w-[150px]">
                                    {!isComplex && (
                                      <button 
                                        onClick={() => handleCopyText(val, key)}
                                        className="hover:bg-slate-200 dark:hover:bg-slate-800 p-0.5 rounded text-slate-400 hover:text-slate-700"
                                        title="Copy value"
                                      >
                                        {copiedField === key ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                      </button>
                                    )}
                                    <span>{key}</span>
                                  </td>
                                  <td className="px-3 py-2">
                                    {isComplex ? (
                                      <JsonTreeViewer data={val} name={key} />
                                    ) : (
                                      <span className="font-mono text-slate-800 dark:text-slate-200 break-all select-text">
                                        {val === null ? <span className="text-red-400">null</span> : String(val)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  // JSON VIEW
                  <div className="relative">
                    <button
                      onClick={() => handleCopyJson(selectedRecord.full_row)}
                      className="absolute right-3 top-3 flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded font-medium shadow-sm transition-colors border border-slate-700"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="w-3 h-3 text-green-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                    <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed select-text border border-slate-800 shadow-inner">
                      {JSON.stringify(selectedRecord.full_row, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 min-h-[300px]">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2 animate-pulse" />
              <p>Select a search result row to inspect column keys, values, and relations.</p>
            </div>
          )}
        </div>

      </div>

      {/* DATE RANGE SELECTOR MODAL */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-500" />
                Select Search Date Range
              </h3>
              <button 
                onClick={() => setShowDateModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Inputs & Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Presets and text input column */}
              <div className="md:col-span-1 flex flex-col gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Inputs</label>
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-slate-400">From Date (YYYY-MM-DD)</span>
                      <input 
                        type="text" 
                        value={dateFrom} 
                        onChange={(e) => {
                          setRemoveDate(false);
                          setDateFrom(e.target.value);
                        }}
                        placeholder="e.g. 2026-01-01"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">To Date (YYYY-MM-DD)</span>
                      <input 
                        type="text" 
                        value={dateTo} 
                        onChange={(e) => {
                          setRemoveDate(false);
                          setDateTo(e.target.value);
                        }}
                        placeholder="e.g. 2026-12-31"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Remove Date Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer py-1.5 border-t border-slate-100 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={removeDate}
                    onChange={(e) => {
                      setRemoveDate(e.target.checked);
                      if (e.target.checked) {
                        setDateFrom('');
                        setDateTo('');
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Remove Date (All Records)</span>
                </label>

                {/* Quick Presets Grid */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['today', '30days', '60days', '90days', 'thisyear', 'lastyear'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="px-2 py-1.5 text-[10px] font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-300 rounded uppercase transition-colors"
                      >
                        {preset.replace('days', ' Days').replace('year', ' Year')}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Two Month Calendar view column */}
              <div className="md:col-span-2 border-l border-slate-100 dark:border-slate-800 pl-4 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Interactive Calendar</span>
                  <div className="flex gap-1">
                    <button 
                      type="button" 
                      onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1))}
                      className="p-1 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-950"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1))}
                      className="p-1 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-950"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-6">
                  {renderCalendarMonth(-1)}
                  {renderCalendarMonth(0)}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setRemoveDate(true);
                }}
                className="text-xs border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                Clear Filters
              </Button>
              <Button 
                onClick={() => setShowDateModal(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                Apply Dates
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
