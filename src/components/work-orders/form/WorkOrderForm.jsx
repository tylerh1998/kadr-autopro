import React, { useState, useEffect, useCallback, useRef } from 'react';
import WorkOrderHeaderInfo from './WorkOrderHeaderInfo';
import FinancialSummary from './FinancialSummary';
import LineItemsTable from './LineItemsTable';
import { SupplierInvoiceLine } from '@/entities/all';
import { base44 } from '@/api/base44Client';

// Modals
import GetPartModal from '../GetPartModal';
import OtherChargeModal from '../OtherChargeModal';
import AddPartToWOModal from '../WOAddInventoryModal';
import ReturnWOPartModal from '../ReturnWOPartModal';
import ReceivePartModal from '../ReceivePartModal';
import ROCoreModal from '../ROCoreModal';

// Helper function to pad lines (moved to top of file for reusability)
function padLines(lines, minLines = 20, defaultTaxable = true) {
  const paddedLines = [...lines];
  
  while (paddedLines.length < minLines) {
    paddedLines.push({ 
      id: `_blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // UUID-style ID to prevent collisions
      qty: 0,
      hrs: 0,
      description: '',
      part_number: '',
      parts_ea: 0,
      tot_parts: 0,
      labour: 0,
      total: 0,
      taxable: defaultTaxable,
      complete: false,
      bold: false,
      inventory_processed: false,
      inventory_item_id: null,
      Core_num: 0,
      core_ret: 0,
      core_cost: 0,
      core_osamt: 0,
      is_other_charge: false,
      oc_total: 0,
      supplier_invoice_line_id: null,
      qty_on_order: 0,
      unit: '',
      manually_inserted: false
    });
  }
  console.log('padLines invoked, new length:', paddedLines.length);
  return paddedLines;
}

export default function WorkOrderForm({
  workOrder: initialWorkOrder,
  customer,
  vehicle,
  employees,
  inventory,
  lineItems: initialLineItems,
  onSave,
  onCancel,
  setParentLineItems,
  onEditCustomer,
  onEditVehicle,
  onShowVehicleHistory,
  onEditWorkOrderDetails,
  onSelectedLineChange,
  onOpenPaymentModal,
  onOpenOdometerPrompt,
  onOpenApprovals,
  mode = 'work_order', // Add mode prop with default
}) {
  const [editedWorkOrder, setEditedWorkOrder] = useState(initialWorkOrder);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [currentLineItem, setCurrentLineItem] = useState(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);
  const [userHasManuallySelected, setUserHasManuallySelected] = useState(false);
  
  // New state for padded line items
  const [displayLineItems, setDisplayLineItems] = useState([]);

  // Use a ref to track if we're currently updating to avoid re-initialization loops
  const isInternalUpdate = useRef(false);
  
  // Ref for debounce timeout
  const parentUpdateTimeout = useRef(null);
  
  const [modals, setModals] = useState({
    getPart: false,
    otherCharge: false,
    addPart: false,
    returnPart: false,
    receivePart: false,
    cores: false,
  });

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (parentUpdateTimeout.current) {
        clearTimeout(parentUpdateTimeout.current);
      }
    };
  }, []);

  // Initialize displayLineItems ONLY on mount or when initialLineItems reference actually changes externally
  // Use a ref to track if we're currently updating to avoid re-initialization loops
  useEffect(() => {
    console.log('WorkOrderForm: Initialization useEffect triggered');
    console.log('isInternalUpdate.current:', isInternalUpdate.current);
    
    // Skip re-initialization if this is from our own internal update
    if (isInternalUpdate.current) {
      console.log('WorkOrderForm: Skipping re-initialization (internal update)');
      isInternalUpdate.current = false; // Reset flag
      return;
    }
    
    console.log('WorkOrderForm: Initializing displayLineItems from initialLineItems');
    if (initialLineItems) {
      const defaultTaxable = editedWorkOrder?.default_taxable !== undefined 
        ? editedWorkOrder.default_taxable 
        : true; // Get default_taxable from editedWorkOrder
      setDisplayLineItems(padLines(initialLineItems, 20, defaultTaxable)); // Pass defaultTaxable
    }
  }, [initialLineItems, editedWorkOrder?.default_taxable]); // Add editedWorkOrder?.default_taxable to dependencies

  // Wrap setLineItems to trace calls and manage padding - NOW WITH DEBOUNCE
  const tracedSetLineItems = useCallback((updater) => {
    console.log('WorkOrderForm: tracedSetLineItems called');
    
    setDisplayLineItems(prevDisplayLines => {
      const updatedDisplayLines = typeof updater === 'function' ? updater(prevDisplayLines) : updater;
      
      // Extract actual (non-blank) lines to send to parent
      // UPDATED FILTER: Include lines with numeric values even if description/part_number are blank
      const actualLines = updatedDisplayLines.filter(line => 
        line && (
          line.description || 
          line.part_number || 
          line.inventory_item_id || 
          line.is_other_charge || 
          line.manually_inserted ||
          (parseFloat(line.qty) || 0) > 0 ||
          (parseFloat(line.hrs) || 0) > 0 ||
          (parseFloat(line.labour) || 0) > 0 ||
          (parseFloat(line.parts_ea) || 0) > 0
        )
      );
      
      console.log('WorkOrderForm: Preparing to update parent with actual lines:', actualLines.length);
      
      // Clear existing timeout
      if (parentUpdateTimeout.current) {
        clearTimeout(parentUpdateTimeout.current);
      }
      
      // Debounce the parent update by 300ms
      parentUpdateTimeout.current = setTimeout(() => {
        console.log('WorkOrderForm: DEBOUNCED - Updating parent with actual lines:', actualLines.length);
        // Set flag to prevent re-initialization when parent updates come back
        isInternalUpdate.current = true;
        // Communicate the *unpadded actual lines* back to the parent
        setParentLineItems(actualLines);
      }, 300);
      
      const defaultTaxable = editedWorkOrder?.default_taxable !== undefined 
        ? editedWorkOrder.default_taxable 
        : true;

      // Return the padded version immediately for local state (no delay for UI)
      return padLines(actualLines, 20, defaultTaxable);
    });
  }, [setParentLineItems, editedWorkOrder?.default_taxable]);

  // Update editedWorkOrder when initialWorkOrder prop changes
  useEffect(() => {
    setEditedWorkOrder(initialWorkOrder);
  }, [initialWorkOrder]);

  // Define handleSelectLine BEFORE using it in useEffect
  const handleSelectLine = useCallback((index) => {
    console.log('WorkOrderForm: handleSelectLine called with index:', index);
    setSelectedLineIndex(index);
    setUserHasManuallySelected(true);
  }, []);

  // Effect to apply default_taxable to line items when it changes
  useEffect(() => {
    if (editedWorkOrder?.default_taxable !== undefined && displayLineItems.length > 0) {
      const needsUpdate = displayLineItems.some(line => 
        line && (line.description || line.part_number) &&
        line.taxable !== editedWorkOrder.default_taxable
      );

      if (needsUpdate) {
        tracedSetLineItems(prev => prev.map(line => {
          if (!line || (!line.description && !line.part_number)) return line;
          
          if (line.taxable !== editedWorkOrder.default_taxable) {
            return { ...line, taxable: editedWorkOrder.default_taxable };
          }
          return line;
        }));
      }
    }
  }, [editedWorkOrder?.default_taxable, displayLineItems, tracedSetLineItems]);

  // Simplified auto-select logic - only runs when appropriate
  useEffect(() => {
    console.log('=== AUTO-SELECT useEffect TRIGGERED ===');
    console.log('displayLineItems length:', displayLineItems?.length);
    console.log('selectedLineIndex:', selectedLineIndex);
    console.log('userHasManuallySelected:', userHasManuallySelected);

    if (!displayLineItems || displayLineItems.length === 0) {
      console.log('No line items, clearing selection');
      if (selectedLineIndex !== null) {
        setSelectedLineIndex(prev => { 
          console.log('WorkOrderForm: Clearing selectedLineIndex'); 
          return null; 
        });
        setUserHasManuallySelected(false);
      }
      return;
    }

    const validLineItems = displayLineItems.filter(line => line !== undefined && line !== null);
    console.log('validLineItems length:', validLineItems.length);

    if (validLineItems.length === 0) {
      console.log('No valid line items, clearing selection');
      if (selectedLineIndex !== null) {
        setSelectedLineIndex(prev => { 
          console.log('WorkOrderForm: Clearing selectedLineIndex'); 
          return null; 
        });
        setUserHasManuallySelected(false);
      }
      return;
    }

    console.log('WorkOrderForm: displayLineItems at empty check:', JSON.stringify(displayLineItems.map(l => ({
      id: l?.id,
      inventory_item_id: l?.inventory_item_id,
      is_other_charge: l?.is_other_charge,
      description: l?.description,
      part_number: l?.part_number,
      manually_inserted: l?.manually_inserted
    }))));

    // Find the first empty line in the displayLineItems array
    // UPDATED DEFINITION: A line is empty if:
    // - No inventory item linked (!inventory_item_id)
    // - Not marked as an other charge (!is_other_charge)
    // - Description is blank
    // - Part number is blank
    // - Not manually inserted
    console.log('=== CHECKING FOR EMPTY LINES (STRICTER DEFINITION) ===');
    const firstEmptyIndex = displayLineItems.findIndex(
      (line, index) => {
        const isEmpty = line && 
                        !line.inventory_item_id && // No part linked
                        !line.is_other_charge && // Not an other charge
                        !line.manually_inserted && // Not a manually inserted line
                        (!line.description || line.description.trim() === '') && // Description is empty
                        (!line.part_number || line.part_number.trim() === ''); // Part number is empty
        return isEmpty;
      }
    );
    console.log('=== END CHECKING FOR EMPTY LINES ===');
    console.log('firstEmptyIndex:', firstEmptyIndex);

    // Check if current selection is valid
    const isCurrentSelectionValid = selectedLineIndex !== null && 
                                     selectedLineIndex >= 0 && 
                                     selectedLineIndex < displayLineItems.length &&
                                     displayLineItems[selectedLineIndex] !== undefined &&
                                     displayLineItems[selectedLineIndex] !== null;
    console.log('isCurrentSelectionValid:', isCurrentSelectionValid);

    // If current selection is invalid, reset userHasManuallySelected flag
    if (!isCurrentSelectionValid && userHasManuallySelected) {
      console.log('Current selection invalid, resetting userHasManuallySelected flag');
      setUserHasManuallySelected(false);
    }

    // Auto-select first empty line if:
    // 1. User hasn't manually selected OR current selection is invalid
    // 2. No line is currently selected OR current selection is out of bounds
    // 3. There is an empty line available
    if ((!userHasManuallySelected || !isCurrentSelectionValid) && 
        (!isCurrentSelectionValid) && 
        firstEmptyIndex !== -1) {
      console.log('Auto-selecting first empty line at index:', firstEmptyIndex);
      setSelectedLineIndex(prev => {
        console.log('WorkOrderForm: Setting selectedLineIndex to firstEmptyIndex:', firstEmptyIndex);
        return firstEmptyIndex;
      });
      return;
    }

    // Handle case where selected line is now out of bounds (e.g., deleted)
    if (selectedLineIndex !== null && selectedLineIndex >= validLineItems.length) {
      console.log('Selected line out of bounds, attempting to recover');
      if (firstEmptyIndex !== -1) {
        console.log('Selecting first empty line at index:', firstEmptyIndex);
        setSelectedLineIndex(prev => {
          console.log('WorkOrderForm: Setting selectedLineIndex to firstEmptyIndex:', firstEmptyIndex);
          return firstEmptyIndex;
        });
      } else {
        const lastValidIndex = validLineItems.length > 0 ? validLineItems.length - 1 : null;
        console.log('No empty line, selecting last valid line at index:', lastValidIndex);
        setSelectedLineIndex(prev => {
          console.log('WorkOrderForm: Setting selectedLineIndex to lastValidIndex:', lastValidIndex);
          return lastValidIndex;
        });
      }
    }

    console.log('=== AUTO-SELECT useEffect COMPLETE ===');
  }, [displayLineItems, selectedLineIndex, userHasManuallySelected]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectedLineChange) {
      onSelectedLineChange(selectedLineIndex);
    }
  }, [selectedLineIndex, onSelectedLineChange]);

  const openModal = useCallback((modalName, lineIndex = null) => {
    console.log('=== DEBUG: openModal called ===');
    console.log('Modal name:', modalName);
    console.log('Line index:', lineIndex);
    
    if (lineIndex !== null) {
      const selectedLine = displayLineItems[lineIndex];
      console.log('Setting current line item:', selectedLine);
      setCurrentLineItem(selectedLine);
      setCurrentLineIndex(lineIndex);
    }
    setModals(prev => {
      const newModals = { ...prev, [modalName]: true };
      console.log('New modals state:', newModals);
      return newModals;
    });
  }, [displayLineItems]);
  
  const closeModal = useCallback((modalName) => {
    console.log('=== DEBUG: closeModal called ===');
    console.log('Modal name:', modalName);
    setModals(prev => ({ ...prev, [modalName]: false }));
    setCurrentLineItem(null);
    setCurrentLineIndex(null);
  }, []);

  const handleFieldChange = (field, value) => {
    setEditedWorkOrder(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleStatusChange = (status) => {
    setEditedWorkOrder(prev => ({ ...prev, status }));
    setHasUnsavedChanges(true);
  };

  const handleGetPart = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleGetPart called with index:', lineIndex);
    openModal('getPart', lineIndex);
  }, [openModal]);
  
  const handleOtherCharge = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleOtherCharge called with index:', lineIndex);
    openModal('otherCharge', lineIndex);
  }, [openModal]);
  
  const handleAddPart = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleAddPart called with index:', lineIndex);
    openModal('addPart', lineIndex);
  }, [openModal]);
  
  const handleReturnPart = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleReturnPart called with index:', lineIndex);
    openModal('returnPart', lineIndex);
  }, [openModal]);
  
  const handleReceivePart = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleReceivePart called with index:', lineIndex);
    openModal('receivePart', lineIndex);
  }, [openModal]);
  
  const handleCores = useCallback((lineIndex) => {
    console.log('=== DEBUG: handleCores called with index:', lineIndex);
    openModal('cores', lineIndex);
  }, [openModal]);
  
  const handleMultiplePartsAdded = useCallback((partsArrayWithProcessedFlags, inventoryAdjustments) => {
    console.log('=== DEBUG: handleMultiplePartsAdded (WorkOrderForm) called ===');
    console.log('Parts array from GetPartModal:', partsArrayWithProcessedFlags);
    console.log('Inventory adjustments:', inventoryAdjustments);
    
    setHasUnsavedChanges(true);
    tracedSetLineItems(prev => {
        let updated = [...prev];
        let currentUpdateIndex = selectedLineIndex !== null ? selectedLineIndex : -1;

        partsArrayWithProcessedFlags.forEach(newLineItem => {
            const lineWithTaxable = { 
              ...newLineItem, 
              taxable: editedWorkOrder?.default_taxable !== undefined ? editedWorkOrder.default_taxable : true
            };
            
            let emptyLineFound = false;
            if (currentUpdateIndex !== -1 && updated[currentUpdateIndex] && (!updated[currentUpdateIndex]?.description && !updated[currentUpdateIndex]?.part_number && !updated[currentUpdateIndex]?.manually_inserted)) {
              updated[currentUpdateIndex] = { ...lineWithTaxable, id: `_blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
              emptyLineFound = true;
            } else {
              const nextEmptyIndex = updated.findIndex(
                  (l, idx) => l && (!l.description && !l.part_number && !l.manually_inserted) && idx > currentUpdateIndex
              );
              if (nextEmptyIndex !== -1) {
                  updated[nextEmptyIndex] = { ...lineWithTaxable, id: `_blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
                  currentUpdateIndex = nextEmptyIndex;
                  emptyLineFound = true;
              }
            }

            if (!emptyLineFound) {
                updated.push({ ...lineWithTaxable, id: `_blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` });
                currentUpdateIndex = updated.length - 1;
            }
        });

        console.log('=== DEBUG: Updated line items in WorkOrderForm ===');
        console.log('Line items after adding parts:', updated);
        return updated;
    });

    closeModal('getPart');
  }, [closeModal, tracedSetLineItems, editedWorkOrder, selectedLineIndex]);

  const handleAddOtherCharge = async (chargeData) => {
    console.log('=== DEBUG: handleAddOtherCharge called ===');
    console.log('chargeData:', chargeData);
    
    const chargeWithTaxable = {
      ...chargeData,
      taxable: editedWorkOrder?.default_taxable !== undefined ? editedWorkOrder.default_taxable : (chargeData.taxable !== undefined ? chargeData.taxable : true)
    };
    
    const newLine = {
      id: Date.now(),
      qty: chargeWithTaxable.qty || 1,
      hrs: chargeWithTaxable.hrs || 0,
      description: chargeWithTaxable.description || '',
      part_number: chargeWithTaxable.part_number || '',
      parts_ea: 0,
      tot_parts: 0,
      labour: 0,
      oc_total: chargeWithTaxable.oc_total || 0,
      total: chargeWithTaxable.total || 0,
      taxable: chargeWithTaxable.taxable,
      complete: false,
      bold: false,
      is_other_charge: true,
      gl_account: chargeWithTaxable.gl_account || '', // Store GL account for accounting
      manually_inserted: false, // Other charges are not "blank" lines
    };
    
    if (chargeWithTaxable.applyCost) {
      try {
        console.log('=== DEBUG: Creating SupplierInvoiceLine ===');
        
        const supplierInvoiceLineData = {
          supplier_id: chargeWithTaxable.linkedSupplierId,
          invoice_number: chargeWithTaxable.supplierInvoiceNumber,
          invoice_date: chargeWithTaxable.supplierInvoiceDate,
          description: chargeWithTaxable.description,
          purchase_amount: chargeWithTaxable.supplierPurchaseAmount,
          gst_amount: chargeWithTaxable.supplierGstAmount,
          gl_account: chargeWithTaxable.supplierGlAccount,
          inventory: false
        };
        
        const createdSupplierInvoiceLine = await SupplierInvoiceLine.create(supplierInvoiceLineData);
        console.log('=== DEBUG: Created SupplierInvoiceLine:', createdSupplierInvoiceLine);
        
        newLine.supplier_invoice_line_id = createdSupplierInvoiceLine.id;
        
        console.log('=== DEBUG: Posting to GL ===');
        await base44.functions.invoke('handleSupplierInvoiceLineGL', {
          supplierInvoiceLine: createdSupplierInvoiceLine,
          action: 'create'
        });
        console.log('=== DEBUG: GL posting successful ===');
        
      } catch (error) {
        console.error('Error creating SupplierInvoiceLine or posting to GL:', error);
        alert('Failed to create supplier invoice line. The charge will be added without cost tracking.');
      }
    }
    
    tracedSetLineItems(prev => {
      const newLines = [...prev];
      if (selectedLineIndex !== null && newLines[selectedLineIndex] && (!newLines[selectedLineIndex].description && !newLines[selectedLineIndex].part_number && !newLines[selectedLineIndex].manually_inserted)) {
        newLines[selectedLineIndex] = newLine;
      } else {
        newLines.splice(selectedLineIndex !== null ? selectedLineIndex + 1 : newLines.length, 0, newLine);
      }
      return newLines;
    });
    setHasUnsavedChanges(true);
    closeModal('otherCharge');
  };

  const handleEditOtherCharge = async (updatedChargeData) => {
    console.log('=== DEBUG: handleEditOtherCharge called ===');
    console.log('updatedChargeData:', updatedChargeData);
    console.log('currentLineItem:', currentLineItem);
    
    const existingSupplierInvoiceLineId = currentLineItem?.supplier_invoice_line_id;
    let newSupplierInvoiceLineId = existingSupplierInvoiceLineId;
    
    try {
      if (existingSupplierInvoiceLineId && updatedChargeData.applyCost) {
        console.log('=== DEBUG: Updating existing SupplierInvoiceLine ===');
        
        const oldSupplierInvoiceLine = await SupplierInvoiceLine.get(existingSupplierInvoiceLineId);
        
        const updatedSupplierInvoiceLineData = {
          supplier_id: updatedChargeData.linkedSupplierId,
          invoice_number: updatedChargeData.supplierInvoiceNumber,
          invoice_date: updatedChargeData.supplierInvoiceDate,
          description: updatedChargeData.description,
          purchase_amount: updatedChargeData.supplierPurchaseAmount,
          gst_amount: updatedChargeData.supplierGstAmount,
          gl_account: updatedChargeData.supplierGlAccount,
        };
        
        await SupplierInvoiceLine.update(existingSupplierInvoiceLineId, updatedSupplierInvoiceLineData);
        console.log('=== DEBUG: Updated SupplierInvoiceLine ===');
        
        await base44.functions.invoke('handleSupplierInvoiceLineGL', {
          supplierInvoiceLine: { ...updatedSupplierInvoiceLineData, id: existingSupplierInvoiceLineId },
          action: 'update',
          oldValues: oldSupplierInvoiceLine
        });
        console.log('=== DEBUG: GL update successful ===');
      }
      else if (existingSupplierInvoiceLineId && !updatedChargeData.applyCost) {
        console.log('=== DEBUG: Deleting SupplierInvoiceLine (cost removed) ===');
        
        const supplierInvoiceLineToDelete = await SupplierInvoiceLine.get(existingSupplierInvoiceLineId);
        
        await SupplierInvoiceLine.delete(existingSupplierInvoiceLineId);
        console.log('=== DEBUG: Deleted SupplierInvoiceLine ===');
        
        await base44.functions.invoke('handleSupplierInvoiceLineGL', {
          supplierInvoiceLine: supplierInvoiceLineToDelete,
          action: 'delete'
        });
        console.log('=== DEBUG: GL reversal successful ===');
        
        newSupplierInvoiceLineId = null;
      }
      else if (!existingSupplierInvoiceLineId && updatedChargeData.applyCost) {
        console.warn('=== DEBUG: Attempting to apply cost on edit without existing SIL - this should not happen ===');
        alert('Cannot apply cost to an existing charge. Please delete and re-add the charge with cost application.');
        return;
      }
    } catch (error) {
      console.error('Error updating SupplierInvoiceLine or posting to GL:', error);
      alert('Failed to update supplier invoice line. The charge will be updated without cost tracking changes.');
    }
    
    tracedSetLineItems(prev => prev.map(line => {
      if (line.id === updatedChargeData.id) {
        const updatedLine = {
          ...line,
          description: updatedChargeData.description,
          qty: updatedChargeData.qty,
          oc_total: updatedChargeData.oc_total,
          total: updatedChargeData.total,
          taxable: updatedChargeData.taxable,
          gl_account: updatedChargeData.gl_account || line.gl_account || '', // Preserve or update GL account
        };
        
        if (newSupplierInvoiceLineId) {
          updatedLine.supplier_invoice_line_id = newSupplierInvoiceLineId;
        } else {
          delete updatedLine.supplier_invoice_line_id;
          delete updatedLine.apply_cost;
          delete updatedLine.linked_supplier_id;
          delete updatedLine.supplier_invoice_number;
          delete updatedLine.supplier_invoice_date;
          delete updatedLine.supplier_purchase_amount;
          delete updatedLine.supplier_gst_amount;
          delete updatedLine.supplier_gl_account;
          delete updatedLine.supplier_description;
        }
        
        return updatedLine;
      }
      return line;
    }));
    setHasUnsavedChanges(true);
    closeModal('otherCharge');
  };

  const handleReturnWorkOrderPart = (returnedQuantity, returnType, returnReason) => {
      if (!currentLineItem || currentLineIndex === null) return;

      const qtyReturned = parseFloat(returnedQuantity);
      if (isNaN(qtyReturned) || qtyReturned <= 0) return;

      console.log('=== DEBUG: handleReturnWorkOrderPart - Updating line items ===');
      console.log('Current line index:', currentLineIndex);
      console.log('Quantity returned:', qtyReturned);

      tracedSetLineItems(prev => {
          const updatedLines = prev.map((line, idx) => {
              if (idx === currentLineIndex) {
                  const updatedLine = { ...line };
                  updatedLine.qty = (parseFloat(updatedLine.qty) || 0) - qtyReturned;
                  
                  if (updatedLine.is_other_charge) {
                      if (line.qty > 0) {
                          const ocTotalPerUnit = (parseFloat(line.oc_total) || 0) / parseFloat(line.qty);
                          updatedLine.oc_total = ocTotalPerUnit * updatedLine.qty;
                      } else {
                          updatedLine.oc_total = 0;
                      }
                      updatedLine.total = updatedLine.oc_total;
                  } else {
                      updatedLine.tot_parts = updatedLine.qty * (parseFloat(updatedLine.parts_ea) || 0);
                      updatedLine.total = updatedLine.tot_parts + (parseFloat(updatedLine.labour) || 0);
                  }
                  
                  console.log('Updated line qty:', updatedLine.qty);
                  
                  return updatedLine.qty > 0 ? updatedLine : null;
              }
              return line;
          }).filter(line => line !== null);
          
          console.log('Lines after filtering:', updatedLines.length);
          
          return updatedLines; // Removed direct padLines call here, tracedSetLineItems will handle it
      });
      
      setHasUnsavedChanges(true);
      closeModal('returnPart');
  };
  
  const handleReceiveWorkOrderPart = async (lineItem, receivedQuantity) => {
      console.log('=== DEBUG: handleReceiveWorkOrderPart called ===');
      console.log('Line item:', lineItem);
      console.log('Received quantity:', receivedQuantity);
      
      if (!lineItem || !lineItem.inventory_item_id) {
          console.error('Cannot receive part: missing line item or inventory_item_id');
          return;
      }

      try {
          const inventoryItem = inventory.find(i => i.id === lineItem.inventory_item_id);
          if (!inventoryItem) {
              console.error('Inventory item not found for id:', lineItem.inventory_item_id);
              alert('Inventory item not found.');
              return;
          }

          console.log('=== DEBUG: Found inventory item:', inventoryItem);

          tracedSetLineItems(prev => {
              const updated = prev.map(li => {
                  if (li.id === lineItem.id) {
                      const currentQtyOnOrder = parseFloat(li.qty_on_order) || 0;
                      const newQtyOnOrder = Math.max(0, currentQtyOnOrder - receivedQuantity);
                      
                      console.log('=== DEBUG: Updating line item ===');
                      console.log('Current qty_on_order:', currentQtyOnOrder);
                      console.log('New qty_on_order:', newQtyOnOrder);
                      console.log('Current inventory_processed:', li.inventory_processed);
                      console.log('New inventory_processed: true');
                      
                      return { 
                          ...li, 
                          qty_on_order: newQtyOnOrder,
                          inventory_processed: true
                      };
                  }
                  return li;
              });
              
              console.log('=== DEBUG: Line items after receive ===');
              console.log('Updated line items:', updated);
              return updated;
          });
          
          setHasUnsavedChanges(true);
          closeModal('receivePart');
      } catch (error) {
          console.error('Error in handleReceiveWorkOrderPart:', error);
          alert('Failed to update line item. Please try again.');
      }
  };

  const handleCoreProcessed = (quantity, action, cost, newCoreRet) => {
    console.log('=== DEBUG: handleCoreProcessed called ===');
    console.log('quantity:', quantity, 'action:', action, 'cost:', cost, 'newCoreRet:', newCoreRet);
    
    if (action === 'received' && currentLineIndex !== null && newCoreRet !== undefined) {
      // Update the core_ret value for the line item
      tracedSetLineItems(prev => {
        const updated = [...prev];
        if (updated[currentLineIndex]) {
          updated[currentLineIndex] = {
            ...updated[currentLineIndex],
            core_ret: newCoreRet,
            core_osamt: ((updated[currentLineIndex].Core_num || 0) - newCoreRet) * (updated[currentLineIndex].core_cost || 0)
          };
        }
        return updated;
      });
    }
    
    setHasUnsavedChanges(true);
    closeModal('cores');
  };

  const handleDeleteLine = useCallback((lineIndex) => {
    if (lineIndex === null || lineIndex < 0 || lineIndex >= displayLineItems.length) return;
    
    tracedSetLineItems(prev => {
      const updated = [...prev];
      updated.splice(lineIndex, 1);
      return updated; // Removed direct padLines call here, tracedSetLineItems will handle it
    });
    setHasUnsavedChanges(true);
  }, [tracedSetLineItems, displayLineItems.length]);

  const handleBoldLine = useCallback((lineIndex) => {
    if (lineIndex === null || lineIndex < 0 || lineIndex >= displayLineItems.length) return;
    
    tracedSetLineItems(prev => {
      const updated = [...prev];
      if (updated[lineIndex]) {
        updated[lineIndex] = {
          ...updated[lineIndex],
          bold: !updated[lineIndex].bold
        };
      }
      return updated;
    });
    setHasUnsavedChanges(true);
  }, [tracedSetLineItems, displayLineItems.length]);

  const handleInsertLine = useCallback((lineIndex) => {
    if (lineIndex === null || lineIndex < 0 || lineIndex >= displayLineItems.length) return;
    
    const defaultTaxable = editedWorkOrder?.default_taxable !== undefined 
      ? editedWorkOrder.default_taxable 
      : true;
    
    const newBlankLine = {
      id: `blank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      qty: 0,
      hrs: 0,
      description: '',
      part_number: '',
      parts_ea: 0,
      tot_parts: 0,
      labour: 0,
      total: 0,
      taxable: defaultTaxable,
      complete: false,
      bold: false,
      inventory_processed: false,
      inventory_item_id: null,
      Core_num: 0,
      core_ret: 0,
      core_cost: 0,
      core_osamt: 0,
      is_other_charge: false,
      oc_total: 0,
      supplier_invoice_line_id: null,
      qty_on_order: 0,
      unit: '',
      manually_inserted: true  // Mark as manually inserted so it won't be filtered out
    };
    
    tracedSetLineItems(prev => {
      const updated = [...prev];
      updated.splice(lineIndex + 1, 0, newBlankLine);
      return updated;
    });
    
    // Select the newly inserted line
    setSelectedLineIndex(lineIndex + 1);
    setHasUnsavedChanges(true);
  }, [tracedSetLineItems, editedWorkOrder?.default_taxable, displayLineItems.length, setSelectedLineIndex, setHasUnsavedChanges]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.ctrlKey || selectedLineIndex === null) return;

      switch(e.key.toLowerCase()) {
        case 'g':
          e.preventDefault();
          handleGetPart(selectedLineIndex);
          break;
        case 'o':
          e.preventDefault();
          handleOtherCharge(selectedLineIndex);
          break;
        case 'a':
          e.preventDefault();
          handleAddPart(selectedLineIndex);
          break;
        case 'n':
          e.preventDefault();
          const selectedLine = displayLineItems[selectedLineIndex];
          if (selectedLine && selectedLine.inventory_item_id && (parseFloat(selectedLine.qty_on_order) || 0) > 0) {
            handleReceivePart(selectedLineIndex);
          }
          break;
        case 'd':
          e.preventDefault();
          handleDeleteLine(selectedLineIndex);
          break;
        case 'b':
          e.preventDefault();
          handleBoldLine(selectedLineIndex);
          break;
        case 'i':
          e.preventDefault();
          handleInsertLine(selectedLineIndex);
          break;
        case '4':
          e.preventDefault();
          if (onOpenPaymentModal) {
            onOpenPaymentModal();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLineIndex, displayLineItems, handleGetPart, handleOtherCharge, handleAddPart, handleReceivePart, handleDeleteLine, handleBoldLine, handleInsertLine, onOpenPaymentModal]);

  return (
    <div className="space-y-6">
      <WorkOrderHeaderInfo
        workOrder={editedWorkOrder}
        customer={customer}
        vehicle={vehicle}
        employees={employees}
        onFieldChange={handleFieldChange}
        onStatusChange={handleStatusChange}
        isLocked={isLocked}
        onEditCustomer={onEditCustomer}
        onEditVehicle={onEditVehicle}
        onShowVehicleHistory={onShowVehicleHistory}
        onEditWorkOrderDetails={onEditWorkOrderDetails}
        onOpenOdometerPrompt={onOpenOdometerPrompt}
        onOpenApprovals={onOpenApprovals}
      />
      
      <LineItemsTable
        lineItems={displayLineItems}
        setLineItems={tracedSetLineItems}
        isLocked={isLocked}
        onGetPart={handleGetPart}
        onOtherCharge={handleOtherCharge}
        onAddPart={handleAddPart}
        onReturnPart={handleReturnPart}
        onReceivePart={handleReceivePart}
        onCores={handleCores}
        workOrder={initialWorkOrder}
        selectedLineIndex={selectedLineIndex}
        onSelectLine={handleSelectLine}
        mode={mode} // Pass mode to LineItemsTable
      />

      <FinancialSummary lineItems={displayLineItems} workOrder={initialWorkOrder} />
      
      {/* Modal Components */}
      <GetPartModal
        open={modals.getPart}
        onClose={() => closeModal('getPart')}
        inventoryItems={inventory || []}
        onAddParts={handleMultiplePartsAdded}
        contextLineItem={currentLineItem}
        workOrder={initialWorkOrder}
        mode={mode} // Pass mode
      />
      <OtherChargeModal
        open={modals.otherCharge}
        onClose={() => closeModal('otherCharge')}
        onAddCharge={handleAddOtherCharge}
        onEditCharge={currentLineItem?.is_other_charge ? handleEditOtherCharge : null}
        editingChargeLine={currentLineItem?.is_other_charge ? currentLineItem : null}
      />
      <AddPartToWOModal 
        open={modals.addPart}
        onClose={() => closeModal('addPart')}
        onAdd={handleMultiplePartsAdded}
        workOrder={initialWorkOrder}
      />
      <ReturnWOPartModal
          open={modals.returnPart}
          onClose={() => closeModal('returnPart')}
          lineItem={currentLineItem}
          onReturn={handleReturnWorkOrderPart}
          workOrder={initialWorkOrder}
      />
      <ReceivePartModal
        open={modals.receivePart}
        onClose={() => closeModal('receivePart')}
        lineItem={currentLineItem}
        inventoryItem={inventory.find(i => i.id === currentLineItem?.inventory_item_id)}
        onReceive={handleReceiveWorkOrderPart}
      />
      <ROCoreModal
        open={modals.cores}
        onClose={() => closeModal('cores')}
        lineItem={currentLineItem}
        workOrder={initialWorkOrder}
        onCoreProcessed={handleCoreProcessed}
      />
    </div>
  );
}