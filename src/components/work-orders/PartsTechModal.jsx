import React, { useState, useEffect } from "react";
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
        console.log("🚀 CHROME EXTENSION INTERCEPTED API CALL:", event.data.url, event.data.payload);
        
        // We will dump the payload into the UI so we can find exactly where the cart data is
        setPollError("Extension grabbed data! Check console to see the API payload.");
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

  const handleCompleteOrder = async () => {
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

          // Pass payload to parent component
          if (onTransferComplete) {
            onTransferComplete(cartRow.payload);
          }
          
          found = true;
          onClose(); // Close modal upon success
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
              onClick={handleCompleteOrder}
              disabled={isPolling}
            >
              {isPolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isPolling ? "Waiting for Parts..." : "Load Transferred Parts"}
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
    </Dialog>
  );
}
