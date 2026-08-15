import React, { useState, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  MoreHorizontal,
  PlusCircle,
  Package,
  Search,
  Filter,
  ArrowUpDown,
  Edit,
  Trash2,
  PackagePlus,
  RefreshCw,
  History,
  Printer,
  FileText,
  Settings
} from "lucide-react";

import InventoryAddModal from "@/components/inventory/InventoryAddModal";
import InventoryEditModal from "@/components/inventory/InventoryEditModal";
import InventoryAdjustQOHModal from "@/components/inventory/InventoryAdjustQOHModal";
import InventoryPartsReturnModal from "@/components/inventory/InventoryPartsReturnModal";
import InventoryHistoryModal from "@/components/inventory/InventoryHistoryModal";
import LocationModal from "@/components/inventory/LocationModal";
import InventoryTransactionsModal from "@/components/inventory/InventoryTransactionsModal";
import LocationFilterDialog from "@/components/inventory/LocationFilterDialog";

const ALLOWED_INVENTORY_SORT_FIELDS = new Set([
  'part_number',
  'description',
  'manufacturer',
  'category',
  'location',
  'cost',
  'selling_price',
  'quantity_on_hand',
  'quantity_on_order',
  'minimum_quantity',
  'maximum_quantity',
  'created_date',
  'updated_date'
]);

function applyInventoryFilter(query, filter) {
  if (filter === 'stocked') return query.eq('stocked_item', true);
  if (filter === 'non-stocked') return query.eq('stocked_item', false);
  if (filter === 'non-zero') return query.gt('quantity_on_hand', 0);
  if (filter === 'inventory-count') return query.not('location', 'is', null).neq('location', '');
  if (filter === 'no-location') return query.or('location.is.null,location.eq.').gt('quantity_on_hand', 0);
  return query;
}

async function fetchInventoryRecords({
  searchTerm,
  filter,
  sortBy,
  sortDirection,
  includeInactive,
  limit,
  offset,
  locationFrom,
  locationTo,
}) {
  const normalizedSearchTerm = (searchTerm || '').trim();
  const safeSortBy = ALLOWED_INVENTORY_SORT_FIELDS.has(sortBy) ? sortBy : 'part_number';
  const ascending = sortDirection !== 'desc';
  const safeLimit = Math.max(1, limit);
  const safeOffset = Math.max(0, offset);

  if (normalizedSearchTerm || locationFrom || locationTo) {
    if (!includeInactive) {
      const { data, error } = await supabase.rpc('search_inventory_ranked', {
        p_search_term: normalizedSearchTerm,
        p_filter: filter,
        p_sort_by: safeSortBy,
        p_sort_direction: ascending ? 'asc' : 'desc',
        p_limit: safeLimit,
        p_offset: safeOffset,
        p_location_from: locationFrom || null,
        p_location_to: locationTo || null,
      });
      if (error) throw error;
      const records = data || [];
      const totalCount = records.length > 0 ? Number(records[0].total_count || 0) : 0;
      const cleanedRecords = records.map(({ total_count, match_rank, ...item }) => item);
      return { records: cleanedRecords, totalCount };
    }

    let query = supabase
      .from('InventoryItem')
      .select('*', { count: 'exact' })
      .or(`part_number.ilike.%${normalizedSearchTerm}%,description.ilike.%${normalizedSearchTerm}%,manufacturer.ilike.%${normalizedSearchTerm}%`);
    query = applyInventoryFilter(query, filter);
    if (locationFrom) query = query.gte('location', locationFrom);
    if (locationTo) query = query.lte('location', locationTo);
    query = query.order(safeSortBy, { ascending, nullsFirst: false });
    query = query.range(safeOffset, safeOffset + safeLimit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { records: data || [], totalCount: count || 0 };
  }

  let query = supabase.from('InventoryItem').select('*', { count: 'exact' });
  if (!includeInactive) query = query.eq('is_active', true);
  query = applyInventoryFilter(query, filter);
  if (locationFrom) query = query.gte('location', locationFrom);
  if (locationTo) query = query.lte('location', locationTo);
  query = query.order(safeSortBy, { ascending, nullsFirst: false });
  query = query.range(safeOffset, safeOffset + safeLimit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { records: data || [], totalCount: count || 0 };
}

export default function InventoryListPage() {
  const { employee } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [showInactiveInventory, setShowInactiveInventory] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "part_number", direction: "ascending" });
  const [filter, setFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage] = useState(50);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAdjustQOHModalOpen, setIsAdjustQOHModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [showLocationFilterDialog, setShowLocationFilterDialog] = useState(false);
  const [filterLocationFrom, setFilterLocationFrom] = useState("");
  const [filterLocationTo, setFilterLocationTo] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedItem, setSelectedItem] = useState(null);

  const availableColumns = [
    { id: 'part_number', label: 'Part Number', default: true },
    { id: 'description', label: 'Description', default: true },
    { id: 'unit', label: 'Unit', default: true },
    { id: 'quantity_on_hand', label: 'QOH', default: true },
    { id: 'cost', label: 'Cost', default: true },
    { id: 'selling_price', label: 'Price', default: true },
    { id: 'location', label: 'Location', default: true },
    { id: 'category', label: 'Category', default: false },
    { id: 'supplier', label: 'Supplier', default: false },
    { id: 'manufacturer', label: 'Manufacturer', default: false },
    { id: 'sales_class', label: 'Sales Class', default: false },
    { id: 'quantity_on_order', label: 'On Order', default: false },
    { id: 'minimum_quantity', label: 'Min', default: false },
    { id: 'maximum_quantity', label: 'Max', default: false },
    { id: 'profit_margin', label: 'Margin %', default: false },
    { id: 'core', label: 'Core Item', default: false },
    { id: 'core_cost', label: 'Core Cost', default: false },
    { id: 'stocked_item', label: 'Stocked', default: false },
    { id: 'is_active', label: 'Active', default: false },
  ];

  const [visibleColumns, setVisibleColumns] = useState(() => 
    new Set(availableColumns.filter(c => c.default).map(c => c.id))
  );

  const toggleColumn = (columnId) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  };

  // Add state for shared data
  const [suppliers, setSuppliers] = useState([]);
  const [salesClasses, setSalesClasses] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const isInventoryCount = filter === 'inventory-count';
      const isUnlimitedView = filter === 'inventory-count' || filter === 'non-zero';
      
      let records;
      let totalCount;
      if (isInventoryCount && !activeSearchTerm) {
        const { data, error } = await supabase.rpc('get_populated_inventory');
        if (error) throw error;
        records = data || [];

        // Apply location filter in memory if present
        if (filterLocationFrom || filterLocationTo) {
          records = records.filter(r => {
            const loc = r.location || '';
            if (filterLocationFrom && loc < filterLocationFrom) return false;
            if (filterLocationTo && loc > filterLocationTo) return false;
            return true;
          });
        }
        // Sort the results in memory since the RPC doesn't sort
        const { key, direction } = sortConfig;
        const sortMultiplier = direction === 'ascending' ? 1 : -1;
        const sortKey = isInventoryCount && key === 'part_number' ? 'location' : key; // Default sort for inventory count is location

        records = [...records].sort((a, b) => {
          const valA = a[sortKey] || '';
          const valB = b[sortKey] || '';
          if (valA < valB) return -1 * sortMultiplier;
          if (valA > valB) return 1 * sortMultiplier;
          return 0;
        });
        totalCount = records.length;
      } else {
        const result = await fetchInventoryRecords({
          searchTerm: activeSearchTerm,
          filter: filter,
          includeInactive: showInactiveInventory,
          sortBy: isInventoryCount ? 'location' : sortConfig.key,
          sortDirection: sortConfig.direction === 'ascending' ? 'asc' : 'desc',
          limit: isUnlimitedView ? 999999 : itemsPerPage,
          offset: isUnlimitedView ? 0 : (currentPage - 1) * itemsPerPage,
          locationFrom: filterLocationFrom,
          locationTo: filterLocationTo
        });
        records = result.records;
        totalCount = result.totalCount;
      }

      setInventory(records || []);
      setTotalCount(totalCount || 0);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      setInventory([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeSearchTerm, filter, showInactiveInventory, sortConfig, currentPage, itemsPerPage, filterLocationFrom, filterLocationTo]);

  // Search triggered on Enter key
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setActiveSearchTerm(searchTerm);
      setCurrentPage(1);
    }
  };

  // Function to load data shared by modals
  const loadSharedData = async () => {
    try {
      const { data, error } = await supabase.from('Supplier').select('*');
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    }

    try {
      const { data, error } = await supabase.from('SalesClass').select('*');
      if (error) throw error;
      setSalesClasses(data || []);
    } catch (error) {
      console.error("Error fetching sales classes:", error);
    }

    try {
      const { data, error } = await supabase.from('InventoryLocation').select('*');
      if (error) throw error;
      setInventoryLocations(data || []);
    } catch (error) {
      console.error("Error fetching inventory locations:", error);
    }

    try {
      const { data, error } = await supabase.from('InventoryCategory').select('*');
      if (error) throw error;
      setInventoryCategories(data || []);
    } catch (error) {
      console.error("Error fetching inventory categories:", error);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    loadSharedData(); // Fetch shared data on initial load
  }, []);

  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset to first page on new sort
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page on new filter
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setIsEditModalOpen(true);
  };

  const handleAdjustQOH = (item) => {
    setSelectedItem(item);
    setIsAdjustQOHModalOpen(true);
  };

  const handleReturnPart = (item) => {
    setSelectedItem(item);
    setIsReturnModalOpen(true);
  };
  
  const handleShowHistory = (item) => {
    setSelectedItem(item);
    setIsHistoryModalOpen(true);
  };

  const handleViewTransactions = (item) => {
    setSelectedItem(item);
    setIsTransactionsModalOpen(true);
  };

  const handleLocationClick = (item) => {
    setSelectedItem(item);
    setIsLocationModalOpen(true);
  };

  const handleDelete = async (itemId) => {
    if (confirm("Are you sure you want to delete this inventory item? This cannot be undone.")) {
      try {
        const { error } = await supabase.from('InventoryItem').delete().eq('id', itemId);
        if (error) throw error;
        fetchInventory();
      } catch (error) {
        console.error("Error deleting item:", error);
        alert("Failed to delete item. It might be in use.");
      }
    }
  };

  const handleUpdate = (updatedItem) => {
    if (updatedItem && typeof updatedItem === 'object' && updatedItem.id) {
      setInventory(prev => prev.map(item => item.id === updatedItem.id ? { ...item, ...updatedItem } : item));
    } else {
      fetchInventory();
    }
    setIsEditModalOpen(false);
    setIsAdjustQOHModalOpen(false);
    setIsReturnModalOpen(false);
    setIsLocationModalOpen(false);
  };

  const handleAdd = async (itemData) => {
    try {
      const now = new Date().toISOString();
      const { data: newItem, error } = await supabase
        .from('InventoryItem')
        .insert({
          id: crypto.randomUUID(),
          ...itemData,
          created_date: now,
          updated_date: now,
          created_by: employee?.email || null,
          created_by_id: employee?.autopro_user_id || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (newItem?.id) {
        setInventory(prev => [newItem, ...prev]);
        setTotalCount(prev => prev + 1);
      } else {
        fetchInventory();
      }

      setIsAddModalOpen(false);
      return newItem;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      alert('Failed to create inventory item. Please try again.');
      throw error;
    }
  };

  const handlePrint = async () => {
    setLoading(true);
    try {
      let records = [];
      const isInventoryCount = filter === 'inventory-count';
      const isUnlimitedView = filter === 'inventory-count' || filter === 'non-zero';
      
      if (isInventoryCount && !activeSearchTerm) {
        const { data, error } = await supabase.rpc('get_populated_inventory');
        if (error) throw error;
        records = data || [];
        if (filterLocationFrom || filterLocationTo) {
            records = records.filter(r => {
                const loc = r.location || '';
                if (filterLocationFrom && loc < filterLocationFrom) return false;
                if (filterLocationTo && loc > filterLocationTo) return false;
                return true;
            });
        }
      } else {
        const result = await fetchInventoryRecords({
          searchTerm: activeSearchTerm,
          filter: filter,
          sortBy: 'location',
          sortDirection: 'asc',
          limit: 999999,
          offset: 0,
          locationFrom: filterLocationFrom,
          locationTo: filterLocationTo
        });
        records = result.records;
      }

      // Sort records by location ascending for the report
      records.sort((a, b) => {
        const locA = a.location || '';
        const locB = b.location || '';
        if (locA === locB) return 0;
        if (locA === '') return -1;
        if (locB === '') return 1;
        return locA.localeCompare(locB);
      });

      const doc = new jsPDF('p', 'pt', 'letter');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 30;
      
      const cols = availableColumns.filter(c => visibleColumns.has(c.id));
      let totalWeight = 0;
      cols.forEach(c => {
          if (c.id === 'description') c.weight = 3;
          else if (c.id === 'part_number') c.weight = 1.5;
          else c.weight = 1;
          totalWeight += c.weight;
      });
      const usableWidth = pageWidth - margin * 2;
      
      let currentY = margin + 30;

      const drawHeader = () => {
          doc.setFontSize(18);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(`Inventory List - ${new Date().toLocaleDateString()}`, pageWidth / 2, margin + 10, { align: 'center' });
          
          doc.setFontSize(9);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(1);
          doc.rect(margin, currentY, usableWidth, 25, 'FD');
          
          let currentX = margin;
          cols.forEach((col) => {
              const colWidth = (col.weight / totalWeight) * usableWidth;
              doc.setFont('helvetica', 'bold');
              doc.text(col.label, currentX + 5, currentY + 16);
              if (currentX > margin) {
                  doc.line(currentX, currentY, currentX, currentY + 25);
              }
              currentX += colWidth;
          });
          currentY += 25;
      };

      const drawFooter = (pageNum, totalPages) => {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      };

      drawHeader();
      
      doc.setFontSize(9);

      records.forEach((item) => {
          const rowHeight = 25;
          if (currentY > pageHeight - 50) {
              doc.addPage();
              currentY = margin + 30;
              drawHeader();
              doc.setFontSize(9);
          }
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(1);
          doc.rect(margin, currentY, usableWidth, rowHeight, 'S');
          
          let currentX = margin;
          cols.forEach((col) => {
              const colWidth = (col.weight / totalWeight) * usableWidth;
              let text = '';
              if (col.id === 'supplier') text = suppliers.find(s => s.id === item.supplier_id)?.name || '-';
              else if (col.id === 'sales_class') text = salesClasses.find(sc => sc.id === item.sales_class)?.name || '-';
              else if (col.id === 'cost' || col.id === 'selling_price' || col.id === 'core_cost') text = `$${(item[col.id] || 0).toFixed(2)}`;
              else if (col.id === 'profit_margin') text = `${(item[col.id] || 0).toFixed(2)}%`;
              else if (col.id === 'core' || col.id === 'stocked_item' || col.id === 'is_active') text = item[col.id] ? 'Yes' : 'No';
              else text = (item[col.id] || '').toString();
              
              // Set font styles based on column
              if (col.id === 'part_number' || col.id === 'quantity_on_hand' || col.id === 'selling_price') {
                  doc.setFont('helvetica', 'bold');
              } else {
                  doc.setFont('helvetica', 'normal');
              }

              // Truncate text
              const maxLen = colWidth - 10;
              let truncated = text;
              if (doc.getTextWidth(truncated) > maxLen) {
                  while (truncated.length > 0 && doc.getTextWidth(truncated + '...') > maxLen) {
                      truncated = truncated.slice(0, -1);
                  }
                  truncated += '...';
              }

              // Set text color based on QOH
              if (col.id === 'quantity_on_hand' && item.quantity_on_hand <= 0) {
                  doc.setTextColor(220, 38, 38); // Red
              } else {
                  doc.setTextColor(0, 0, 0); // Black
              }
              
              doc.text(truncated, currentX + 5, currentY + 16);
              
              if (currentX > margin) {
                  doc.setDrawColor(200, 200, 200);
                  doc.line(currentX, currentY, currentX, currentY + rowHeight);
              }
              
              currentX += colWidth;
          });
          
          currentY += rowHeight;
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          drawFooter(i, totalPages);
      }

      const pdfDataUri = doc.output('datauristring');
      const windowFeatures = 'width=1200,height=800,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      const newWindow = window.open('', '_blank', windowFeatures);
      
      if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>Inventory Report</title>
                <style>body { margin: 0; padding: 0; overflow: hidden; }</style>
              </head>
              <body>
                <iframe width='100%' height='100%' style='border:none; margin:0; padding:0;' src='${pdfDataUri}'></iframe>
              </body>
            </html>
          `);
          newWindow.document.close();
      } else {
          doc.save('Inventory_Report.pdf');
      }

    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    return sortConfig.direction === 'ascending' ? '▲' : '▼';
  };

  const renderContextMenu = (item) => (
    <ContextMenuContent className="dark:bg-slate-950 dark:border-slate-800">
      <ContextMenuItem onClick={() => handleShowHistory(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
        <History className="mr-2 h-4 w-4" />
        <span>History</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleViewTransactions(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
        <FileText className="mr-2 h-4 w-4" />
        <span>View Transactions</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleReturnPart(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
        <RefreshCw className="mr-2 h-4 w-4" />
        <span>Return Part</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleEdit(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
        <Edit className="mr-2 h-4 w-4" />
        <span>Edit</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleAdjustQOH(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
        <PackagePlus className="mr-2 h-4 w-4" />
        <span>Adjust QOH</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleLocationClick(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
          <Package className="mr-2 h-4 w-4" />
          <span>Edit Location</span>
      </ContextMenuItem>
      {currentUser?.admin === true && (
        <>
          <ContextMenuSeparator className="dark:bg-slate-800" />
          <ContextMenuItem
            onClick={() => handleDelete(item.id)}
            className="text-red-600 dark:text-red-400 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/30 dark:focus:text-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </ContextMenuItem>
        </>
      )}
      </ContextMenuContent>
      );
  
  return (
    <>
      <style>{`
        .print-footer-row { display: none; }
        @media print {
          @page {
            margin: 10mm;
          }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            padding: 20px;
            box-sizing: border-box;
          }
          .no-print { display: none !important; }
          .print-header { 
            display: block !important; 
            text-align: center; 
            margin-bottom: 20px; 
            font-size: 18px; 
            font-weight: bold; 
            color: #000;
          }
          .print-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 10px;
          }
          .print-table th, .print-table td { 
            border: 1px solid #ddd;
            padding: 8px; 
            text-align: left; 
            font-size: 12px; 
            color: #000;
          }
          .print-table th { 
            background-color: #f2f2f2;
            font-weight: bold; 
          }
          .print-table tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .print-table .font-medium, .print-table .font-bold, .print-table .font-semibold {
            font-weight: bold;
          }
          .print-table .text-red-600 {
            color: red !important;
          }
          .print-table {
            counter-reset: page;
          }
          .print-footer-row {
            display: table-footer-group !important;
          }
          .page-number::after {
            counter-increment: page;
            content: "Page " counter(page);
          }
        }
      `}</style>
      
      <div className="p-6 min-h-screen">
        <LocationFilterDialog
          open={showLocationFilterDialog}
          onClose={() => setShowLocationFilterDialog(false)}
          onApplyFilter={(from, to) => {
            setFilterLocationFrom(from);
            setFilterLocationTo(to);
          }}
          initialLocationFrom={filterLocationFrom}
          initialLocationTo={filterLocationTo}
        />
        <InventoryAddModal 
          open={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAdd={handleAdd} 
          suppliers={suppliers}
          salesClasses={salesClasses}
          inventoryLocations={inventoryLocations}
        />
        <InventoryEditModal 
          open={isEditModalOpen} 
          onClose={() => setIsEditModalOpen(false)} 
          item={selectedItem} 
          onUpdate={handleUpdate} 
          suppliers={suppliers}
          salesClasses={salesClasses}
          inventoryLocations={inventoryLocations}
          inventoryCategories={inventoryCategories}
        />
        <InventoryAdjustQOHModal 
          open={isAdjustQOHModalOpen} 
          onClose={() => setIsAdjustQOHModalOpen(false)} 
          item={selectedItem} 
          onUpdate={handleUpdate} 
        />
        <InventoryPartsReturnModal open={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} item={selectedItem} onUpdate={handleUpdate} source="inventory"/>
        <InventoryHistoryModal 
          open={isHistoryModalOpen} 
          onClose={() => setIsHistoryModalOpen(false)} 
          partNumber={selectedItem?.part_number}
          inventoryItemId={selectedItem?.id} 
        />
        <LocationModal
          open={isLocationModalOpen} 
          onClose={() => setIsLocationModalOpen(false)} 
          item={selectedItem} 
          onUpdate={handleUpdate} 
          inventoryLocations={inventoryLocations}
        />
        <InventoryTransactionsModal
          isOpen={isTransactionsModalOpen}
          onClose={() => setIsTransactionsModalOpen(false)}
          inventoryItemId={selectedItem?.id}
        />

        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-card border dark:border-slate-800 p-4 rounded-lg shadow-sm mb-6 no-print mt-2">
            {/* Top row: Search Bar and Action Buttons */}
            <div className="flex flex-col xl:flex-row justify-between gap-4 mb-4">
              {/* Left side: Search Bar */}
              <div className="relative w-full xl:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-slate-500" />
                <Input
                  placeholder="Search by Part # or Description (Press Enter)"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className="pl-10 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                  autoFocus
                />
              </div>

              {/* Right side: Action Buttons + Location Range + Customize */}
              <div className="flex flex-wrap items-center gap-2 justify-start xl:justify-end shrink-0">
                <Button onClick={handlePrint} variant="outline" className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  New Part
                </Button>
                <Button onClick={fetchInventory} variant="outline" className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button variant={(filterLocationFrom || filterLocationTo) ? 'default' : 'outline'} onClick={() => setShowLocationFilterDialog(true)} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                  Location Range {(filterLocationFrom || filterLocationTo) && `(${filterLocationFrom || '*'} - ${filterLocationTo || '*'})`}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" title="Customize columns" className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-96 overflow-y-auto dark:bg-slate-950 dark:border-slate-800">
                    <DropdownMenuLabel className="dark:text-slate-200">Toggle Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator className="dark:bg-slate-800" />
                    {availableColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={visibleColumns.has(column.id)}
                        onCheckedChange={() => toggleColumn(column.id)}
                        className="dark:text-slate-300 dark:focus:bg-slate-800"
                      >
                        {column.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Bottom row: Checkbox and Filters */}
            <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 shrink-0">
                <input
                  type="checkbox"
                  checked={showInactiveInventory}
                  onChange={(e) => {
                    setShowInactiveInventory(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-800 text-blue-600 focus:ring-blue-600 dark:bg-slate-950"
                />
                Show Inactive Inventory
              </label>

              <div className="flex items-center gap-2 flex-wrap md:pl-4 md:border-l border-slate-200 dark:border-slate-800">
                 <Filter className="h-5 w-5 text-gray-400 dark:text-slate-500 shrink-0" />
                 <Button variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => handleFilterChange('all')} className="whitespace-nowrap dark:text-slate-300 dark:hover:text-slate-100">All</Button>
                 <Button variant={filter === 'non-zero' ? 'secondary' : 'ghost'} onClick={() => handleFilterChange('non-zero')} className="whitespace-nowrap dark:text-slate-300 dark:hover:text-slate-100">Has Stock</Button>
                 <Button variant={filter === 'no-location' ? 'secondary' : 'ghost'} onClick={() => handleFilterChange('no-location')} className="whitespace-nowrap dark:text-slate-300 dark:hover:text-slate-100">No Location</Button>
                 <Button variant={filter === 'inventory-count' ? 'secondary' : 'ghost'} onClick={() => handleFilterChange('inventory-count')} className="whitespace-nowrap dark:text-slate-300 dark:hover:text-slate-100">Inventory Count</Button>
              </div>
            </div>
          </div>

          <div className="print-area">
            <div className="print-header" style={{ display: 'none' }}>
              Inventory List - {new Date().toLocaleDateString()}
            </div>
            
            <div className="bg-white dark:bg-card border dark:border-slate-800 rounded-lg shadow-sm overflow-hidden">
                <Table className="print-table">
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 border-b dark:border-slate-800">
                      {visibleColumns.has('part_number') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('part_number')}>
                          <div className="flex items-center">Part Number {getSortIndicator('part_number')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('description') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('description')}>
                          <div className="flex items-center">Description {getSortIndicator('description')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('unit') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('unit')}>
                          <div className="flex items-center justify-center">Unit {getSortIndicator('unit')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('quantity_on_hand') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('quantity_on_hand')}>
                           <div className="flex items-center justify-center">QOH {getSortIndicator('quantity_on_hand')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('cost') && (
                        <TableHead className="text-right cursor-pointer dark:text-slate-200" onClick={() => handleSort('cost')}>
                           <div className="flex items-center justify-end">Cost {getSortIndicator('cost')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('selling_price') && (
                        <TableHead className="text-right cursor-pointer dark:text-slate-200" onClick={() => handleSort('selling_price')}>
                           <div className="flex items-center justify-end">Price {getSortIndicator('selling_price')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('location') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('location')}>
                          <div className="flex items-center justify-center">Location {getSortIndicator('location')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('category') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('category')}>
                          <div className="flex items-center">Category {getSortIndicator('category')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('supplier') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('supplier_id')}>
                          <div className="flex items-center">Supplier {getSortIndicator('supplier_id')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('manufacturer') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('manufacturer')}>
                          <div className="flex items-center">Manufacturer {getSortIndicator('manufacturer')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('sales_class') && (
                        <TableHead className="cursor-pointer dark:text-slate-200" onClick={() => handleSort('sales_class')}>
                          <div className="flex items-center">Sales Class {getSortIndicator('sales_class')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('quantity_on_order') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('quantity_on_order')}>
                          <div className="flex items-center justify-center">On Order {getSortIndicator('quantity_on_order')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('minimum_quantity') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('minimum_quantity')}>
                          <div className="flex items-center justify-center">Min {getSortIndicator('minimum_quantity')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('maximum_quantity') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('maximum_quantity')}>
                          <div className="flex items-center justify-center">Max {getSortIndicator('maximum_quantity')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('profit_margin') && (
                        <TableHead className="text-right cursor-pointer dark:text-slate-200" onClick={() => handleSort('profit_margin')}>
                          <div className="flex items-center justify-end">Margin % {getSortIndicator('profit_margin')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('core') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('core')}>
                          <div className="flex items-center justify-center">Core {getSortIndicator('core')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('core_cost') && (
                        <TableHead className="text-right cursor-pointer dark:text-slate-200" onClick={() => handleSort('core_cost')}>
                          <div className="flex items-center justify-end">Core Cost {getSortIndicator('core_cost')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('stocked_item') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('stocked_item')}>
                          <div className="flex items-center justify-center">Stocked {getSortIndicator('stocked_item')}</div>
                        </TableHead>
                      )}
                      {visibleColumns.has('is_active') && (
                        <TableHead className="text-center cursor-pointer dark:text-slate-200" onClick={() => handleSort('is_active')}>
                          <div className="flex items-center justify-center">Active {getSortIndicator('is_active')}</div>
                        </TableHead>
                      )}
                      <TableHead className="text-center no-print dark:text-slate-200">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array(10).fill(0).map((_, index) => (
                        <TableRow key={index} className="border-b dark:border-slate-800">
                          <TableCell colSpan={8} className="p-0">
                             <div className="h-12 w-full bg-gray-100 dark:bg-slate-900 animate-pulse"></div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      inventory.map((item) => (
                        <ContextMenu key={item.id}>
                          <ContextMenuTrigger asChild>
                            <TableRow className="hover:bg-gray-50 dark:hover:bg-slate-800/30 border-b dark:border-slate-800 dark:text-slate-300">
                              {visibleColumns.has('part_number') && (
                                <TableCell 
                                  className="font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                                  onClick={() => handleEdit(item)}
                                >
                                  {item.part_number}
                                </TableCell>
                              )}
                              {visibleColumns.has('description') && (
                                <TableCell>{item.description}</TableCell>
                              )}
                              {visibleColumns.has('unit') && (
                                <TableCell className="text-center text-sm text-slate-600 dark:text-slate-400">
                                  {item.unit || ''}
                                </TableCell>
                              )}
                              {visibleColumns.has('quantity_on_hand') && (
                                <TableCell 
                                  className={`text-center font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors ${(item.quantity_on_hand || 0) <= (item.minimum_quantity || 0) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}
                                  onClick={() => handleAdjustQOH(item)}
                                >
                                  {item.quantity_on_hand || 0}
                                </TableCell>
                              )}
                              {visibleColumns.has('cost') && (
                                <TableCell className="text-right">${(item.cost || 0).toFixed(2)}</TableCell>
                              )}
                              {visibleColumns.has('selling_price') && (
                                <TableCell className="text-right font-semibold">${(item.selling_price || 0).toFixed(2)}</TableCell>
                              )}
                              {visibleColumns.has('location') && (
                                <TableCell 
                                  className="text-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
                                  onClick={() => handleLocationClick(item)}
                                >
                                  {item.location || 'No Location'}
                                </TableCell>
                              )}
                              {visibleColumns.has('category') && (
                                <TableCell>{item.category || '-'}</TableCell>
                              )}
                              {visibleColumns.has('supplier') && (
                                <TableCell>{suppliers.find(s => s.id === item.supplier_id)?.name || '-'}</TableCell>
                              )}
                              {visibleColumns.has('manufacturer') && (
                                <TableCell>{item.manufacturer || '-'}</TableCell>
                              )}
                              {visibleColumns.has('sales_class') && (
                                <TableCell>{salesClasses.find(sc => sc.id === item.sales_class)?.name || '-'}</TableCell>
                              )}
                              {visibleColumns.has('quantity_on_order') && (
                                <TableCell className="text-center">{item.quantity_on_order || 0}</TableCell>
                              )}
                              {visibleColumns.has('minimum_quantity') && (
                                <TableCell className="text-center">{item.minimum_quantity || 0}</TableCell>
                              )}
                              {visibleColumns.has('maximum_quantity') && (
                                <TableCell className="text-center">{item.maximum_quantity || 0}</TableCell>
                              )}
                              {visibleColumns.has('profit_margin') && (
                                <TableCell className="text-right">{(item.profit_margin || 0).toFixed(2)}%</TableCell>
                              )}
                              {visibleColumns.has('core') && (
                                <TableCell className="text-center">{item.core ? 'Yes' : 'No'}</TableCell>
                              )}
                              {visibleColumns.has('core_cost') && (
                                <TableCell className="text-right">${(item.core_cost || 0).toFixed(2)}</TableCell>
                              )}
                              {visibleColumns.has('stocked_item') && (
                                <TableCell className="text-center">{item.stocked_item ? 'Yes' : 'No'}</TableCell>
                              )}
                              {visibleColumns.has('is_active') && (
                                <TableCell className="text-center">{item.is_active ? 'Yes' : 'No'}</TableCell>
                              )}
                              <TableCell className="text-center no-print">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0 dark:text-slate-400 dark:hover:text-slate-100">
                                      <span className="sr-only">Open menu</span>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="dark:bg-slate-950 dark:border-slate-800">
                                    <DropdownMenuLabel className="dark:text-slate-200">Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleEdit(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                      <Edit className="mr-2 h-4 w-4" />
                                      <span>Edit</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleViewTransactions(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                      <FileText className="mr-2 h-4 w-4" />
                                      <span>View Transactions</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleShowHistory(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                      <History className="mr-2 h-4 w-4" />
                                      <span>History</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAdjustQOH(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                      <PackagePlus className="mr-2 h-4 w-4" />
                                      <span>Adjust QOH</span>
                                    </DropdownMenuItem>
                                     <DropdownMenuItem onClick={() => handleReturnPart(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                       <RefreshCw className="mr-2 h-4 w-4" />
                                       <span>Return Part</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleLocationClick(item)} className="dark:text-slate-300 dark:focus:bg-slate-800">
                                      <Package className="mr-2 h-4 w-4" />
                                      <span>Edit Location</span>
                                    </DropdownMenuItem>
                                    {currentUser?.admin === true && (
                                      <>
                                        <DropdownMenuSeparator className="dark:bg-slate-800" />
                                        <DropdownMenuItem
                                          onClick={() => handleDelete(item.id)}
                                          className="text-red-600 dark:text-red-400 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/30 dark:focus:text-red-400"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          <span>Delete</span>
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          </ContextMenuTrigger>
                          {renderContextMenu(item)}
                        </ContextMenu>
                      ))
                    )}
                  </TableBody>
                  <tfoot className="print-footer-row">
                    <tr>
                      <td colSpan={20} style={{ borderTop: '1px solid #ddd', borderBottom: 'none', borderLeft: 'none', borderRight: 'none', textAlign: 'right', paddingTop: '10px', fontSize: '12px', color: '#666' }}>
                        <span className="page-number"></span>
                      </td>
                    </tr>
                  </tfoot>
                </Table>

                {/* Pagination Controls */}
                {!loading && totalCount > itemsPerPage && filter !== 'inventory-count' && filter !== 'non-zero' && (
                  <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-card border-t border-gray-200 dark:border-slate-800 no-print">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 dark:text-slate-300">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} items
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-700 dark:text-slate-300">
                        Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / itemsPerPage), p + 1))}
                        disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                        className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}