import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PartsInvoiceOCRModal({ open, onOpenChange, onSuccess }) {
    const [files, setFiles] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
            setError(null);
        }
    };

    const handleRemoveFile = (indexToRemove) => {
        setFiles(files.filter((_, index) => index !== indexToRemove));
    };

    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result.toString().split(',')[1];
                resolve(base64String);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const handleProcess = async () => {
        if (files.length === 0) return;

        setProcessing(true);
        setError(null);
        setProgress(`Processing 0 of ${files.length} invoices...`);
        const results = [];
        let hasError = false;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress(`Processing invoice ${i + 1} of ${files.length}: ${file.name}...`);
                
                const base64Data = await convertToBase64(file);

                const response = await supabase.functions.invoke('autopro-processPartsInvoiceOCR', {
                    body: {
                        pdfData: base64Data,
                        mimeType: file.type || 'application/pdf'
                    }
                });

                if (!response.data || !response.data.success) {
                    throw new Error(response.data?.error || `Failed to process ${file.name}`);
                }

                results.push({
                    fileName: file.name,
                    data: response.data.data
                });
            }

            setProgress("All invoices processed successfully!");
            setTimeout(() => {
                onSuccess(results);
                setFiles([]);
                setProcessing(false);
                setProgress(null);
                onOpenChange(false);
            }, 1000);

        } catch (err) {
            console.error("OCR Processing Error:", err);
            setError(err.message || "An error occurred during OCR processing.");
            setProcessing(false);
            setProgress(null);
        }
    };

    const handleCancel = () => {
        if (!processing) {
            setFiles([]);
            setError(null);
            setProgress(null);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            if (!isOpen && !processing) handleCancel();
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Upload Invoices (OCR)</DialogTitle>
                    <DialogDescription>
                        Upload one or more PDF invoices. The system will automatically extract supplier info, invoice numbers, dates, and line items.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {!processing && (
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="invoice-files">PDF Invoices</Label>
                            <Input 
                                id="invoice-files" 
                                type="file" 
                                accept="application/pdf,image/png,image/jpeg" 
                                multiple 
                                onChange={handleFileChange}
                                ref={fileInputRef}
                                className="cursor-pointer"
                            />
                        </div>
                    )}

                    {files.length > 0 && (
                        <div className="border rounded-md p-3 bg-slate-50 max-h-48 overflow-y-auto">
                            <Label className="text-xs text-slate-500 mb-2 block">Selected Files ({files.length})</Label>
                            <div className="space-y-2">
                                {files.map((file, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white p-2 border rounded text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                            <span className="truncate max-w-[200px]" title={file.name}>{file.name}</span>
                                        </div>
                                        {!processing && (
                                            <button 
                                                onClick={() => handleRemoveFile(i)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {processing && (
                        <div className="flex flex-col items-center justify-center py-6 space-y-4">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                            <p className="text-sm font-medium text-slate-700 text-center animate-pulse">
                                {progress || "Processing..."}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button type="button" variant="outline" onClick={handleCancel} disabled={processing}>
                        Cancel
                    </Button>
                    <Button 
                        type="button" 
                        onClick={handleProcess} 
                        disabled={files.length === 0 || processing}
                        className="bg-black hover:bg-gray-800"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4 mr-2" />
                                Process {files.length} Invoice{files.length !== 1 ? 's' : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
