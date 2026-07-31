import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PartsTechModal({ open, onClose, roNumber, vehicleInfo, userInfo, onTransferComplete }) {
  const [sessionUrl, setSessionUrl] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState(null);
  const latestCartDataRef = useRef(null);
  const [showCartReview, setShowCartReview] = useState(false);
  const [reviewParts, setReviewParts] = useState([]);

  const rawRoNumber = roNumber ? String(roNumber).replace(/^(RO|WO-?)/i, '').trim() : '';

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
        let order = null;
        
        // PartsTech uses different GraphQL queries for active cart vs saved quotes
        if (payload?.data?.activeCart?.order) {
            order = payload.data.activeCart.order;
        } else if (payload?.data?.cart) {
            order = payload.data.cart;
        } else if (payload?.data?.quote) {
            order = payload.data.quote;
        } else if (payload?.data?.addItemsToCart?.cart?.order) {
            order = payload.data.addItemsToCart.cart.order;
        }

        if (order && order.items && order.items.length > 0) {
            console.log("🔥 WE HAVE THE CART DATA:", order);
            latestCartDataRef.current = order;
            setPollError(`✅ Extension captured ${order.items.length} parts in cart! Click 'Load Transferred Parts' to import.`);
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
      const { data, error } = await supabase.functions.invoke('autopro-partstech-session', {
        body: { 
          ro_number: roNumber, 
          vehicle: vehicleInfo,
          userInfo: userInfo
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // PartsTech session response usually has a `url` field
      const url = data?.data?.url; 
      if (!url) {
        console.error("Invalid session response:", data);
        throw new Error("Did not receive a valid session URL from PartsTech.");
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
        .then(() => alert(`Copied ${rawRoNumber} to clipboard!`))
        .catch(() => alert("Failed to copy to clipboard."));
    }
  };

  const handleViewWorkOrder = () => {
    if (rawRoNumber) {
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      // Use LankarWOView just like OpenROModal does
      window.open(`/LankarWOView?woid=${rawRoNumber}`, '_blank', windowFeatures);
    }
  };

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const handleViewCart = async () => {
    // If our extension grabbed the cart, use it instantly!
    if (latestCartDataRef.current) {
        const order = latestCartDataRef.current;
        const formattedParts = order.items.map((item, idx) => {
            // Attempt to extract pricing from builtItem
            let costPrice = 0;
            if (item.builtItem) {
                // PartsTech puts pricing in builtItem.price or similar
                costPrice = item.builtItem.costPrice || item.builtItem.cost || item.builtItem.wholesaleCost || 0;
                
                if (costPrice === 0 && item.builtItem.price) {
                   costPrice = item.builtItem.price.cost || item.builtItem.price.wholesale || item.builtItem.price.value || 0;
                }
            }

            return {
                id: idx,
                partNumber: item.partNumber || '',
                description: item.partName || item.description || '',
                quantity: item.quantity || 1,
                costPrice: costPrice,
                selected: true
            };
        });

        setReviewParts(formattedParts);
        setShowCartReview(true);
        return;
    }

    // Fallback to database polling if no extension data
    setIsPolling(true);
    setPollError(null);
    let found = false;

    try {
      // Poll up to 5 times, waiting 1 second between each
      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase
          .from('PartsTechCart')
          .select('*')
          .eq('wo_id', roNumber)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
          const cartRow = data[0];
          
          // Mark as processed
          await supabase
            .from('PartsTechCart')
            .update({ status: 'processed' })
            .eq('id', cartRow.id);

          // We grabbed it from DB, so we map it and show the review cart too!
          const dbParts = cartRow.payload?.parts || [];
          const formattedDbParts = dbParts.map((p, idx) => ({
             id: idx,
             partNumber: p.part_number || p.partNumber || '',
             description: p.description || p.partName || '',
             quantity: p.qty || p.quantity || 1,
             costPrice: p.parts_ea || p.costPrice || 0,
             selected: true
          }));
          
          setReviewParts(formattedDbParts);
          setShowCartReview(true);
          
          found = true;
          break;
        }

        // Wait before next poll
        await delay(1000);
      }

      if (!found) {
        setPollError("We haven't received the cart data yet. If you just clicked Transfer, please wait a few seconds and try again.");
      }
    } catch (err) {
      console.error("Polling error:", err);
      setPollError("An error occurred while checking for the transferred parts.");
    } finally {
      if (!found) {
        setIsPolling(false);
      }
    }
  };

  const handleConfirmTransfer = async () => {
    const selectedParts = reviewParts.filter(p => p.selected);
    
    try {
        // Create the historical row in PartsTechCart
        await supabase.from('PartsTechCart').insert({
            wo_id: String(rawRoNumber || roNumber),
            payload: { parts: selectedParts },
            status: 'processed'
        });
    } catch (e) {
        console.error("Failed to create historical cart row", e);
    }

    if (onTransferComplete) {
        // handlePartsTechSuccess expects 'parts' array
        onTransferComplete({ parts: selectedParts });
    }
    
    setShowCartReview(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && !isPolling) onClose();
    }}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-4 gap-4">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b shrink-0">
          <DialogTitle className="text-xl">Online Order (PartsTech)</DialogTitle>
          
          <div className="flex items-center gap-3 pr-8">
            <Button variant="outline" size="sm" onClick={handleCopyToPO} title="Copy Work Order number for PO">
              <Copy className="w-4 h-4 mr-2" />
              Copy to PO#
            </Button>
            <Button variant="outline" size="sm" onClick={handleViewWorkOrder}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Work Order
            </Button>
            <Button 
              variant="default" 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={handleViewCart}
              disabled={isPolling}
            >
              {isPolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isPolling ? "Waiting for Parts..." : "View Cart"}
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Review Parts to Transfer</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto border rounded-md my-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 shadow-sm z-10">
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
                  <th className="p-3 font-semibold text-right">Qty</th>
                  <th className="p-3 font-semibold text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reviewParts.map(part => (
                  <tr key={part.id} className={part.selected ? "bg-white" : "bg-slate-50 opacity-50"}>
                    <td className="p-3 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300"
                        checked={part.selected}
                        onChange={(e) => {
                          setReviewParts(reviewParts.map(p => p.id === part.id ? { ...p, selected: e.target.checked } : p));
                        }}
                      />
                    </td>
                    <td className="p-3 font-mono">{part.partNumber}</td>
                    <td className="p-3 truncate max-w-[300px]">{part.description}</td>
                    <td className="p-3 text-right">{part.quantity}</td>
                    <td className="p-3 text-right">${Number(part.costPrice || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {reviewParts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No parts found in the cart.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={() => setShowCartReview(false)}>Cancel</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleConfirmTransfer}
              disabled={reviewParts.filter(p => p.selected).length === 0}
            >
              Add {reviewParts.filter(p => p.selected).length} Parts to Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
