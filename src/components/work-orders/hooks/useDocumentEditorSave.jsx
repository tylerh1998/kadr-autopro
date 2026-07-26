import { useCallback } from 'react';
import { WorkOrder } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabase';
import { manageWorkOrderLock } from '@/functions/manageWorkOrderLock';
import { useQueryClient } from '@tanstack/react-query';
import { prepareWorkOrderSavePayload } from '@/components/work-orders/utils/buildWorkOrderSavePayload';

export default function useDocumentEditorSave({
  workOrder,
  lineItems,
  setLineItems,
  setWorkOrder,
  systemSettings,
  invoiceConversionPhase,
  refetchWorkOrder,
  pendingReturns,
  setPendingReturns,
  mode,
  currentUser,
  useFunctionData,
  previousLineItemsRef,
  latestLineItemsRef,
  lockAcquiredRef,
  setHasUnsavedChanges,
  setSaving,
  sessionId,
}) {
  return useCallback(async (updatedDetails = {}, showAlertOnSuccess = true, lineItemsOverride = null, saveOptions = {}) => {
    if (!workOrder || !workOrder.id) {
      console.error('Cannot save: workOrder or workOrder.id is missing');
      return;
    }

    setSaving(true);

    try {
      let workingLineItems = lineItemsOverride || lineItems;
      if (updatedDetails.default_taxable !== undefined && updatedDetails.default_taxable !== workOrder?.default_taxable) {
        workingLineItems = lineItems.map(line => ({
          ...line,
          taxable: updatedDetails.default_taxable
        }));
        setLineItems(workingLineItems);
      }

      if (mode === 'work_order') {
        const previousLines = previousLineItemsRef.current || [];
        const currentLineIds = new Set(workingLineItems.map(line => line.id));
        const deletedLines = previousLines.filter(prevLine => {
          const totalQty = parseFloat(prevLine.qty) || 0;
          const qtyOnOrder = parseFloat(prevLine.qty_on_order) || 0;
          return prevLine.id && !currentLineIds.has(prevLine.id) && prevLine.inventory_item_id && (totalQty > 0 || qtyOnOrder > 0);
        });

        for (const deletedLine of deletedLines) {
          try {
            const totalQty = parseFloat(deletedLine.qty) || 0;
            const qtyOnOrder = parseFloat(deletedLine.qty_on_order) || 0;
            if (totalQty <= 0 && qtyOnOrder <= 0) continue;

            const response = await supabase.functions.invoke('autopro-processDeletedWorkOrderLineItem', {
              body: {
                inventoryItemId: deletedLine.inventory_item_id,
                workOrderId: workOrder.id,
                roNumber: workOrder.ro_number,
                partNumber: deletedLine.part_number,
                totalQty,
                qtyOnOrder,
              }
            });

            if (!response.data?.success) {
              throw new Error(response.data?.error || 'Failed to process deleted work order line');
            }
          } catch (error) {
            console.error(`Failed to replenish inventory for deleted line ${deletedLine.part_number}:`, error);
          }
        }

        if (pendingReturns.length > 0) {
          for (const returnItem of pendingReturns) {
            try {
              const response = await supabase.functions.invoke('autopro-processWorkOrderPartReturn', {
                body: {
                  inventoryItemId: returnItem.inventory_item_id,
                  workOrderId: workOrder.id,
                  roNumber: workOrder.ro_number,
                  partNumber: returnItem.part_number,
                  description: returnItem.description,
                  qtyToReturn: returnItem.qtyToReturn,
                }
              });

              if (!response.data?.success) {
                throw new Error(response.data?.error || 'Failed to process pending return');
              }
            } catch (error) {
              console.error(`Failed to process return for ${returnItem.part_number}:`, error);
            }
          }
          setPendingReturns([]);
        }
      }

      // Separate lines that need inventory processing from those that don't
      const linesToProcess = [];
      const linesSkipped = [];
      
      workingLineItems.forEach(line => {
        if (mode === 'estimate' || line.inventory_processed || !line.inventory_item_id || parseFloat(line.qty) <= 0) {
          linesSkipped.push(line);
        } else {
          linesToProcess.push(line);
        }
      });

      let processedMap = new Map();

      if (linesToProcess.length > 0) {
        try {
          const bulkResponse = await supabase.functions.invoke('autopro-WOBulkGetParts', {
            body: {
              items: linesToProcess.map(line => ({
                id: line.id,
                inventory_item_id: line.inventory_item_id,
                qty: parseFloat(line.qty),
                part_number: line.part_number,
                description: line.description,
                qty_on_order: parseFloat(line.qty_on_order) || 0
              })),
              workOrderId: workOrder.id,
              roNumber: workOrder.ro_number
            }
          });

          if (bulkResponse.data && bulkResponse.data.success && bulkResponse.data.items) {
            bulkResponse.data.items.forEach(processed => {
              if (processed.success && processed.id) {
                processedMap.set(processed.id, processed);
              }
            });
          } else {
            console.error('Failed to process bulk inventory via autopro-WOBulkGetParts:', bulkResponse.data);
          }
        } catch (error) {
          console.error('Error invoking autopro-WOBulkGetParts:', error);
        }
      }

      const updatedLinesArray = workingLineItems.map(currentLine => {
        const processedData = processedMap.get(currentLine.id);
        if (!processedData) return currentLine;
        return {
          ...currentLine,
          qty_on_order: processedData.qty_on_order,
          inventory_processed: true
        };
      });

      setLineItems(updatedLinesArray);

      const { lineItemsToSave, workOrderData, apiPayload } = prepareWorkOrderSavePayload({
        workOrder,
        updatedDetails,
        lineItems: updatedLinesArray,
        systemSettings,
        invoiceConversionPhase,
      });
      console.log('DEBUG: Final API payload for WorkOrder update:', apiPayload);

      if (mode === 'work_order' && !updatedDetails.hasOwnProperty('LockedByUser') && lockAcquiredRef.current) {
        apiPayload.locked_timestamp = (await manageWorkOrderLock({ ro_number: workOrder.ro_number, action: 'apply' }))?.data?.data?.locked_timestamp || workOrder.locked_timestamp;
        workOrderData.locked_timestamp = apiPayload.locked_timestamp;
      }

      if (useFunctionData) {
        const functionPayload = {
          ...apiPayload,
          should_keep_lock: saveOptions.should_keep_lock === true,
          ...(sessionId ? { session_id: sessionId } : {})
        };
        const { data: saveResult, error: saveError } = await supabase.functions.invoke('autopro-saveworkorderdata', {
          body: { ro_number: workOrder.ro_number, data: functionPayload }
        });
        if (saveError) {
          throw new Error(saveError.message || (typeof saveError === 'string' ? saveError : JSON.stringify(saveError)));
        }
      } else {
        try {
          const originalWorkOrderResponse = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'WorkOrder',
            match: { id: workOrder.id }
          });
          const originalWorkOrder = originalWorkOrderResponse.data?.data?.[0];
          if (originalWorkOrder) {
            const ignoreFields = ['updated_date', 'created_date', 'created_by', 'LockedByUser', 'locked_timestamp', 'last_updated', 'last_updated_by', 'id', 'line_items'];
            let isRealChange = false;
            for (const key in apiPayload) {
              if (ignoreFields.includes(key)) continue;
              if (JSON.stringify(apiPayload[key]) !== JSON.stringify(originalWorkOrder[key])) {
                isRealChange = true;
                break;
              }
            }
            if (!isRealChange && apiPayload.line_items && originalWorkOrder.line_items && apiPayload.line_items !== originalWorkOrder.line_items) isRealChange = true;
            if (isRealChange && currentUser) {
              apiPayload.last_updated = new Date().toISOString();
              apiPayload.last_updated_by = currentUser.email;
            }
          }
        } catch (auditError) {
          console.error('Error during audit trail check:', auditError);
        }
        await WorkOrder.update(workOrder.id, apiPayload);
      }

      setWorkOrder(prev => ({ ...prev, ...workOrderData, ...apiPayload, locked_timestamp: apiPayload.locked_timestamp }));

      const getLineFingerprint = (lines) => JSON.stringify(lines.map(l => ({
        id: l.id, d: l.description, q: l.qty, p: l.part_number, h: l.hrs, m: l.manually_inserted
      })));

      const latestFingerprint = getLineFingerprint(latestLineItemsRef.current || []);
      const savedFingerprint = getLineFingerprint(workingLineItems || []);

      if (latestFingerprint !== savedFingerprint) {
        console.log('User made changes during save - keeping unsaved changes flag active');
        setHasUnsavedChanges(true);
      } else {
        setHasUnsavedChanges(false);
      }

      previousLineItemsRef.current = [...updatedLinesArray];

      try {
        await base44.functions.invoke('syncLevies', {
          workOrderId: workOrder.id,
          lineItems: lineItemsToSave
        });
      } catch (levyError) {
        console.error('Failed to sync levies:', levyError);
      }

      if (showAlertOnSuccess) {
        alert('Work order saved successfully!');
        await refetchWorkOrder();
      }

      return { success: true, apiPayload, workOrderData, lineItemsToSave };
    } catch (error) {
      console.error('=== SAVE: Error saving work order:', error);
      if (!saveOptions.silentError) {
        alert('Failed to save work order. Please try again.');
      }
      if (saveOptions.throwOnError) {
        throw error;
      }
      return { success: false, error };
    } finally {
      setSaving(false);
    }
  }, [
    workOrder,
    lineItems,
    setLineItems,
    setWorkOrder,
    systemSettings,
    invoiceConversionPhase,
    refetchWorkOrder,
    pendingReturns,
    setPendingReturns,
    mode,
    currentUser,
    useFunctionData,
    previousLineItemsRef,
    latestLineItemsRef,
    lockAcquiredRef,
    setHasUnsavedChanges,
    setSaving,
    sessionId,
  ]);
}