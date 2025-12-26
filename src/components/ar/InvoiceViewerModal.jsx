import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertTriangle } from "lucide-react";

export default function InvoiceViewerModal({ open, onClose, invoiceUrl }) {
    const [blobUrl, setBlobUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open || !invoiceUrl) {
            setBlobUrl(null);
            setError(null);
            return;
        }

        let active = true;
        let createdUrl = null;

        const fetchPdf = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(invoiceUrl);
                if (!response.ok) throw new Error('Failed to load invoice');
                
                const blob = await response.blob();
                const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                createdUrl = URL.createObjectURL(pdfBlob);
                
                if (active) {
                    setBlobUrl(createdUrl);
                } else {
                    URL.revokeObjectURL(createdUrl);
                }
            } catch (err) {
                console.error("Error fetching invoice PDF:", err);
                if (active) setError("Could not load invoice. Please try downloading it instead.");
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchPdf();

        return () => {
            active = false;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
            setBlobUrl(null); // Clear state
        };
    }, [open, invoiceUrl]);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>View Invoice</DialogTitle>
                </DialogHeader>
                <div className="flex-1 w-full h-full bg-slate-100 overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        </div>
                    )}
                    
                    {!loading && error && (
                        <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2 p-4 text-center">
                            <AlertTriangle className="w-8 h-8" />
                            <p>{error}</p>
                            <a 
                                href={invoiceUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-blue-600 underline text-sm mt-2"
                            >
                                Download directly
                            </a>
                        </div>
                    )}

                    {!loading && !error && blobUrl && (
                        <iframe 
                            src={blobUrl} 
                            className="w-full h-full border-0" 
                            title="Invoice PDF"
                        />
                    )}

                    {!loading && !error && !blobUrl && !invoiceUrl && (
                         <div className="flex items-center justify-center h-full text-slate-500">
                            No invoice URL provided
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}