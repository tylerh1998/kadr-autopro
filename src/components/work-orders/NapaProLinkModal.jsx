import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function NapaProLinkModal({ open, onClose }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!open) {
      setLogs([]);
      return;
    }

    const handleMessage = (event) => {
      // Log all messages received while modal is open
      console.log("🚀 NAPA PROLINK MESSAGE RECEIVED:", event);
      
      const newLog = {
        time: new Date().toLocaleTimeString(),
        origin: event.origin,
        data: typeof event.data === 'object' ? JSON.stringify(event.data, null, 2) : String(event.data)
      };

      setLogs(prev => [newLog, ...prev]);
    };

    window.addEventListener("message", handleMessage);
    
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [open]);

  // TekMetric spoofed ID
  // https://pro.napaprolink.ca/prolinkca/integrators or some variation
  // Often punchout URLs take query params like ?integratorId=TM577MT24J
  const napaUrl = "https://pro.napaprolink.ca/prolinkca/?integratorId=TM577MT24J";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col p-0 bg-background">
        <DialogHeader className="p-4 border-b shrink-0 flex flex-row items-center justify-between">
          <DialogTitle>NAPA PROLink (Experiment)</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => setLogs([])}>Clear Logs</Button>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Iframe taking up 70% width */}
          <div className="w-2/3 h-full border-r relative bg-gray-50">
             {!napaUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Loading NAPA PROLink...</p>
                </div>
             )}
             <iframe
                src={napaUrl}
                className="w-full h-full relative z-10 bg-white"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                title="NAPA PROLink"
             />
          </div>

          {/* Logs panel taking up 30% width */}
          <div className="w-1/3 h-full overflow-y-auto bg-slate-900 text-green-400 p-4 font-mono text-xs shadow-inner">
            <h3 className="text-white mb-4 font-bold border-b border-slate-700 pb-2">Event Inspector</h3>
            {logs.length === 0 ? (
              <div className="text-slate-500 italic text-center mt-10">Listening for window.postMessage events...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-4 bg-slate-800 p-2 rounded border border-slate-700 break-words">
                  <div className="text-slate-400 mb-1 flex justify-between">
                    <span>{log.time}</span>
                    <span className="text-blue-400">{log.origin}</span>
                  </div>
                  <pre className="whitespace-pre-wrap">{log.data}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
