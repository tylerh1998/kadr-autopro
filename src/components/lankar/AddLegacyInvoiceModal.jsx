import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { searchCustomers } from "@/functions/searchCustomers";
import { supabaseCustomerPayments } from "@/functions/supabaseCustomerPayments";
import { Loader2, Upload, FileText, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}
import { format } from "date-fns";

export default function AddLegacyInvoiceModal({ open, onClose }) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSearchTerm, setActiveSearchTerm] = useState('');
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
            setCustomers([]);
            setSearchTerm('');
            setActiveSearchTerm('');
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

    useEffect(() => {
        if (!open) return;
        if (!activeSearchTerm.trim()) {
            setCustomers([]);
            return;
        }
        loadCustomers(activeSearchTerm);
    }, [open, activeSearchTerm]);

    const loadCustomers = async (term) => {
        setLoading(true);
        try {
            const response = await searchCustomers({ searchTerm: term, page: 1, limit: 50, includeInactive: false });
            const data = response.data?.customers || [];
            setCustomers(data);
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

            const response = await supabaseCustomerPayments({
                action: 'create',
                data: {
                    customer_id: formData.customer_id,
                    payment_date: formData.invoice_date,
                    invoice_number: formData.invoice_number,
                    notes: formData.description,
                    amount: parseFloat(formData.amount),
                    lankar_invoice: fileUrl || null,
                    payment_method: 'on_account',
                    ar_pmt: false,
                    deposited: false,
                    advance_pmt: false,
                    gl_posted: false
                }
            });

            if (response.data?.data) {
                alert("Legacy invoice added successfully!");
                onClose();
            } else {
                alert("Error adding legacy invoice: " + (response.data?.error || "Unknown error"));
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

    const handleCustomerSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setActiveSearchTerm(searchTerm);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Legacy Invoice to AR</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2 flex flex-col">
                        <Label htmlFor="customer">Customer</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    disabled={loading}
                                    className={cn(
                                        "w-full justify-between",
                                        !formData.customer_id && "text-muted-foreground"
                                    )}
                                >
                                    {formData.customer_id
                                        ? getCustomerName(customers.find((c) => c.id === formData.customer_id) || {})
                                        : (loading ? "Loading customers..." : "Search customer and press Enter...")}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[450px] p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput
                                        placeholder="Search customers by name, organization, phone, or email (Press Enter)..."
                                        value={searchTerm}
                                        onValueChange={setSearchTerm}
                                        onKeyDown={handleCustomerSearchKeyDown}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {activeSearchTerm ? 'No customer found.' : 'Type a search and press Enter.'}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {customers.map((customer) => (
                                                <CommandItem
                                                    value={customer.id}
                                                    key={customer.id}
                                                    onSelect={() => {
                                                        setFormData({...formData, customer_id: customer.id});
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            customer.id === formData.customer_id
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        )}
                                                    />
                                                    {getCustomerName(customer)}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
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