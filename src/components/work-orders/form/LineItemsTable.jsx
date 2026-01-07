import React, { useState, useCallback, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { InventoryItem, InventoryTxs, SupplierInvoiceLine, Supplier, SalesClass, InventoryLocation, InventoryCategory } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Package,
  RotateCcw,
  Truck,
  Trash2,
  Plus,
  Wrench,
  AlertTriangle,
  DollarSign,
  Hash,
  GripVertical
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SerialNumberModal from '../SerialNumberModal';
import InventoryEditModal from '@/components/inventory/InventoryEditModal';

export default function LineItemsTable({
  lineItems,
  setLineItems,
  isLocked,
  onGetPart,
  onOtherCharge,
  onAddPart,
  onReturnPart,
  onReceivePart,
  onCores,
  onDeleteLine, // Accept onDeleteLine prop
  workOrder,
  selectedLineIndex,
  onSelectLine,
  mode = 'work_order', // Add mode prop with default
}) {
  const [inventoryPrices, setInventoryPrices] = useState({});
  const [serialNumModalOpen, setSerialNumModalOpen] = useState(false);
  const [serialNumLineIndex, setSerialNumLineIndex] = useState(null);

  // Inventory Edit Modal State
  const [editInventoryModalOpen, setEditInventoryModalOpen] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [salesClasses, setSalesClasses] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);

  // Strategic logging as per outline
  console.log('LineItemsTable: selectedLineIndex:', selectedLineIndex);
  console.log('LineItemsTable: lineItems (summary):', JSON.stringify(lineItems.map(l => ({
    id: l?.id,
    inventory_item_id: l?.inventory_item_id,
    is_other_charge: l?.is_other_charge,
    description: l?.description,
    part_number: l?.part_number
  }))));

  // Fetch inventory prices when lineItems change
  useEffect(() => {
    const fetchInventoryPrices = async () => {
      const partIds = [...new Set(lineItems.map(item => item.inventory_item_id).filter(Boolean))];
      if (partIds.length > 0) {
        try {
          const fetchedItems = await InventoryItem.filter({ id: { $in: partIds } });
          const pricesMap = {};
          fetchedItems.forEach(item => {
            pricesMap[item.id] = parseFloat(item.selling_price) || 0;
          });
          setInventoryPrices(pricesMap);
        } catch (error) {
          console.error("Failed to fetch inventory item prices:", error);
        }
      } else {
        setInventoryPrices({});
      }
    };
    fetchInventoryPrices();
  }, [lineItems]);

  // Maximum characters for description (3 lines at 70 chars per line)
  const MAX_DESCRIPTION_LENGTH = 210;

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    if (sourceIndex === destinationIndex) return;

    setLineItems(prev => {
        // Filter out undefined/null items to match the rendered list indices
        // ensuring 1:1 mapping for drag operations
        const validItems = prev.filter(line => line !== undefined && line !== null);
        
        const newItems = Array.from(validItems);
        const [reorderedItem] = newItems.splice(sourceIndex, 1);
        newItems.splice(destinationIndex, 0, reorderedItem);
        return newItems;
    });
  };

  // Renamed from handleLineItemChange to handleFieldChange as per outline's implicit naming convention.
  const handleFieldChange = (index, field, value) => {
    // Validation rule: Prevent changing quantity for inventory items in work order stage
    if (field === 'qty' && mode === 'work_order') {
      const currentItem = lineItems[index];
      if (currentItem && currentItem.inventory_item_id) {
        alert("Please delete the line and readd to change the quantity");
        return;
      }
    }

    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      
      let processedValue = value;
      // Special handling for description field - limit characters
      if (field === 'description') {
        const stringValue = String(value || '');
        // Apply character limit first
        if (stringValue.length > MAX_DESCRIPTION_LENGTH) {
          processedValue = stringValue.substring(0, MAX_DESCRIPTION_LENGTH);
        } else {
          processedValue = stringValue;
        }
      }

      // Check if this line was previously blank (before applying the new value)
      const wasBlank = !item.description && !item.part_number;
      
      // Assign the potentially processed value
      // Note: `value` might be a boolean for checkbox, or string/number for input.
      // parseFloat is handled during calculations below for numeric fields.
      item[field] = processedValue; 

      // If qty, hrs, or labour is entered on a blank line, mark as manually inserted
      if (wasBlank && (field === 'qty' || field === 'hrs' || field === 'labour') && processedValue) {
        item.manually_inserted = true;
      }

      // If line is transitioning from blank to non-blank, initialize taxable
      const isNowNonBlank = item.description || item.part_number;
      if (wasBlank && isNowNonBlank && item.taxable === undefined) {
        // Set taxable to work order's default_taxable (default to true if not set)
        item.taxable = workOrder?.default_taxable !== undefined ? workOrder.default_taxable : true;
      }

      // --- RECALCULATE ALL DERIVED VALUES AFTER ANY CHANGE ---

      // 1. Calculate core_osamt (Outstanding Core Amount)
      const coreNum = parseFloat(item.Core_num) || 0;
      const coreRet = parseFloat(item.core_ret) || 0;
      const coreCost = parseFloat(item.core_cost) || 0;
      item.core_osamt = (coreNum - coreRet) * coreCost;

      // 2. Extract numeric values from item, ensuring they are numbers
      const qty = parseFloat(item.qty) || 0;
      const parts_ea = parseFloat(item.parts_ea) || 0;
      const hrs = parseFloat(item.hrs) || 0;
      const oc_total = parseFloat(item.oc_total) || 0; // Other charge total

      // 3. Calculate tot_parts
      if (item.is_other_charge) {
          item.tot_parts = 0; // Other charges generally don't have parts cost, only an overall 'oc_total'
      } else {
          item.tot_parts = (qty * parts_ea) + item.core_osamt; // Include core_osamt in parts total
      }

      // 4. Calculate labour
      // If the field being changed is not 'labour' itself, re-calculate based on hrs.
      // If it IS 'labour', we assume the user directly entered it, so we use the new value from item[field].
      if (field !== 'labour') {
          item.labour = hrs * (workOrder?.labor_rate || 120);
      }
      // Note: labour is kept as entered (text) to allow decimal input like "10."

      // 5. Calculate total for the line item
      const labour = parseFloat(item.labour) || 0; // Parse labour for calculation
      if (item.is_other_charge) {
          item.total = oc_total; // For other charges, total is just oc_total
      } else {
          // For regular line items, total is sum of parts, labour, and any other charges associated with it
          item.total = item.tot_parts + labour + oc_total;
      }
      // --- END RECALCULATION ---

      updated[index] = item;
      return updated;
    });
  };

  // deleteLine logic moved to WorkOrderForm and passed as onDeleteLine prop

  const handleLineItemClick = useCallback((index) => {
    if (onSelectLine && index !== selectedLineIndex) {
      onSelectLine(index);
    }
  }, [onSelectLine, selectedLineIndex]);

  const handleKeyDown = (event, index) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = Math.min(index + 1, lineItems.length - 1);
      onSelectLine(nextIndex);
      // Attempt to focus the description input of the next line
      const nextDescriptionInput = document.querySelector(`textarea[data-line-index="${nextIndex}"]`);
      if (nextDescriptionInput) {
        nextDescriptionInput.focus();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = Math.max(index - 1, 0);
      onSelectLine(prevIndex);
      // Attempt to focus the description input of the previous line
      const prevDescriptionInput = document.querySelector(`textarea[data-line-index="${prevIndex}"]`);
      if (prevDescriptionInput) {
        prevDescriptionInput.focus();
      }
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const nextIndex = index + 1;
      if (nextIndex < lineItems.length) {
        // Focus the description field of the next line
        const nextDescriptionInput = document.querySelector(`textarea[data-line-index="${nextIndex}"]`);
        if (nextDescriptionInput) {
          nextDescriptionInput.focus();
        }
      }
    }
  };

  // Handler for when any input field in a row receives focus or is clicked
  const handleFieldInteraction = useCallback((index, event) => {
    event.stopPropagation();
    if (onSelectLine && index !== selectedLineIndex) {
      onSelectLine(index);
    }
  }, [onSelectLine, selectedLineIndex]);

  // getTextareaHeight is removed as the onInput approach is now used for dynamic height.

  const handleUpdateToInventoryPrice = (index, inventorySellingPrice) => {
    handleFieldChange(index, 'parts_ea', (inventorySellingPrice || 0).toFixed(2));
  };

  const handleOpenSerialNumModal = (index) => {
    setSerialNumLineIndex(index);
    setSerialNumModalOpen(true);
  };

  const handleSaveSerialNum = (serialNum) => {
    if (serialNumLineIndex !== null) {
      handleFieldChange(serialNumLineIndex, 'serial_num', serialNum);
    }
  };

  const handlePartDetails = async (line) => {
    if (!line.inventory_item_id) return;
    
    try {
        // Fetch necessary data if not already loaded
        if (suppliers.length === 0 || inventoryCategories.length === 0) {
            const [suppliersData, salesClassesData, locationsData, categoriesData] = await Promise.all([
                Supplier.list(),
                SalesClass.list(),
                InventoryLocation.list(),
                InventoryCategory.list()
            ]);
            setSuppliers(suppliersData);
            setSalesClasses(salesClassesData);
            setInventoryLocations(locationsData);
            setInventoryCategories(categoriesData);
        }

        // Fetch the item details
        const item = await InventoryItem.get(line.inventory_item_id);
        setEditingInventoryItem(item);
        setEditInventoryModalOpen(true);
    } catch (error) {
        console.error("Error fetching part details:", error);
        alert("Failed to load part details.");
    }
  };

  const handleInventoryItemUpdate = (updatedItem) => {
    setInventoryPrices(prev => ({
        ...prev,
        [updatedItem.id]: parseFloat(updatedItem.selling_price) || 0
    }));
    setEditInventoryModalOpen(false);
    setEditingInventoryItem(null);
  };

  const renderContextMenu = (line, index) => {
    const inventorySellingPrice = inventoryPrices[line.inventory_item_id];
    const isPriceDifferent = line.part_number && line.inventory_item_id && inventorySellingPrice !== undefined && parseFloat(line.parts_ea) !== inventorySellingPrice;

    return (
      <ContextMenuContent>
      <ContextMenuItem onClick={() => onGetPart(index)}>
        <Package className="mr-2 h-4 w-4" />
        <span>Get Part</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onOtherCharge(index)}>
        <Plus className="mr-2 h-4 w-4" />
        <span>Other Charge</span>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAddPart(index)}>
        <Plus className="mr-2 h-4 w-4" />
        <span>Add New Part</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      {line.part_number && (
        <>
          {mode !== 'estimate' && (
            <ContextMenuItem onClick={() => onReturnPart(index)} disabled={!line.part_number}>
              <RotateCcw className="mr-2 h-4 w-4" />
              <span>Return Part</span>
            </ContextMenuItem>
          )}
          {mode !== 'estimate' && (
            <ContextMenuItem onClick={() => onReceivePart(index)} disabled={!line.qty_on_order || line.qty_on_order === 0}>
              <Truck className="mr-2 h-4 w-4" />
              <span>Receive Part</span>
            </ContextMenuItem>
          )}
          {mode !== 'estimate' && (
            <ContextMenuItem onClick={() => onCores(index)} disabled={!line.Core_num || line.Core_num === 0}>
              <Wrench className="mr-2 h-4 w-4" />
              <span>Cores</span>
            </ContextMenuItem>
          )}
          {line.inventory_item_id && (
            <ContextMenuItem onClick={() => handleOpenSerialNumModal(index)}>
              <Hash className="mr-2 h-4 w-4" />
              <span>Serial Number</span>
            </ContextMenuItem>
          )}
          {line.inventory_item_id && (
            <ContextMenuItem onClick={() => handlePartDetails(line)}>
              <Package className="mr-2 h-4 w-4" />
              <span>Part Details</span>
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}
      {isPriceDifferent && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleUpdateToInventoryPrice(index, inventorySellingPrice)}>
            <DollarSign className="mr-2 h-4 w-4" />
            <span>Update to Inv. Price (${(inventorySellingPrice || 0).toFixed(2)})</span>
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem
        onClick={() => onDeleteLine(index)}
        className="text-red-600 focus:text-red-700"
        disabled={!line.description && !line.part_number} // Disable if line is empty
      >
        <Trash2 className="mr-2 h-4 w-4" />
        <span>Delete Line</span>
      </ContextMenuItem>
    </ContextMenuContent>
    );
  };

  const renderLineItem = (line, index, draggableProvided) => {
    const isSelected = selectedLineIndex === index;
    const isBold = line.bold;
    const hasPartNumber = !!line.part_number;
    
    const inventorySellingPrice = inventoryPrices[line.inventory_item_id];
    const isPriceDifferent = hasPartNumber && line.inventory_item_id && inventorySellingPrice !== undefined && parseFloat(line.parts_ea) !== inventorySellingPrice;
    
    // const isEmptyLine = !line.description && !line.part_number; // Kept from outline but not used for opacity

    // Calculate core_osamt for display
    const coreNum = parseFloat(line.Core_num) || 0;
    const coreRet = parseFloat(line.core_ret) || 0;
    const coreCost = parseFloat(line.core_cost) || 0;
    const coreOutstanding = coreNum - coreRet;
    const coreOsamt = coreOutstanding * coreCost;

    return (
      <ContextMenu key={line.id || `line-${index}`}>
        <ContextMenuTrigger asChild>
          <TableRow
            ref={draggableProvided.innerRef}
            {...draggableProvided.draggableProps}
            style={draggableProvided.draggableProps.style}
            onClick={() => handleLineItemClick(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            tabIndex={0}
            className={`
              border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors
              ${isSelected ? 'bg-blue-200 ring-2 ring-blue-400' : index % 2 === 0 ? 'bg-white' : 'bg-slate-100'}
              ${isBold ? 'font-bold' : ''}
              ${line.complete ? 'bg-green-50' : ''}
            `}
          >
            {/* Drag Handle Column */}
            <TableCell className="w-12 p-0 align-middle text-center">
               <div {...draggableProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing flex justify-center items-center w-full h-full min-h-[42px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                 <GripVertical className="w-6 h-6" />
               </div>
            </TableCell>

            {/* Qty Column */}
            <TableCell className="w-20 p-1 align-top">
              <Input
                type="text"
                value={line.qty === 0 ? '' : (line.qty ?? '')}
                onChange={(e) => handleFieldChange(index, 'qty', e.target.value)}
                onFocus={(e) => handleFieldInteraction(index, e)}
                onClick={(e) => handleFieldInteraction(index, e)}
                className={`w-16 h-8 text-center text-sm bg-white ${isBold ? 'font-bold' : ''}`}
                disabled={isLocked}
                data-line-index={index}
              />
            </TableCell>

            {/* Hrs Column */}
            <TableCell className="w-20 p-1 align-top">
              <Input
                type="text"
                value={line.hrs === 0 ? '' : (line.hrs ?? '')}
                onChange={(e) => handleFieldChange(index, 'hrs', e.target.value)}
                onFocus={(e) => handleFieldInteraction(index, e)}
                onClick={(e) => handleFieldInteraction(index, e)}
                className={`w-16 h-8 text-center text-sm bg-white ${isBold ? 'font-bold' : ''}`}
                disabled={isLocked}
                data-line-index={index}
              />
            </TableCell>

            {/* Description & Part Number Column (Combined) */}
            <TableCell className="min-w-[300px] p-1 align-top"> {/* Preserving original min-width */}
              <div className="space-y-1">
                <Textarea
                  value={line.description || ''}
                  onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                  onFocus={(e) => handleFieldInteraction(index, e)}
                  onClick={(e) => handleFieldInteraction(index, e)}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  className={`w-full text-sm resize-none bg-white min-h-[32px] py-1 ${isBold ? 'font-bold' : ''}`}
                  rows={
                    (line.description || '').length > 120 ? 3 : 
                    (line.description || '').length > 70 ? 2 : 1
                  }
                  placeholder="Enter description"
                  disabled={isLocked}
                  data-line-index={index}
                />
                {hasPartNumber && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 px-2"> {/* Added px-2 for consistency with textarea */}
                    <span className="font-mono">{line.part_number}</span>
                    {line.serial_num && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-slate-100 text-slate-600 border-slate-300">
                        S/N: {line.serial_num}
                      </Badge>
                    )}
                    {coreOutstanding > 0 && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-amber-50 text-amber-700 border-amber-300 whitespace-nowrap">
                        Cores ({coreOutstanding}) - ${coreOsamt.toFixed(2)}
                      </Badge>
                    )}
                    {line.qty_on_order > 0 && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-blue-50 text-blue-700 border-blue-300">
                        On Order {line.qty_on_order}
                      </Badge>
                    )}
                    {isPriceDifferent && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-green-50 text-green-700 border-green-300 whitespace-nowrap">
                        <AlertTriangle className="w-3 h-3 mr-1 inline" /> Price Different
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </TableCell>

            {/* Parts EA Column */}
            <TableCell className="w-24 p-1 align-top"> {/* Width adjusted to outline's suggestion */}
              <Input
                type="text"
                value={line.parts_ea ?? ''}
                onChange={(e) => handleFieldChange(index, 'parts_ea', e.target.value)}
                onFocus={(e) => handleFieldInteraction(index, e)}
                onClick={(e) => handleFieldInteraction(index, e)}
                className={`w-20 h-8 text-right text-sm bg-white ${isBold ? 'font-bold' : ''}`}
                disabled={isLocked}
                data-line-index={index}
              />
            </TableCell>

            {/* Unit Column - NEW from outline */}
            <TableCell className="w-16 p-1 align-top">
              <Input
                type="text"
                value={line.unit || ''}
                onChange={(e) => handleFieldChange(index, 'unit', e.target.value)}
                onFocus={(e) => handleFieldInteraction(index, e)}
                onClick={(e) => handleFieldInteraction(index, e)}
                disabled={isLocked}
                className={`h-8 text-center text-sm bg-white ${isBold ? 'font-bold' : ''}`}
                maxLength={5}
                data-line-index={index}
              />
            </TableCell>

            {/* Tot. Parts Column - Read Only */}
            <TableCell className={`w-24 text-right text-sm font-medium p-1 align-top ${isBold ? 'font-bold' : ''}`}>
              ${(line.tot_parts || 0).toFixed(2)}
            </TableCell>

            {/* Labour Column */}
            <TableCell className="w-24 p-1 align-top"> {/* Width adjusted to outline's suggestion */}
              <Input
                type="text"
                value={line.labour ?? ''}
                onChange={(e) => handleFieldChange(index, 'labour', e.target.value)}
                onFocus={(e) => handleFieldInteraction(index, e)}
                onClick={(e) => handleFieldInteraction(index, e)}
                className={`w-20 h-8 text-right text-sm bg-white ${isBold ? 'font-bold' : ''}`}
                disabled={isLocked}
                data-line-index={index}
              />
            </TableCell>

            {/* Tx Column */}
            <TableCell className="w-16 p-1 text-center align-top">
              <Checkbox
                checked={line.taxable !== false}
                onCheckedChange={(checked) => handleFieldChange(index, 'taxable', checked)}
                disabled={isLocked}
                className="mx-auto mt-2"
                onClick={(e) => e.stopPropagation()} // Keep stopPropagation for checkbox specifically
              />
            </TableCell>

            {/* Total Column - Read Only */}
            <TableCell className={`w-24 text-right text-sm font-bold p-1 align-top ${isBold ? 'font-bold' : ''}`}>
              ${(line.total || 0).toFixed(2)}
            </TableCell>
            {/* The "Actions Column" from the outline is not implemented as the ContextMenu wraps the entire row for actions. */}
          </TableRow>
        </ContextMenuTrigger>
        {renderContextMenu(line, index)}
      </ContextMenu>
    );
  };

  return (
    <>
      <Card>
        <CardContent className="p-6"> {/* Preserved original padding */}
          <div className="overflow-x-auto">
            <DragDropContext onDragEnd={onDragEnd}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100">
                    <TableHead className="w-12 p-2"></TableHead>
                    <TableHead className="w-20 text-center text-xs font-semibold p-2">Qty</TableHead>
                    <TableHead className="w-20 text-center text-xs font-semibold p-2">Hrs</TableHead>
                    {/* Description column now also includes Part #, so min-width is changed to 300px */}
                    <TableHead className="min-w-[300px] text-left text-xs font-semibold p-2">Description / Part #</TableHead> 
                    <TableHead className="w-24 text-center text-xs font-semibold p-2">Parts EA</TableHead>
                    <TableHead className="w-16 text-center text-xs font-semibold p-2">Unit</TableHead> {/* New Unit column header */}
                    <TableHead className="w-24 text-right text-xs font-semibold p-2">Tot. Parts</TableHead>
                    <TableHead className="w-24 text-right text-xs font-semibold p-2">Labour</TableHead>
                    <TableHead className="w-16 text-center text-xs font-semibold p-2">TX</TableHead>
                    <TableHead className="w-24 text-right text-xs font-semibold p-2">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <Droppable droppableId="line-items">
                  {(droppableProvided) => (
                    <TableBody ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                      {lineItems && lineItems
                        .filter(line => line !== undefined && line !== null) // Filter out undefined/null items
                        .map((line, index) => (
                          <Draggable key={String(line.id || `line-${index}`)} draggableId={String(line.id || `line-${index}`)} index={index}>
                            {(draggableProvided) => renderLineItem(line, index, draggableProvided)}
                          </Draggable>
                        )
                      )}
                      {droppableProvided.placeholder}
                    </TableBody>
                  )}
                </Droppable>
              </Table>
            </DragDropContext>
          </div>
        </CardContent>
      </Card>

      <SerialNumberModal
        open={serialNumModalOpen}
        onClose={() => setSerialNumModalOpen(false)}
        onSave={handleSaveSerialNum}
        currentSerialNum={serialNumLineIndex !== null ? lineItems[serialNumLineIndex]?.serial_num : ''}
      />

      <InventoryEditModal
        key={editingInventoryItem ? editingInventoryItem.id : 'closed'}
        open={editInventoryModalOpen}
        onClose={() => setEditInventoryModalOpen(false)}
        item={editingInventoryItem}
        onUpdate={handleInventoryItemUpdate}
        suppliers={suppliers}
        salesClasses={salesClasses}
        inventoryLocations={inventoryLocations}
        inventoryCategories={inventoryCategories}
      />
    </>
  );
}