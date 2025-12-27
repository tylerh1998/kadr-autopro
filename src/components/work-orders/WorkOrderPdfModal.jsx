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
                // Call backend function using SDK - expecting JSON response with Data URI
                const response = await base44.functions.invoke('generateWorkOrderPdf', {
                    workOrder,
                    customer,
                    vehicle,
                    lineItems
                });

                const { pdfDataUri } = response.data;
                
                if (!pdfDataUri) {
                    throw new Error("No PDF data received from server");
                }

                // Convert Data URI to Blob for better handling (and to avoid large string in memory if possible)
                // Data URI format: data:application/pdf;filename=generated.pdf;base64,.....
                const byteString = atob(pdfDataUri.split(',')[1]);
                const mimeString = pdfDataUri.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                
                createdUrl = URL.createObjectURL(blob);

                if (active) {
                    setBlobUrl(createdUrl);
                } else {
                    URL.revokeObjectURL(createdUrl);
                }

            } catch (err) {
                console.error("Error generating PDF:", err);
                if (active) setError(`Could not generate PDF: ${err.message || 'Unknown error'}`);
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