import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Customer } from "@/entities/Customer";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, FileText } from "lucide-react";
import { format } from "date-fns";

export default function AddLegacyInvoiceModal({ open, onClose }) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        customer_id: '',
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        invoice_number: '',
        description: '',
        amount: ''
    });
    const [file, setFile] = useState(null);

    useEffect(() => {
        if (open) {
            loadCustomers();
            setFormData({
                customer_id: '',
                invoice_date: format(new Date(), 'yyyy-MM-dd'),
                invoice_number: '',
                description: '',
                amount: ''
            });
            setFile(null);
        }
    }, [open]);

    const loadCustomers = async () => {
        setLoading(true);
        try {
            const data = await Customer.list();
            // Sort customers alphabetically
            const sorted = data.sort((a, b) => {
                const nameA = (a.org_name || `${a.first_name} ${a.last_name}`).toLowerCase();
                const nameB = (b.org_name || `${b.first_name} ${b.last_name}`).toLowerCase();
                return nameA.localeCompare(nameB);
            });
            setCustomers(sorted);
        } catch (error) {
            console.error("Error loading customers:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            let fileUrl = null;

            // Upload file if selected
            if (file) {
                const { file_url } = await base44.integrations.Core.UploadFile({ file });
                fileUrl = file_url;
            }

            // Call backend function
            const response = await base44.functions.invoke('addLegacyInvoiceToAR', {
                ...formData,
                lankar_invoice: fileUrl
            });

            if (response.data.success) {
                alert("Legacy invoice added successfully!");
                onClose();
            } else {
                alert("Error adding legacy invoice: " + (response.data.error || "Unknown error"));
            }
        } catch (error) {
            console.error("Error submitting legacy invoice:", error);
            alert("Failed to submit legacy invoice: " + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const getCustomerName = (c) => {
        if (c.org_name) return c.org_name;
        return `${c.first_name || ''} ${c.last_name || ''}`.trim();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Legacy Invoice to AR</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="customer">Customer</Label>
                        <Select 
                            value={formData.customer_id} 
                            onValueChange={(val) => setFormData({...formData, customer_id: val})}
                            disabled={loading}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={loading ? "Loading customers..." : "Select Customer"} />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {getCustomerName(c)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="invoice_date">Invoice Date</Label>
                            <Input 
                                id="invoice_date" 
                                type="date" 
                                value={formData.invoice_date}
                                onChange={(e) => setFormData({...formData, invoice_date: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="invoice_number">Invoice Number</Label>
                            <Input 
                                id="invoice_number" 
                                value={formData.invoice_number}
                                onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <Input 
                                id="amount" 
                                type="number" 
                                step="0.01"
                                className="pl-7"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input 
                            id="description" 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="file">Invoice Copy (Optional)</Label>
                        <div className="flex items-center gap-2">
                            <Input 
                                id="file" 
                                type="file" 
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => document.getElementById('file').click()}
                                className="w-full"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {file ? file.name : "Upload File"}
                            </Button>
                        </div>
                        {file && (
                            <p className="text-sm text-green-600 flex items-center mt-1">
                                <FileText className="w-3 h-3 mr-1" />
                                {file.name} selected
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting || !formData.customer_id}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Add to AR
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}