import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Printer, X, Download } from "lucide-react";
import { Button } from '@/components/ui/button';
import { base44 } from "@/api/base44Client";

export default function WorkOrderPdfModal({ open, onClose, workOrder, customer, vehicle, lineItems }) {
    const [blobUrl, setBlobUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open || !workOrder) {
            setBlobUrl(null);
            setError(null);
            return;
        }

        let active = true;
        let createdUrl = null;

        const generatePdf = async () => {
            setLoading(true);
            setError(null);
            try {
                // Call backend function
                const response = await base44.functions.invoke('generateWorkOrderPdf', {
                    workOrder,
                    customer,
                    vehicle,
                    lineItems
                });

                // The SDK invoke returns an Axios response-like object
                // But for binary responses, we might need to handle it differently depending on SDK version
                // base44.functions.invoke usually expects JSON response.
                // However, we are returning a PDF blob.
                // The current SDK might try to parse JSON. 
                // Let's rely on fetch directly if SDK doesn't support blob response easily,
                // OR use the raw response from SDK if available.
                
                // Workaround: SDK's invoke parses JSON by default. 
                // We'll use a direct fetch to the function URL for binary data.
                // But we need auth headers.
                
                // Let's try standard fetch since we need the blob
                const functionUrl = `https://app.base44.com/api/apps/${window.base44_app_id || '68b3caadfc9d9a1ea34d2018'}/functions/generateWorkOrderPdf`;
                
                // Get token - relying on implicit cookie or token if available.
                // Since we are in the app, cookies usually work for function calls.
                // Let's try simply fetching.
                
                // Note: base44.functions.invoke might not support blob return types easily.
                // Let's use the native fetch with credentials.
                
                // Better approach: SDK might allow us to get the URL or just use fetch with headers.
                // We'll try to use the SDK invoke and hope it handles non-JSON if content-type is pdf,
                // OR we use the raw fetch.
                
                // Actually, let's use the provided 'invoke' but we need to handle the blob.
                // If 'invoke' fails to parse JSON, it might throw.
                
                // Alternative: Use `base44.client` (axios instance) if available?
                
                // Let's use standard fetch for now, assuming standard auth cookies/headers are handled by browser
                // or we can't easily get the token.
                // Wait, `base44.functions.invoke` sends a POST with JSON body.
                
                // Let's use a workaround:
                // We will use standard fetch but we need to pass the body.
                
                const fetchResponse = await fetch('/api/functions/generateWorkOrderPdf', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        workOrder,
                        customer,
                        vehicle,
                        lineItems
                    })
                });

                if (!fetchResponse.ok) {
                    const errText = await fetchResponse.text();
                    throw new Error(errText || 'Failed to generate PDF');
                }

                const blob = await fetchResponse.blob();
                const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                createdUrl = URL.createObjectURL(pdfBlob);

                if (active) {
                    setBlobUrl(createdUrl);
                } else {
                    URL.revokeObjectURL(createdUrl);
                }

            } catch (err) {
                console.error("Error generating PDF:", err);
                // Fallback attempt: maybe the URL path is different
                if (active) setError(`Could not generate PDF: ${err.message}`);
            } finally {
                if (active) setLoading(false);
            }
        };

        generatePdf();

        return () => {
            active = false;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
            setBlobUrl(null);
        };
    }, [open, workOrder]); // Intentionally not including other objects to avoid deep dependency loops unless they change

    const handlePrint = () => {
        if (blobUrl) {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = blobUrl;
            document.body.appendChild(iframe);
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }
    };

    const handleDownload = () => {
        if (blobUrl) {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `WorkOrder_${workOrder?.wo_number || 'report'}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b flex flex-row items-center justify-between">
                    <DialogTitle>Work Order Report</DialogTitle>
                    <div className="flex gap-2 mr-8">
                        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!blobUrl}>
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!blobUrl}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                        </Button>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 w-full h-full bg-slate-100 overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                            <p className="text-slate-600 font-medium">Generating PDF Report...</p>
                        </div>
                    )}
                    
                    {!loading && error && (
                        <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2 p-4 text-center">
                            <AlertTriangle className="w-10 h-10" />
                            <p className="font-medium">Error Generating Report</p>
                            <p className="text-sm text-slate-600">{error}</p>
                            <Button onClick={onClose} variant="outline" className="mt-4">
                                Close
                            </Button>
                        </div>
                    )}

                    {!loading && !error && blobUrl && (
                        <iframe 
                            src={blobUrl} 
                            className="w-full h-full border-0" 
                            title="Work Order PDF"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}