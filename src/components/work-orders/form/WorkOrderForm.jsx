import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';
import WorkOrderHeaderInfo from './WorkOrderHeaderInfo';
import FinancialSummary from './FinancialSummary';
import LineItemsTable from './LineItemsTable';
import { supabase } from '@/lib/supabase';

// Modals
import GetPartModal from '../GetPartModal';
import OtherChargeModal from '../OtherChargeModal';
import AddPartToWOModal from '../WOAddInventoryModal';
import ReturnWOPartModal from '../ReturnWOPartModal';
import ReceivePartModal from '../ReceivePartModal';
import ROCoreModal from '../ROCoreModal';
import OnlineOrderModal from '../OnlineOrderModal';

// Helper function to pad lines (moved to top of file for reusability)
function padLines(lines, minLines = 20, defaultTaxable = true) {
  // Ensure all existing lines have an ID to support drag-and-drop
  const paddedLines = lines.map(line => {
    if (!line.id) {
       return { ...line, id: `_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
    }
    return line;
  });
  
  while (paddedLines.length < minLines) {
    paddedLines.push({ 
      id: `_blank_${crypto.randomUUID()}`, // UUID-style ID to prevent collisions
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
  onChangeCustomer,
  onEditVehicle,
  onShowVehicleHistory,
  onEditWorkOrderDetails,
  onSelectedLineChange,
  onOpenPaymentModal,
  onOpenOdometerPrompt,
  onOpenApprovals,
  onOpenVersionHistory,
  mode = 'work_order', // Add mode prop with default
  shopSupplyRate = 0.07,
  onLineItemProcessed,
  onWorkOrderDraftChange,
  onWorkOrderDirty,
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

  const [modals, setModals] = useState({
    getPart: false,
    otherCharge: false,
    addPart: false,
    returnPart: false,
    receivePart: false,
    cores: false,
    partsTech: false,
  });

  const [partsTechCartId, setPartsTechCartId] = useState(null);
  const [supplierUrl, setSupplierUrl] = useState("https://app.partstech.com/");

  // Helper to identify non-blank lines (must match logic in tracedSetLineItems)
  const getNonBlankLines = useCallback((lines) => {
    return lines.filter(line => 
      line && (
        line.description || 
        line.part_number || 
        line.inventory_item_id || 
        line.is_other_charge || 
        line.manually_inserted ||
        (parseFloat(line.qty) || 0) !== 0 ||
        (parseFloat(line.hrs) || 0) !== 0 ||
        (parseFloat(line.labour) || 0) !== 0 ||
        (parseFloat(line.parts_ea) || 0) !== 0
      )
    );
  }, []);

  // Sync state with props using deep comparison to avoid infinite loops
  useEffect(() => {
    if (!initialLineItems) return;

    const currentActualLines = getNonBlankLines(displayLineItems);
    
    // Compare current local actual lines with incoming props
    // We use JSON.stringify for a deep value comparison
    const isSynced = JSON.stringify(currentActualLines) === JSON.stringify(initialLineItems);

    if (!isSynced || displayLineItems.length < 20) {
      console.log('WorkOrderForm: Prop update detected or padding needed, syncing displayLineItems');
      const defaultTaxable = editedWorkOrder?.default_taxable !== undefined 
        ? editedWorkOrder.default_taxable 
        : true;
      setDisplayLineItems(padLines(initialLineItems, 20, defaultTaxable));
    } else {
      // console.log('WorkOrderForm: Props match local state and padding is sufficient, skipping sync');
    }
  }, [initialLineItems, editedWorkOrder?.default_taxable, getNonBlankLines]); // Removed displayLineItems from deps to avoid render loop, relies on functional update if needed or just re-render cycle

  // Wrap setLineItems to trace calls and manage padding
  const tracedSetLineItems = useCallback((updater) => {
    setDisplayLineItems(prevDisplayLines => {
      const updatedDisplayLines = typeof updater === 'function' ? updater(prevDisplayLines) : updater;
      
      // Extract actual (non-blank) lines to send to parent
      const actualLines = getNonBlankLines(updatedDisplayLines);
      
      // Update parent immediately
      setParentLineItems(actualLines);
      
      const defaultTaxable = editedWorkOrder?.default_taxable !== undefined 
        ? editedWorkOrder.default_taxable 
        : true;

      // Return the padded version immediately for local state
      return padLines(actualLines, 20, defaultTaxable);
    });
  }, [setParentLineItems, editedWorkOrder?.default_taxable, getNonBlankLines]);

  // Update editedWorkOrder when initialWorkOrder prop changes
  useEffect(() => {
    setEditedWorkOrder(initialWorkOrder);
  }, [initialWorkOrder]);

  useEffect(() => {
    if (editedWorkOrder && onWorkOrderDraftChange) {
      onWorkOrderDraftChange(editedWorkOrder);
    }
  }, [editedWorkOrder, onWorkOrderDraftChange]);

  // Define handleSelectLine BEFORE using it in useEffect
  const handleSelectLine = useCallback((index) => {
    console.log('WorkOrderForm: handleSelectLine called with index:', index);
    setSelectedLineIndex(index);
    setUserHasManuallySelected(true);
  }, []);

  // Ref to track previous default taxable value to prevent unwanted overrides
  const prevDefaultTaxableRef = useRef();
  const isTaxableFirstRun = useRef(true);

  // Effect to apply default_taxable to line items ONLY when the default setting explicitly changes
  useEffect(() => {
    // If default taxable is not yet defined, do nothing
    if (editedWorkOrder?.default_taxable === undefined) return;

    const currentDefault = editedWorkOrder.default_taxable;

    // Initialize the ref on first valid render without triggering update
    if (isTaxableFirstRun.current) {
        prevDefaultTaxableRef.current = currentDefault;
        isTaxableFirstRun.current = false;
        return;
    }

    // Only update lines if the header default has actually changed
    if (currentDefault !== prevDefaultTaxableRef.current) {
      tracedSetLineItems(prev => prev.map(line => {
        // Update valid lines to match new default
        if (!line || (!line.description && !line.part_number && !line.manually_inserted)) return line;
        
        return { ...line, taxable: currentDefault };
      }));
      prevDefaultTaxableRef.current = currentDefault;
    }
  }, [editedWorkOrder?.default_taxable, tracedSetLineItems]);

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
    onWorkOrderDirty?.();
  };

  const handleStatusChange = (status) => {
    setEditedWorkOrder(prev => ({ ...prev, status }));
    setHasUnsavedChanges(true);
    onWorkOrderDirty?.();
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
    setHasUnsavedChanges(true);
    tracedSetLineItems(prev => {
        let updated = [...prev];
        
        const isLineEmpty = (l) => {
            if (!l) return false;
            if (l.description || l.part_number || l.is_other_charge || l.inventory_item_id) return false;
            if ((parseFloat(l.labour) || 0) !== 0) return false;
            if ((parseFloat(l.total) || 0) !== 0) return false;
            return true;
        };

        partsArrayWithProcessedFlags.forEach((newLineItem, idx) => {
            const lineWithTaxable = { 
              ...newLineItem, 
              taxable: editedWorkOrder?.default_taxable !== undefined ? editedWorkOrder.default_taxable : true
            };
            
            let targetIndex = -1;

            // Prioritize the currently selected line if it's empty AND it's the first part being added
            if (idx === 0 && selectedLineIndex !== null && selectedLineIndex >= 0 && selectedLineIndex < updated.length && isLineEmpty(updated[selectedLineIndex])) {
                targetIndex = selectedLineIndex;
            }

            // If no specific target index, find the first available empty line
            if (targetIndex === -1) {
                targetIndex = updated.findIndex(l => isLineEmpty(l));
            }

            // If an empty slot is found, use it; otherwise, append to the end
            if (targetIndex !== -1) {
                // Use the new item directly, but ensure it has a unique ID if not already present (it should be from modal)
                // Note: parts from GetPartModal now have crypto.randomUUID() IDs.
                updated[targetIndex] = lineWithTaxable; 
            } else {
                updated.push(lineWithTaxable);
            }
        });

        console.log('Line items after adding parts:', updated);
        return updated;
    });

    closeModal('getPart');
  }, [closeModal, tracedSetLineItems, editedWorkOrder, selectedLineIndex]);

  const handleOnlineOrder = useCallback((lineIndex, url, cartId = null) => {
    console.log('=== DEBUG: handleOnlineOrder called with index:', lineIndex, 'url:', url, 'cartId:', cartId);
    setPartsTechCartId(cartId);
    setSupplierUrl(url);
    openModal('partsTech', lineIndex);
  }, [openModal]);

  const handlePartsTechSuccess = useCallback((cartPayload) => {
    console.log('=== DEBUG: handlePartsTechSuccess called ===', cartPayload);
    if (!cartPayload?.parts || !Array.isArray(cartPayload.parts)) return;

    const formattedParts = cartPayload.parts.map(part => ({
      part_number: part.partNumber || part.part_number || '',
      description: part.description || '',
      parts_ea: part.costPrice || part.parts_ea || 0,
      qty: part.quantity || part.qty || 1,
      inventory_processed: false,
    }));

    handleMultiplePartsAdded(formattedParts, []);
  }, [handleMultiplePartsAdded]);

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
        const { data: { user } } = await supabase.auth.getUser();
        const nowIso = new Date().toISOString();
        
        const supplierInvoiceLineData = {
          id: crypto.randomUUID(),
          supplier_id: chargeWithTaxable.linkedSupplierId,
          invoice_number: chargeWithTaxable.supplierInvoiceNumber,
          invoice_date: chargeWithTaxable.supplierInvoiceDate,
          description: chargeWithTaxable.supplierLineDescription || chargeWithTaxable.description,
          purchase_amount: chargeWithTaxable.supplierPurchaseAmount,
          gst_amount: chargeWithTaxable.supplierGstAmount,
          gl_account: chargeWithTaxable.supplierGlAccount,
          inventory: false,
          created_date: nowIso,
          updated_date: nowIso,
          created_by: user?.email || 'unknown',
          created_by_id: user?.id || null
        };
        
        const { data: supplierInvoiceLineResponse, error: createSilError } = await supabase
          .from('SupplierInvoiceLine')
          .insert(supplierInvoiceLineData)
          .select();
          
        if (createSilError) throw createSilError;
        const createdSupplierInvoiceLine = supplierInvoiceLineResponse?.[0];
        console.log('=== DEBUG: Created SupplierInvoiceLine:', createdSupplierInvoiceLine);
        
        newLine.supplier_invoice_line_id = createdSupplierInvoiceLine?.id;
        
        console.log('=== DEBUG: Posting to GL ===');
        await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
          body: {
            supplierInvoiceLine: createdSupplierInvoiceLine,
            action: 'create'
          }
        });
        console.log('=== DEBUG: GL posting successful ===');
        
      } catch (error) {
        console.error('Error creating SupplierInvoiceLine or posting to GL:', error);
        alert('Failed to create supplier invoice line. The charge will be added without cost tracking.');
      }
    }
    
    tracedSetLineItems(prev => {
      const newLines = [...prev];
      
      const isLineEmpty = (l) => {
          if (!l) return false;
          if (l.description || l.part_number || l.is_other_charge || l.inventory_item_id) return false;
          if ((parseFloat(l.labour) || 0) !== 0) return false;
          if ((parseFloat(l.total) || 0) !== 0) return false;
          return true;
      };

      let targetIndex = -1;

      if (selectedLineIndex !== null && selectedLineIndex >= 0 && selectedLineIndex < newLines.length) {
          if (isLineEmpty(newLines[selectedLineIndex])) {
              targetIndex = selectedLineIndex;
          }
      }

      if (targetIndex === -1) {
          targetIndex = newLines.findIndex(l => isLineEmpty(l));
      }

      if (targetIndex !== -1) {
          newLines[targetIndex] = newLine;
      } else {
          newLines.push(newLine);
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
        
        const { data: oldSupplierInvoiceLineResponse, error: oldSilError } = await supabase
          .from('SupplierInvoiceLine')
          .select('*')
          .eq('id', existingSupplierInvoiceLineId);
          
        if (oldSilError) throw oldSilError;
        const oldSupplierInvoiceLine = oldSupplierInvoiceLineResponse?.[0];
        
        const { data: { user } } = await supabase.auth.getUser();
        const nowIso = new Date().toISOString();
        
        const updatedSupplierInvoiceLineData = {
          supplier_id: updatedChargeData.linkedSupplierId,
          invoice_number: updatedChargeData.supplierInvoiceNumber,
          invoice_date: updatedChargeData.supplierInvoiceDate,
          description: updatedChargeData.supplierLineDescription || updatedChargeData.description,
          purchase_amount: updatedChargeData.supplierPurchaseAmount,
          gst_amount: updatedChargeData.supplierGstAmount,
          gl_account: updatedChargeData.supplierGlAccount,
          updated_date: nowIso
        };
        
        const { error: updateSilError } = await supabase
          .from('SupplierInvoiceLine')
          .update(updatedSupplierInvoiceLineData)
          .eq('id', existingSupplierInvoiceLineId);
          
        if (updateSilError) throw updateSilError;
        console.log('=== DEBUG: Updated SupplierInvoiceLine ===');
        
        await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
          body: {
            supplierInvoiceLine: { ...updatedSupplierInvoiceLineData, id: existingSupplierInvoiceLineId },
            action: 'update',
            oldValues: oldSupplierInvoiceLine
          }
        });
        console.log('=== DEBUG: GL update successful ===');
      }
      else if (existingSupplierInvoiceLineId && !updatedChargeData.applyCost) {
        console.log('=== DEBUG: Deleting SupplierInvoiceLine (cost removed) ===');
        
        const { data: supplierInvoiceLineToDeleteResponse, error: deleteReadError } = await supabase
          .from('SupplierInvoiceLine')
          .select('*')
          .eq('id', existingSupplierInvoiceLineId);
          
        if (deleteReadError) throw deleteReadError;
        const supplierInvoiceLineToDelete = supplierInvoiceLineToDeleteResponse?.[0];
        
        const { error: deleteSilError } = await supabase
          .from('SupplierInvoiceLine')
          .delete()
          .eq('id', existingSupplierInvoiceLineId);
          
        if (deleteSilError) throw deleteSilError;
        console.log('=== DEBUG: Deleted SupplierInvoiceLine ===');
        
        await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
          body: {
            supplierInvoiceLine: supplierInvoiceLineToDelete,
            action: 'delete'
          }
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
                  const newQty = (parseFloat(updatedLine.qty) || 0) - qtyReturned;
                  updatedLine.qty = newQty;
                  
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
                  
                  if (newQty <= 0) {
                      if (onLineItemProcessed) {
                          onLineItemProcessed(line.id);
                      }
                      return null;
                  }
                  return updatedLine;
              }
              return line;
          }).filter(line => line !== null);
          
          console.log('Lines after filtering:', updatedLines.length);
          
          return updatedLines; // Removed direct padLines call here, tracedSetLineItems will handle it
      });
      
      setHasUnsavedChanges(true);
      closeModal('returnPart');
  };
  
  const handleReceiveWorkOrderPart = async (lineItem, receivedQuantity, freshInventoryItem) => {
      console.log('=== DEBUG: handleReceiveWorkOrderPart called ===');
      console.log('Line item:', lineItem);
      console.log('Received quantity:', receivedQuantity);
      console.log('Fresh inventory item:', freshInventoryItem);
      
      if (!lineItem || !lineItem.inventory_item_id) {
          console.error('Cannot receive part: missing line item or inventory_item_id');
          return;
      }

      try {
          const inventoryItem = freshInventoryItem || inventory.find(i => i.id === lineItem.inventory_item_id);
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
                          inventory_processed: true,
                          cost_ea: freshInventoryItem?.cost || inventoryItem?.cost || 0
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
    
    if (currentLineIndex !== null && newCoreRet !== undefined) {
      // Update the core_ret value for the line item and recalculate totals immediately
      tracedSetLineItems(prev => {
        const updated = [...prev];
        const line = updated[currentLineIndex];
        
        if (line) {
          // 1. Calculate new core outstanding amount
          const coreNum = parseFloat(line.Core_num) || 0;
          const coreCost = parseFloat(line.core_cost) || 0;
          const newCoreOsamt = (coreNum - newCoreRet) * coreCost;

          // 2. Get other values needed for calculation
          const qty = parseFloat(line.qty) || 0;
          const partsEa = parseFloat(line.parts_ea) || 0;
          const labour = parseFloat(line.labour) || 0;
          const ocTotal = parseFloat(line.oc_total) || 0;

          // 3. Recalculate totals
          let newTotParts = 0;
          let newTotal = 0;

          if (line.is_other_charge) {
             newTotParts = 0;
             newTotal = ocTotal;
          } else {
             newTotParts = (qty * partsEa) + newCoreOsamt;
             newTotal = newTotParts + labour + ocTotal;
          }

          updated[currentLineIndex] = {
            ...line,
            core_ret: newCoreRet,
            core_osamt: newCoreOsamt,
            tot_parts: newTotParts,
            total: newTotal
          };
        }
        return updated;
      });
    }
    
    setHasUnsavedChanges(true);
    closeModal('cores');
  };

  const handleDeleteLine = useCallback(async (lineIndex) => {
    if (lineIndex === null || lineIndex < 0 || lineIndex >= displayLineItems.length) return;
    
    const itemToDelete = displayLineItems[lineIndex];
    if (!itemToDelete || (!itemToDelete.description && !itemToDelete.part_number)) {
      // Just remove empty line without confirmation or logic
      tracedSetLineItems(prev => {
        const updated = [...prev];
        updated.splice(lineIndex, 1);
        return updated; 
      });
      setHasUnsavedChanges(true);
      return; 
    }

    let proceedWithDeletion = false;

    // Specific confirmation for lines with associated cost entries
    if (itemToDelete.supplier_invoice_line_id) {
      proceedWithDeletion = window.confirm(
        'This line has an associated cost entry. Deleting it will create an offsetting reversal entry in the supplier invoice records. Continue?'
      );
    } else {
      // General confirmation for other lines (parts, labor, etc.)
      proceedWithDeletion = window.confirm(`Are you sure you want to delete line: "${itemToDelete.description || itemToDelete.part_number}"?`);
    }

    if (!proceedWithDeletion) {
      return; // User cancelled deletion
    }

    console.log(`WorkOrderForm: Attempting to delete line ${lineIndex}: ${itemToDelete.description || itemToDelete.part_number}`);

    // Handle SupplierInvoiceLine reversal if this line has an associated cost entry
    if (itemToDelete.supplier_invoice_line_id) {
      try {
        // Fetch the original SupplierInvoiceLine record
        const { data: originalSILResponse, error: originalSilError } = await supabase
          .from('SupplierInvoiceLine')
          .select('*')
          .eq('id', itemToDelete.supplier_invoice_line_id);
          
        if (originalSilError) throw originalSilError;
        const originalSIL = originalSILResponse?.[0];
        
        if (originalSIL) {
          // Create offsetting SupplierInvoiceLine record instead of deleting the original
          const { data: { user } } = await supabase.auth.getUser();
          const nowIso = new Date().toISOString();
          
          const offsettingSILData = {
            id: crypto.randomUUID(),
            supplier_id: originalSIL.supplier_id,
            invoice_number: originalSIL.invoice_number,
            invoice_date: format(toMountainTime(new Date()), 'yyyy-MM-dd'),
            description: `REVERSAL: ${originalSIL.description}`,
            purchase_amount: -1 * (parseFloat(originalSIL.purchase_amount) || 0),
            gst_amount: -1 * (parseFloat(originalSIL.gst_amount) || 0),
            gl_account: originalSIL.gl_account,
            inventory: originalSIL.inventory,
            inventory_item_id: originalSIL.inventory_item_id,
            gst_override: originalSIL.gst_override,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: user?.email || 'unknown',
            created_by_id: user?.id || null
          };

          const { data: offsettingSILResponse, error: offsettingSilError } = await supabase
            .from('SupplierInvoiceLine')
            .insert(offsettingSILData)
            .select();
            
          if (offsettingSilError) throw offsettingSilError;
          const offsettingSIL = offsettingSILResponse?.[0];
          console.log('WorkOrderForm: Created offsetting SupplierInvoiceLine:', offsettingSIL);
          
          // Post the offsetting GL entries (action: 'create' with negative values acts as reversal)
          await supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', {
            body: {
              supplierInvoiceLine: offsettingSIL,
              action: 'create'
            }
          });
          console.log(`WorkOrderForm: Successfully created offsetting SIL and GL entries for line ${lineIndex}`);
        } else {
          console.warn(`WorkOrderForm: Original SupplierInvoiceLine not found for ID ${itemToDelete.supplier_invoice_line_id}`);
        }
        
      } catch (error) {
        console.error('WorkOrderForm: Error processing SupplierInvoiceLine reversal:', error);
        alert('Failed to process supplier invoice line reversal. Please try again.');
        return; // Don't proceed with line deletion if reversal failed
      }
    }

    // Handle inventory updates for parts
    // MOVED TO DocumentEditor.js handleSave logic to prevent double counting and ensure consistency
    // if (itemToDelete.inventory_item_id) { ... }

    tracedSetLineItems(prev => {
      const updated = [...prev];
      updated.splice(lineIndex, 1);
      return updated; 
    });
    setHasUnsavedChanges(true);
    console.log(`WorkOrderForm: Line ${lineIndex} successfully removed from UI.`);
  }, [tracedSetLineItems, displayLineItems, initialWorkOrder]);

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
      id: `blank_${crypto.randomUUID()}`,
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
    <div className="space-y-6 pb-32">
      <WorkOrderHeaderInfo
        workOrder={editedWorkOrder}
        customer={customer}
        vehicle={vehicle}
        employees={employees}
        onFieldChange={handleFieldChange}
        onStatusChange={handleStatusChange}
        isLocked={isLocked}
        onEditCustomer={onEditCustomer}
        onChangeCustomer={onChangeCustomer}
        onEditVehicle={onEditVehicle}
        onShowVehicleHistory={onShowVehicleHistory}
        onEditWorkOrderDetails={onEditWorkOrderDetails}
        onOpenOdometerPrompt={onOpenOdometerPrompt}
        onOpenApprovals={onOpenApprovals}
        onOpenVersionHistory={onOpenVersionHistory}
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
        onOnlineOrder={handleOnlineOrder}
        onDeleteLine={handleDeleteLine} // Pass handleDeleteLine to LineItemsTable
        onInsertLine={handleInsertLine}
        workOrder={initialWorkOrder}
        selectedLineIndex={selectedLineIndex}
        onSelectLine={handleSelectLine}
        mode={mode} // Pass mode to LineItemsTable
      />

      <div className="sticky bottom-0 z-10 py-2 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur border-t border-slate-200 dark:border-slate-800">
        <FinancialSummary lineItems={displayLineItems} workOrder={initialWorkOrder} shopSupplyRate={shopSupplyRate} />
      </div>
      
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
        workOrderNumber={initialWorkOrder?.ro_number || initialWorkOrder?.wo_number}
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
        workOrderId={initialWorkOrder?.id}
        roNumber={initialWorkOrder?.ro_number}
        onReceive={handleReceiveWorkOrderPart}
      />
      <ROCoreModal
        open={modals.cores}
        onClose={() => closeModal('cores')}
        lineItem={currentLineItem}
        workOrder={initialWorkOrder}
        onCoreProcessed={handleCoreProcessed}
        mode={mode} // Pass mode
      />
      <OnlineOrderModal
        open={modals.partsTech}
        onClose={() => {
          closeModal('partsTech');
          setPartsTechCartId(null);
        }}
        roNumber={initialWorkOrder?.ro_number}
        vehicleInfo={vehicle}
        userInfo={{ username: 'tech' }}
        onTransferComplete={handlePartsTechSuccess}
        cartId={partsTechCartId}
        supplierUrl={supplierUrl}
      />
    </div>
  );
}