import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PartsInvoiceOCRModal({ open, onOpenChange, onSuccess, supplierNames = [] }) {
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
                
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const storagePath = `temp/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('kadr-digital_invoice_uploads')
                    .upload(storagePath, file);

                if (uploadError) {
                    throw new Error(`Failed to upload ${file.name} to storage: ${uploadError.message}`);
                }

                // Use direct fetch to avoid potential cache/proxy issues
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                
                // Add a cache buster to the URL to bypass any stale 404s
                const url = `${supabaseUrl}/functions/v1/autopro-processPartsInvoiceOCR?t=${Date.now()}`;
                
                // Read the token from the cookie in case we need auth
                const match = document.cookie.match(/(?:^|;\s*)supabase_auth_token=([^;]+)/);
                let jwtToken = supabaseAnonKey;
                if (match) {
                    try {
                        let rawValue = match[1];
                        if (rawValue.startsWith('%7B')) rawValue = decodeURIComponent(rawValue);
                        const sessionData = JSON.parse(rawValue);
                        jwtToken = Array.isArray(sessionData) ? sessionData[0]?.access_token : sessionData?.access_token;
                    } catch(e) {}
                }

                const fetchResponse = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${jwtToken}`
                    },
                    body: JSON.stringify({
                        storagePath: storagePath,
                        mimeType: file.type || 'application/pdf',
                        supplierNames: supplierNames
                    })
                });

                if (!fetchResponse.ok) {
                    let errorMsg = `Server returned status ${fetchResponse.status}`;
                    try {
                        const errorData = await fetchResponse.json();
                        if (errorData.error) errorMsg += `: ${errorData.error}`;
                        if (errorData.details) errorMsg += ` - ${errorData.details}`;
                    } catch(e) {}
                    throw new Error(errorMsg);
                }

                const responseData = await fetchResponse.json();

                if (!responseData || !responseData.success) {
                    throw new Error(responseData?.error || `Failed to process ${file.name}`);
                }

                const invoices = responseData.data?.invoices || [];
                
                // If the old format was returned, fall back to it for safety
                if (invoices.length === 0 && responseData.data?.items) {
                    invoices.push(responseData.data);
                }

                invoices.forEach(inv => {
                    results.push({
                        fileName: file.name,
                        storagePath: storagePath,
                        data: inv
                    });
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
                        <div className="border rounded-md p-3 bg-slate-50 dark:bg-slate-900 dark:border-slate-800 max-h-48 overflow-y-auto">
                            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-2 block">Selected Files ({files.length})</Label>
                            <div className="space-y-2">
                                {files.map((file, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 border dark:border-slate-700 rounded text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                            <span className="truncate max-w-[200px]" title={file.name}>{file.name}</span>
                                        </div>
                                        {!processing && (
                                            <button 
                                                onClick={() => handleRemoveFile(i)}
                                                className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
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
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center animate-pulse">
                                {progress || "Processing..."}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm rounded-md">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button type="button" variant="outline" onClick={handleCancel} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                        Cancel
                    </Button>
                    <Button 
                        type="button" 
                        onClick={handleProcess} 
                        disabled={files.length === 0 || processing}
                        className="bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-slate-200"
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
