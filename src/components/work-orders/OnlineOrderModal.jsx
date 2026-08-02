import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, CheckCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function OnlineOrderModal({ open, onClose, roNumber, vehicleInfo, userInfo, onTransferComplete, cartId, supplierUrl }) {
  const [sessionUrl, setSessionUrl] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const latestCartDataRef = useRef(null);
  const [showCartReview, setShowCartReview] = useState(false);
  const [reviewParts, setReviewParts] = useState([]);
  const [isCopied, setIsCopied] = useState(false);
  
  // Check if running in an Electron/desktop wrapper
  // Many electron wrappers inject specific navigator or window properties.
  // For now, we'll assume there's a window.__IS_DESKTOP__ flag or similar,
  // or we can just use a placeholder that the desktop app will set.
  const isDesktopApp = typeof window !== 'undefined' && (
      window.isElectron || 
      window.electron || 
      navigator.userAgent.toLowerCase().includes('electron') ||
      navigator.userAgent.toLowerCase().includes('tauri') ||
      window.__IS_DESKTOP__
  );
  
  // New state for dropdowns
  const [salesClasses, setSalesClasses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [globalSupplierId, setGlobalSupplierId] = useState("");

  const rawRoNumber = roNumber ? String(roNumber).replace(/^(RO|WO-?)/i, '').trim() : '';

  useEffect(() => {
    if (open) {
      // Fetch SalesClasses and Suppliers
      const fetchDropdownData = async () => {
        const [scRes, supRes] = await Promise.all([
          supabase.from('SalesClass').select('*').order('name'),
          supabase.from('Supplier').select('id, name').order('name')
        ]);
        setSalesClasses(scRes.data || []);
        setSuppliers(supRes.data || []);
      };
      fetchDropdownData();
    }
  }, [open]);

  useEffect(() => {
    if (open && roNumber) {
      loadSession();
    } else {
      // Reset state on close
      setSessionUrl(null);
      setSessionError(null);
      setPollError(null);
      setIsPolling(false);
    }
  }, [open, roNumber]);

  const loadSession = async () => {
    setLoadingSession(true);
    setSessionError(null);
    try {
      // Supplier URL or fallback
      let url = supplierUrl || 'https://prolink.napacanada.com/';
      
      setSessionUrl(url);
    } catch (err) {
      console.error("Error loading session:", err);
      setSessionError(err.message || "Failed to initialize session.");
    } finally {
      setLoadingSession(false);
    }
  };

  const handleCopyToPO = () => {
    if (rawRoNumber) {
      navigator.clipboard.writeText(rawRoNumber)
        .then(() => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        })
        .catch(console.error);
    }
  };

  const handleViewWorkOrder = () => {
    if (roNumber) {
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      window.open(`/WorkOrderView?id=${roNumber}`, '_blank', windowFeatures);
    }
  };

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const calculateListPrice = (cost, salesClassId) => {
      if (!cost || !salesClassId || !salesClasses) return cost;
      const selectedSalesClass = salesClasses.find(sc => sc.id === salesClassId);
      if (!selectedSalesClass || !selectedSalesClass.pricing_matrix) return cost;
      try {
        let parsedData = selectedSalesClass.pricing_matrix;
        if (typeof parsedData === 'string') parsedData = JSON.parse(parsedData);
        if (!Array.isArray(parsedData)) return cost;
        const costValue = parseFloat(cost);
        const matchingRange = parsedData.find(range => costValue >= parseFloat(range.min_cost) && costValue <= parseFloat(range.max_cost));
        if (matchingRange) {
          const margin = parseFloat(matchingRange.margin);
          return (costValue / (1 - (margin / 100))).toFixed(2);
        }
      } catch (e) { console.error('Error calculating list price:', e); }
      return cost;
  };

  const handleViewCart = async () => {
    setPollError(null);
    const webview = document.getElementById('supplier-webview');
    if (!webview) {
        setPollError("Supplier window is not loaded.");
        return;
    }

    setIsExtracting(true);
    
    try {
        // Use Electron's webview executeJavaScript to bypass all CORS/Site Isolation issues
        const rawText = await webview.executeJavaScript('document.body.innerText');
        
        if (!rawText || rawText.trim().length === 0) {
            setPollError("Could not extract text from the page.");
            setIsExtracting(false);
            return;
        }

        console.log("🔥 EXTRACTED RAW TEXT DIRECTLY, CALLING LLM");
        
        const { data, error } = await supabase.functions.invoke('autopro-extractCartTextLLM', {
            body: { rawText }
        });

        if (error) {
            console.error("LLM Extraction error:", error);
            setPollError("AI Extraction failed: " + error.message);
            setIsExtracting(false);
            return;
        }
        if (data?.error) {
            setPollError("AI Extraction failed: " + data.error);
            setIsExtracting(false);
            return;
        }

        const extractedParts = data?.data || [];
        if (extractedParts.length === 0) {
            setPollError("No parts were found in the cart text.");
            setIsExtracting(false);
            return;
        }

        // Default as requested by user
        let matchedSupplierId = "69488ed2c61378ea58ffc215"; // NAPA
        setGlobalSupplierId(matchedSupplierId);

        const defaultSc = salesClasses.find(sc => sc.name === 'Regular') || salesClasses[0];

        const formattedParts = extractedParts.map((item, idx) => {
            let costPrice = Number(item.unitCost) || 0;
            
            return {
                id: idx,
                partNumber: item.partNumber || 'Unknown',
                description: item.description || 'Unknown Part',
                quantity: Number(item.quantity) || 1,
                costPrice: costPrice,
                salesClassId: defaultSc?.id || "",
                selected: true
            };
        });

        setReviewParts(formattedParts);
        setShowCartReview(true);
    } catch (err) {
        console.error("Extraction error:", err);
        setPollError("Failed to extract cart text. Please make sure the cart is open on the page.");
    } finally {
        setIsExtracting(false);
    }
  };

  const handleTransfer = async (actionType) => {
    // actionType = 'ordered' | 'quoted'
    const selectedParts = reviewParts.filter(p => p.selected);
    const cartIdStr = latestCartDataRef.current?.id || cartId || "unknown";
    const supplierName = suppliers.find(s => s.id === globalSupplierId)?.name || 'Supplier';
    
    const processedParts = await Promise.all(selectedParts.map(async (part) => {
        const listPrice = calculateListPrice(part.costPrice, part.salesClassId);
        let inventoryId = null;
        let finalQOO = actionType === 'ordered' ? part.quantity : 0;
        
        // 1. Check if item exists in InventoryItem
        const { data: existing } = await supabase
            .from('InventoryItem')
            .select('*')
            .eq('part_number', part.partNumber)
            .eq('supplier_id', globalSupplierId)
            .limit(1);
            
        if (existing && existing.length > 0) {
            const existingItem = existing[0];
            inventoryId = existingItem.id;
            
            // Only update QOO if ordered
            if (actionType === 'ordered') {
                const currentQOO = existingItem.quantity_on_order || 0;
                await supabase.rpc('update_inventory_with_audit', {
                    p_item_id: existingItem.id,
                    p_qoh: existingItem.quantity_on_hand || 0,
                    p_qoo: currentQOO + part.quantity,
                    p_ro_number: rawRoNumber,
                    p_supplier_inv: null,
                    p_source_action: 'OnlineOrderTransfer',
                    p_tx_type: 'Ordered',
                    p_description: `Ordered online for WO ${rawRoNumber}`
                });
            }
        } else {
            // Create new inventory item
            const parsedCost = parseFloat(part.costPrice) || 0;
            const parsedList = parseFloat(listPrice) || 0;
            const newItemData = {
                part_number: part.partNumber,
                description: part.description,
                cost: parsedCost,
                list: parsedList,
                quantity_on_hand: 0,
                quantity_on_order: finalQOO,
                supplier_id: globalSupplierId || null,
                sales_class: part.salesClassId || null,
                is_active: true
            };
            const { data: createData, error: createError } = await supabase.from('InventoryItem').insert([newItemData]).select();
            if (createError) {
                console.error("Failed to insert InventoryItem:", createError);
            }
            if (createData && createData[0]) {
                inventoryId = createData[0].id;
                await supabase.from('InventoryAuditLog').insert([{
                    inventory_item_id: inventoryId,
                    part_num: part.partNumber,
                    old_quantity: 0,
                    new_quantity: 0,
                    old_quantity_on_order: 0,
                    new_quantity_on_order: finalQOO,
                    supplier_name: supplierName,
                    source_record_id: rawRoNumber,
                    source_function: 'OnlineOrderTransfer',
                    tx_type: actionType === 'ordered' ? 'Ordered' : 'Quoted',
                    quantity_change: 0,
                    quantity_ordered_change: finalQOO,
                    notes: `Added from online cart transfer`
                }]);
            }
        }
        
        return {
            part_number: part.partNumber,
            description: part.description,
            parts_ea: listPrice,
            cost_ea: part.costPrice,
            qty: part.quantity,
            inventory_processed: true,
            not_ordered: actionType === 'quoted',
            partstech_cart_id: cartIdStr,
            inventory_item_id: inventoryId
        };
    }));

    // Historical cart row
    try {
        await supabase.from('PartsTechCart').insert({
            wo_id: String(rawRoNumber || roNumber),
            payload: { parts: processedParts },
            status: 'processed'
        });
    } catch (e) {
        console.error("Failed to create historical cart row", e);
    }

    if (onTransferComplete) {
        onTransferComplete({ parts: processedParts });
    }
    
    setShowCartReview(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && !isPolling) onClose();
    }}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-4 gap-4 [&>button.absolute]:hidden">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <div className="flex items-center space-x-4">
              <DialogTitle className="text-xl">
                {supplierUrl && supplierUrl.includes("napaprolink") ? "NAPA Prolink Order" : "Online Supplier Order"}
              </DialogTitle>
          </div>
          
          <div className="flex items-center gap-3">
            {vehicleInfo?.vin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                    navigator.clipboard.writeText(vehicleInfo.vin);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                }}
                className="flex items-center space-x-1 border-blue-200 hover:bg-blue-50 text-blue-700"
                title="Copy VIN"
              >
                  {isCopied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  <span>{isCopied ? 'VIN Copied!' : 'Copy VIN'}</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCopyToPO} title="Copy Work Order number for PO">
              {isCopied ? <CheckCircle className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
              Copy PO#
            </Button>
            <Button variant="outline" size="sm" onClick={handleViewWorkOrder}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Work Order View
            </Button>
            <Button 
              variant="default" 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={handleViewCart}
              disabled={isExtracting}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting AI Cart...
                </>
              ) : (
                'Transfer Cart'
              )}
            </Button>
            
            <Button 
              variant="destructive"
              size="icon"
              className="w-10 h-10 rounded-sm bg-red-600 hover:bg-red-700 text-white flex-shrink-0 ml-2"
              onClick={onClose}
              title="Close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 bg-slate-50 rounded-md overflow-hidden relative border">
          {loadingSession && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
              <p>Connecting to Supplier...</p>
            </div>
          )}
          
          {sessionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-10">
              <p className="text-red-600 font-medium mb-4">{sessionError}</p>
              <Button onClick={loadSession} variant="outline">Retry</Button>
            </div>
          )}

          {sessionUrl && !sessionError && (
            isDesktopApp ? (
              <webview 
                id="supplier-webview"
                src={sessionUrl} 
                className="w-full h-full border-0"
                title="Supplier Catalog"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-10 border border-amber-200">
                <div className="bg-amber-50 p-6 rounded-lg max-w-lg shadow-sm border border-amber-100">
                  <h3 className="text-xl font-bold text-amber-800 mb-3">Desktop App Required</h3>
                  <p className="text-slate-700 mb-4">
                    Online ordering with this supplier requires the AutoPro Desktop App to properly handle secure authentication and cart transfers.
                  </p>
                  <p className="text-slate-600 text-sm">
                    You are currently using a standard web browser. Please open the AutoPro Desktop application to use this feature.
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        {pollError && (
          <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-md shrink-0">
            {pollError}
          </div>
        )}
      </DialogContent>

      <Dialog open={showCartReview} onOpenChange={setShowCartReview}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-6 dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Review Parts to Transfer</DialogTitle>
          </DialogHeader>
          
          <div className="flex items-center gap-3 mt-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-md border dark:border-slate-700">
            <span className="font-medium text-sm text-slate-700 dark:text-slate-300">Supplier (Applies to all parts):</span>
            <select 
              className="flex-1 max-w-sm p-1.5 text-sm border rounded-md dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200"
              value={globalSupplierId}
              onChange={(e) => setGlobalSupplierId(e.target.value)}
            >
              <option value="">-- Select Supplier --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-auto border dark:border-slate-700 rounded-md my-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300"
                      checked={reviewParts.length > 0 && reviewParts.every(p => p.selected)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setReviewParts(reviewParts.map(p => ({ ...p, selected: checked })));
                      }}
                    />
                  </th>
                  <th className="p-3 font-semibold">Part Number</th>
                  <th className="p-3 font-semibold">Description</th>
                  <th className="p-3 font-semibold">Sales Class</th>
                  <th className="p-3 font-semibold text-right">Cost</th>
                  <th className="p-3 font-semibold text-right">List Price</th>
                  <th className="p-3 font-semibold text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900">
                {reviewParts.map((part) => (
                  <tr key={part.id} className={!part.selected ? "opacity-50 bg-slate-50 dark:bg-slate-950" : ""}>
                    <td className="p-3 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900"
                        checked={part.selected}
                        onChange={(e) => {
                          setReviewParts(prev => prev.map(p => 
                            p.id === part.id ? { ...p, selected: e.target.checked } : p
                          ));
                        }}
                      />
                    </td>
                    <td className="p-3 font-mono">{part.partNumber}</td>
                    <td className="p-3 truncate max-w-[200px]">{part.description}</td>
                    <td className="p-3">
                      <select 
                        className="p-1 text-sm border rounded w-full max-w-[140px] dark:bg-slate-950 dark:border-slate-700"
                        value={part.salesClassId}
                        onChange={(e) => {
                          setReviewParts(reviewParts.map(p => p.id === part.id ? { ...p, salesClassId: e.target.value } : p));
                        }}
                      >
                        <option value="">-- None --</option>
                        {salesClasses.map(sc => (
                          <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-right">${Number(part.costPrice || 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-medium text-green-700 dark:text-green-400">${Number(calculateListPrice(part.costPrice, part.salesClassId) || 0).toFixed(2)}</td>
                    <td className="p-3 text-right font-bold">{part.quantity}</td>
                  </tr>
                ))}
                {reviewParts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No parts found in the cart.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-between items-center shrink-0">
            <span className="text-sm text-slate-500">{reviewParts.filter(p => p.selected).length} parts selected</span>
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t dark:border-slate-700">
              <Button variant="outline" onClick={() => setShowCartReview(false)} className="dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700">Cancel</Button>
              <Button 
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600"
                onClick={() => handleTransfer('quoted')}
                disabled={reviewParts.filter(p => p.selected).length === 0 || !globalSupplierId}
                title={!globalSupplierId ? "Please select a Supplier first" : ""}
              >
                Mark as Quoted
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleTransfer('ordered')}
                disabled={reviewParts.filter(p => p.selected).length === 0 || !globalSupplierId}
                title={!globalSupplierId ? "Please select a Supplier first" : ""}
              >
                Mark On Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
