import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, CheckCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PartsTechModal({ open, onClose, roNumber, vehicleInfo, userInfo, onTransferComplete, cartId }) {
  const [sessionUrl, setSessionUrl] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState(null);
  const latestCartDataRef = useRef(null);
  const [showCartReview, setShowCartReview] = useState(false);
  const [reviewParts, setReviewParts] = useState([]);
  const [isCopied, setIsCopied] = useState(false);
  
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

    // Listen for iframe postMessage events!
    const handleMessage = (event) => {
      // Listen for messages from our custom Chrome Extension
      if (event.data && event.data.type === 'PARTSTECH_EXT_DATA') {
        const payload = event.data.payload;
        
        // Recursively search the payload for any object that looks like a PartsTech order/cart
        // (Must be an object with an 'items' array and an 'id')
        const findOrderWithItems = (obj, depth = 0) => {
            if (depth > 10 || !obj || typeof obj !== 'object') return null;
            if (Array.isArray(obj.items) && obj.id) return obj;
            
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const found = findOrderWithItems(obj[key], depth + 1);
                    if (found) return found;
                }
            }
            return null;
        };

        const order = findOrderWithItems(payload);

        if (order && order.items && order.items.length > 0) {
            console.log("🔥 WE HAVE THE CART DATA:", order);
            latestCartDataRef.current = order;
            setPollError(`✅ Extension captured ${order.items.length} parts in cart! Click 'View Cart' to import.`);
        }
        return;
      }

      // Allow specific origins or all for debugging standard PartsTech messages
      if (event.origin.includes('partstech.com')) {
        // Ignore rrweb session recording messages which fire constantly
        if (event.data && event.data.type === 'rrweb') {
          return;
        }

        console.log("PARTS TECH POST MESSAGE RECEIVED:", event.data);
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [open, roNumber]);

  const loadSession = async () => {
    setLoadingSession(true);
    setSessionError(null);
    try {
      // Direct URL approach - bypassing the punchout API since the extension intercepts carts
      let url = 'https://app.partstech.com/';
      
      if (cartId) {
        url = `https://app.partstech.com/saved-quotes/carts/${cartId}`;
      } else {
        const params = new URLSearchParams();
        if (vehicleInfo?.vin) params.append("vin", vehicleInfo.vin);
        
        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }
      }

      setSessionUrl(url);
    } catch (err) {
      console.error("Error loading PartsTech session:", err);
      setSessionError(err.message || "Failed to initialize PartsTech session.");
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
    if (rawRoNumber) {
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      window.open(`/WorkOrderView?id=${rawRoNumber}`, '_blank', windowFeatures);
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
    if (latestCartDataRef.current) {
        const order = latestCartDataRef.current;
        
        // Auto-match supplier based on PartsTech account name
        const accountName = order?.account?.name || '';
        let matchedSupplierId = "";
        
        // Default to Midway Distributors Limited (or find it in the list)
        const midway = suppliers.find(s => s.name.toLowerCase().includes("midway distributors limited"));
        
        if (accountName && suppliers.length > 0) {
            const match = suppliers.find(s => s.name.toLowerCase().includes(accountName.toLowerCase()) || accountName.toLowerCase().includes(s.name.toLowerCase()));
            if (match) matchedSupplierId = match.id;
            else if (midway) matchedSupplierId = midway.id;
        } else if (midway) {
            matchedSupplierId = midway.id;
        }
        setGlobalSupplierId(matchedSupplierId);

        const defaultSc = salesClasses.find(sc => sc.name === 'Regular') || salesClasses[0];
        
        const formattedParts = order.items.map((rawItem, idx) => {
            // Support flat item or item wrapped in a node
            const item = rawItem.node || rawItem;
            // Sometimes parts details are nested under item.part
            const partInfo = item.part || item;
            
            let costPrice = item.costPrice || item.cost || item.price || 0;
            if (item.builtItem) {
                costPrice = item.builtItem.product?.price || item.builtItem.costPrice || item.builtItem.cost || item.builtItem.wholesaleCost || costPrice;
                if (!costPrice && item.builtItem.price) {
                   costPrice = typeof item.builtItem.price === 'object'
                     ? (item.builtItem.price.cost || item.builtItem.price.wholesale || item.builtItem.price.value || costPrice)
                     : item.builtItem.price;
                }
            }
            if (!costPrice && item.product?.price) {
                costPrice = item.product.price;
            }
            // Ensure costPrice is a number, handling string currencies like "$15.99"
            if (typeof costPrice === 'string') {
                costPrice = parseFloat(costPrice.replace(/[^0-9.]/g, ''));
            }
            costPrice = Number(costPrice) || 0;

            return {
                id: idx,
                partNumber: partInfo.partNumber || partInfo.part_number || '',
                description: partInfo.partName || partInfo.description || partInfo.name || '',
                quantity: item.quantity || item.qty || 1,
                costPrice: costPrice,
                salesClassId: defaultSc?.id || "",
                selected: true
            };
        });
        setReviewParts(formattedParts);
        setShowCartReview(true);
        return;
    }
    
    // DB polling fallback
    setIsPolling(true);
    setPollError(null);
    let found = false;
    try {
      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase.from('PartsTechCart').select('*').eq('wo_id', roNumber).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          const cartRow = data[0];
          await supabase.from('PartsTechCart').update({ status: 'processed' }).eq('id', cartRow.id);
          const dbParts = cartRow.payload?.parts || [];
          
          const defaultSc = salesClasses.find(sc => sc.name === 'Regular') || salesClasses[0];
          const formattedDbParts = dbParts.map((p, idx) => ({
             id: idx,
             partNumber: p.part_number || p.partNumber || '',
             description: p.description || p.partName || '',
             quantity: p.qty || p.quantity || 1,
             costPrice: p.parts_ea || p.costPrice || 0,
             salesClassId: defaultSc?.id || "",
             selected: true
          }));
          setReviewParts(formattedDbParts);
          setShowCartReview(true);
          found = true;
          break;
        }
        await delay(1000);
      }
      if (!found) setPollError("We haven't received the cart data yet. Please wait a few seconds and try again.");
    } catch (err) {
      setPollError("An error occurred while checking for the transferred parts.");
    } finally {
      if (!found) setIsPolling(false);
    }
  };

  const handleTransfer = async (actionType) => {
    // actionType = 'ordered' | 'quoted'
    const selectedParts = reviewParts.filter(p => p.selected);
    const cartIdStr = latestCartDataRef.current?.id || cartId || "unknown";
    const supplierName = suppliers.find(s => s.id === globalSupplierId)?.name || 'PartsTech';
    
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
                    p_source_action: 'PartsTechTransfer',
                    p_tx_type: 'Ordered',
                    p_description: `Ordered from PartsTech for WO ${rawRoNumber}`
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
                    source_function: 'PartsTechTransfer',
                    tx_type: actionType === 'ordered' ? 'Ordered' : 'Quoted',
                    quantity_change: 0,
                    quantity_ordered_change: finalQOO,
                    notes: `Added from PartsTech cart transfer`
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
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b shrink-0">
          <DialogTitle className="text-xl">Online Order (PartsTech)</DialogTitle>
          
          <div className="flex items-center gap-3">
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
              disabled={isPolling}
            >
              {isPolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isPolling ? "Waiting for Parts..." : "Transfer Cart"}
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
              <p>Connecting to PartsTech...</p>
            </div>
          )}
          
          {sessionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-10">
              <p className="text-red-600 font-medium mb-4">{sessionError}</p>
              <Button onClick={loadSession} variant="outline">Retry</Button>
            </div>
          )}

          {sessionUrl && !sessionError && (
            <iframe 
              src={sessionUrl} 
              className="w-full h-full border-0"
              title="PartsTech Catalog"
              allow="clipboard-write"
            />
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
