import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function EmployeeFileModal({ employeeId, isOpen, onClose, onUploadSuccess }) {
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState("");
    const [documentDate, setDocumentDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }));
    const [notes, setNotes] = useState("");
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setFileName(selectedFile.name);
        }
    };

    const handleUpload = async () => {
        if (!file || !fileName || !documentDate) {
            alert("Please select a file, provide a name, and a document date.");
            return;
        }

        setUploading(true);
        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                try {
                    const base64Content = reader.result; // format: "data:type/ext;base64,..."

                    const payload = {
                        employee_id: employeeId,
                        file_content: base64Content,
                        file_name: fileName,
                        document_date: documentDate,
                        notes: notes
                    };

                    const { data, error } = await supabase.functions.invoke('paypro-uploadEmployeeFile', { body: payload });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);

                    setFile(null);
                    setFileName("");
                    setNotes("");
                    onUploadSuccess();
                    onClose();
                } catch (error) {
                    console.error("Error uploading file:", error);
                    alert(`Failed to upload file: ${error.message || 'Please try again.'}`);
                } finally {
                    setUploading(false);
                }
            };
            reader.onerror = (error) => {
                console.error("Error reading file:", error);
                alert("Error reading file.");
                setUploading(false);
            };

        } catch (error) {
            console.error("Error uploading file:", error);
            alert(`Failed to upload file: ${error.message || 'Please try again.'}`);
            setUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] dark:bg-slate-900 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className="dark:text-slate-100">Upload Document</DialogTitle>
                    <DialogDescription className="dark:text-slate-400">
                        Upload a file to the employee's record.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="file" className="dark:text-slate-300">File (PDF only)</Label>
                        <Input id="file" type="file" accept=".pdf" onChange={handleFileChange} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="fileName" className="dark:text-slate-300">File Name</Label>
                        <Input
                            id="fileName"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            placeholder="Enter file name"
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="documentDate" className="dark:text-slate-300">Document Date</Label>
                        <Input
                            id="documentDate"
                            type="date"
                            value={documentDate}
                            onChange={(e) => setDocumentDate(e.target.value)}
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes" className="dark:text-slate-300">Notes (Optional)</Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Description or notes about this file..."
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={uploading} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</Button>
                    <Button onClick={handleUpload} disabled={uploading || !file} className="bg-blue-600 hover:bg-blue-700">
                        {uploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
