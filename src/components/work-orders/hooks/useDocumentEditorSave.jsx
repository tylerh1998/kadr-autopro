import { useCallback } from 'react';
import { WorkOrder } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { saveworkorderdata } from '@/functions/saveworkorderdata';
import { manageWorkOrderLock } from '@/functions/manageWorkOrderLock';
import { processWorkOrderPartReturn } from '@/functions/processWorkOrderPartReturn';
import { processDeletedWorkOrderLineItem } from '@/functions/processDeletedWorkOrderLineItem';

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
}) {
  return useCallback(async (updatedDetails = {}, showAlertOnSuccess = true, lineItemsOverride = null) => {
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

            const response = await processDeletedWorkOrderLineItem({
              inventoryItemId: deletedLine.inventory_item_id,
              workOrderId: workOrder.id,
              roNumber: workOrder.ro_number,
              partNumber: deletedLine.part_number,
              totalQty,
              qtyOnOrder,
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
              const response = await processWorkOrderPartReturn({
                inventoryItemId: returnItem.inventory_item_id,
                workOrderId: workOrder.id,
                roNumber: workOrder.ro_number,
                partNumber: returnItem.part_number,
                description: returnItem.description,
                qtyToReturn: returnItem.qtyToReturn,
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

      const lineItemsAfterInventoryProcessing = await Promise.all(workingLineItems.map(async (line) => {
        if (mode === 'estimate') return line;
        if (line.inventory_processed || !line.inventory_item_id || parseFloat(line.qty) <= 0) return line;

        try {
          const adjustmentResponse = await base44.functions.invoke('WOGetPart', {
            inventoryItemId: line.inventory_item_id,
            requestedQuantity: parseFloat(line.qty),
            workOrderId: workOrder.id,
            roNumber: workOrder.ro_number,
            lineDescription: line.description,
            linePartNumber: line.part_number,
            lineQtyOnOrder: parseFloat(line.qty_on_order) || 0
          });

          if (adjustmentResponse.data.success) {
            const { onOrderQuantity } = adjustmentResponse.data;
            return {
              ...line,
              qty_on_order: onOrderQuantity,
              inventory_processed: true
            };
          }

          console.error('Failed to adjust inventory via WOGetPart for line:', line.part_number);
          return line;
        } catch (error) {
          console.error('Error invoking WOGetPart for line:', line.part_number, error);
          return line;
        }
      }));

      setLineItems(currentLines => {
        const processedMap = new Map(lineItemsAfterInventoryProcessing.map(l => [l.id, l]));
        return currentLines.map(currentLine => {
          const processedLine = processedMap.get(currentLine.id);
          if (!processedLine) return currentLine;
          return {
            ...currentLine,
            qty_on_order: processedLine.qty_on_order,
            inventory_processed: processedLine.inventory_processed,
            supplier_invoice_line_id: processedLine.supplier_invoice_line_id,
          };
        });
      });

      const currentLineItemsState = lineItemsAfterInventoryProcessing;
      const lineItemsToCalculate = currentLineItemsState.filter(item =>
        item && (
          item.description ||
          item.part_number ||
          item.inventory_item_id ||
          item.is_other_charge ||
          item.manually_inserted ||
          (parseFloat(item.qty) || 0) !== 0 ||
          (parseFloat(item.hrs) || 0) !== 0 ||
          (parseFloat(item.labour) || 0) !== 0 ||
          (parseFloat(item.parts_ea) || 0) !== 0 ||
          (parseFloat(item.total) || 0) !== 0
        )
      );

      const calculatedLineItems = lineItemsToCalculate.map(item => {
        const qty = parseFloat(item.qty) || 0;
        const partsEa = parseFloat(item.parts_ea) || 0;
        const labour = parseFloat(item.labour) || 0;
        const coreNum = parseFloat(item.Core_num) || 0;
        const coreRet = parseFloat(item.core_ret) || 0;
        const coreCost = parseFloat(item.core_cost) || 0;
        const ocTotal = parseFloat(item.oc_total) || 0;
        const core_osamt = (coreNum - coreRet) * coreCost;
        const tot_parts = (qty * partsEa) + core_osamt;
        const total = tot_parts + labour + ocTotal;
        return { ...item, core_osamt, tot_parts, total };
      });

      const itemsForAggregation = calculatedLineItems;
      const partsSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.tot_parts) || 0), 0);
      const laborSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.labour) || 0), 0);
      const otherChargesSubtotal = itemsForAggregation.reduce((sum, line) => sum + (parseFloat(line.oc_total) || 0), 0);
      const shopSupplyRate = systemSettings?.shop_supply_rate || 0.07;
      const shopSupplyTotal = laborSubtotal * shopSupplyRate;
      const subtotal = partsSubtotal + laborSubtotal + otherChargesSubtotal + shopSupplyTotal;

      let totalTaxableBase = 0;
      let taxableLaborForShopSupply = 0;
      itemsForAggregation.forEach(item => {
        if (item.taxable !== false) {
          const lineParts = parseFloat(item.tot_parts) || 0;
          const lineLabour = parseFloat(item.labour) || 0;
          const lineOcTotal = parseFloat(item.oc_total) || 0;
          totalTaxableBase += (lineParts + lineLabour + lineOcTotal);
          taxableLaborForShopSupply += lineLabour;
        }
      });

      const taxableShopSupplies = taxableLaborForShopSupply * shopSupplyRate;
      totalTaxableBase += (systemSettings.default_taxable ? taxableShopSupplies : 0);
      const taxAmount = totalTaxableBase * (systemSettings.tax_rate || 0.05);
      const totalAmount = subtotal + taxAmount;

      const lineItemsToSave = calculatedLineItems.map(item => {
        const baseLineItem = {
          id: item.id,
          inventory_item_id: item.inventory_item_id || null,
          part_number: item.part_number || '',
          description: item.description || '',
          unit: item.unit || '',
          qty: item.qty || 0,
          qty_on_order: item.qty_on_order || 0,
          hrs: item.hrs || 0,
          parts_ea: item.parts_ea || 0,
          tot_parts: item.tot_parts,
          cost_ea: item.cost_ea || 0,
          labour: item.labour || 0,
          total: item.total,
          taxable: item.taxable !== false,
          complete: item.complete || false,
          bold: item.bold || false,
          inventory_processed: item.inventory_processed || false,
          Core_num: item.Core_num || 0,
          core_ret: item.core_ret || 0,
          core_cost: item.core_cost || 0,
          core_osamt: item.core_osamt,
          is_other_charge: item.is_other_charge || false,
          oc_total: item.oc_total || 0,
          gl_account: item.gl_account || '',
          serial_num: item.serial_num || '',
          other_charge_id: item.other_charge_id || null
        };
        if (item.supplier_invoice_line_id) {
          baseLineItem.supplier_invoice_line_id = item.supplier_invoice_line_id;
        }
        return baseLineItem;
      });

      const finalWorkOrderDetails = {
        parts_total: partsSubtotal,
        labor_total: laborSubtotal,
        shop_supply_total: shopSupplyTotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      };

      let workOrderData = {
        ...workOrder,
        ...updatedDetails,
        ...finalWorkOrderDetails,
        line_items: JSON.stringify(lineItemsToSave),
      };

      if (workOrder.stage === 'work_order' && !workOrder.converted && invoiceConversionPhase > 0 && invoiceConversionPhase < 4) {
        console.log('DEBUG: Clearing accounting_details for first-time invoice conversion.');
        workOrderData.accounting_details = null;
      }

      const apiPayload = (({ id, created_date, updated_date, created_by, created_at, updated_at, created_by_id, ...rest }) => rest)({ ...workOrderData });
      console.log('DEBUG: Final API payload for WorkOrder update:', apiPayload);

      if (invoiceConversionPhase > 0 && invoiceConversionPhase < 4 && !updatedDetails.forceConversion) {
        delete apiPayload.stage;
        delete apiPayload.converted;
        delete apiPayload.inv_number;
      }

      delete apiPayload.forceConversion;

      if (mode === 'work_order' && !updatedDetails.hasOwnProperty('LockedByUser') && lockAcquiredRef.current) {
        apiPayload.locked_timestamp = (await manageWorkOrderLock({ ro_number: workOrder.ro_number, action: 'apply' }))?.data?.data?.locked_timestamp || workOrder.locked_timestamp;
      }

      if (useFunctionData) {
        if (currentUser) {
          apiPayload.last_updated = new Date().toISOString();
          apiPayload.last_updated_by = currentUser.email;
        }
        await saveworkorderdata({ ro_number: workOrder.ro_number, data: apiPayload });
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

      previousLineItemsRef.current = [...lineItemsAfterInventoryProcessing];

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
    } catch (error) {
      console.error('=== SAVE: Error saving work order:', error);
      alert('Failed to save work order. Please try again.');
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
  ]);
}