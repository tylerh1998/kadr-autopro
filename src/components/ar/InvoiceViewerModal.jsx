import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function InvoiceViewerModal({ open, onClose, invoiceUrl }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>View Invoice</DialogTitle>
                </DialogHeader>
                <div className="flex-1 w-full h-full bg-slate-100 overflow-hidden">
                    {invoiceUrl ? (
                        <iframe 
                            src={invoiceUrl} 
                            className="w-full h-full border-0" 
                            title="Invoice PDF"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-500">
                            No invoice URL provided
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}