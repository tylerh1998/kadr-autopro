const getMeaningfulLineItems = (lineItems = []) => {
  return lineItems.filter(item =>
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
};

const calculateLineItems = (lineItems = []) => {
  return getMeaningfulLineItems(lineItems).map(item => {
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
};

export const prepareWorkOrderSavePayload = ({
  workOrder,
  updatedDetails = {},
  lineItems = [],
  systemSettings,
  invoiceConversionPhase = 0,
}) => {
  const calculatedLineItems = calculateLineItems(lineItems);
  const shopSupplyRate = systemSettings?.shop_supply_rate || 0.07;
  const taxRate = systemSettings?.tax_rate || 0.05;
  const defaultTaxable = systemSettings?.default_taxable !== undefined ? systemSettings.default_taxable : true;

  const partsSubtotal = calculatedLineItems.reduce((sum, line) => sum + (parseFloat(line.tot_parts) || 0), 0);
  const laborSubtotal = calculatedLineItems.reduce((sum, line) => sum + (parseFloat(line.labour) || 0), 0);
  const otherChargesSubtotal = calculatedLineItems.reduce((sum, line) => sum + (parseFloat(line.oc_total) || 0), 0);
  const shopSupplyTotal = laborSubtotal * shopSupplyRate;
  const subtotal = partsSubtotal + laborSubtotal + otherChargesSubtotal + shopSupplyTotal;

  let totalTaxableBase = 0;
  let taxableLaborForShopSupply = 0;

  calculatedLineItems.forEach(item => {
    if (item.taxable !== false) {
      totalTaxableBase += (parseFloat(item.tot_parts) || 0) + (parseFloat(item.labour) || 0) + (parseFloat(item.oc_total) || 0);
      taxableLaborForShopSupply += parseFloat(item.labour) || 0;
    }
  });

  const taxableShopSupplies = taxableLaborForShopSupply * shopSupplyRate;
  totalTaxableBase += defaultTaxable ? taxableShopSupplies : 0;
  const taxAmount = totalTaxableBase * taxRate;
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
      qty_quoted: item.qty_quoted || 0,
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
      not_ordered: item.not_ordered || false,
      partstech_cart_id: item.partstech_cart_id || null,
      Core_num: item.Core_num || 0,
      core_ret: item.core_ret || 0,
      core_cost: item.core_cost || 0,
      core_osamt: item.core_osamt,
      is_other_charge: item.is_other_charge || false,
      oc_total: item.oc_total || 0,
      gl_account: item.gl_account || '',
      serial_num: item.serial_num || '',
      other_charge_id: item.other_charge_id || null,
      inventoryreturn_id: item.inventoryreturn_id || null
    };

    if (item.supplier_invoice_line_id) {
      baseLineItem.supplier_invoice_line_id = item.supplier_invoice_line_id;
    }

    return baseLineItem;
  });

  const workOrderData = {
    ...workOrder,
    ...updatedDetails,
    parts_total: partsSubtotal,
    labor_total: laborSubtotal,
    shop_supply_total: shopSupplyTotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    line_items: lineItemsToSave,
  };

  if (workOrder?.stage === 'work_order' && !workOrder?.converted && invoiceConversionPhase > 0 && invoiceConversionPhase < 4) {
    workOrderData.accounting_details = null;
  }

  const { id, created_date, updated_date, created_by, created_at, updated_at, created_by_id, ...apiPayload } = workOrderData;

  if (invoiceConversionPhase > 0 && invoiceConversionPhase < 4 && !updatedDetails.forceConversion) {
    delete apiPayload.stage;
    delete apiPayload.converted;
    delete apiPayload.inv_number;
  }

  delete apiPayload.forceConversion;

  return {
    calculatedLineItems,
    lineItemsToSave,
    workOrderData,
    apiPayload,
  };
};