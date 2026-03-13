import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

export default function SupplierForm({ supplier, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    town: '',
    province: '',
    postal_code: '',
    account_number: '',
    default_gl_account: '',
    inventory_supplier: true,
    pin_to_top: false,
    default_taxable: false,
    notes: ''
  });

  const [glAccounts, setGlAccounts] = useState([]);

  useEffect(() => {
    const loadGLAccounts = async () => {
      try {
        const accounts = await base44.entities.ChartOfAccount.list('', 1000);
        // Sort accounts by account_number (smallest to largest)
        const sortedAccounts = (accounts || []).sort((a, b) => {
          const numA = parseInt(a.account_number);
          const numB = parseInt(b.account_number);
          return numA - numB;
        });
        setGlAccounts(sortedAccounts);
      } catch (error) {
        console.error('Error loading GL accounts:', error);
        setGlAccounts([]);
      }
    };
    loadGLAccounts();
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    if (supplier) {
      setFormData({
        name: supplier.name || '',
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        town: supplier.town || '',
        province: supplier.province || '',
        postal_code: supplier.postal_code || '',
        account_number: supplier.account_number || '',
        default_gl_account: supplier.default_gl_account ? String(supplier.default_gl_account) : '',
        inventory_supplier: supplier.inventory_supplier !== undefined ? supplier.inventory_supplier : true,
        pin_to_top: supplier.pin_to_top || false,
        default_taxable: supplier.default_taxable || false,
        notes: supplier.notes || ''
      });
    } else {
      setFormData({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        town: '',
        province: '',
        postal_code: '',
        account_number: '',
        default_gl_account: '',
        inventory_supplier: true,
        pin_to_top: false,
        default_taxable: false,
        notes: ''
      });
    }
  }, [supplier]); // Depend on supplier prop to reset form

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field, checked) => {
    setFormData(prev => ({ ...prev, [field]: checked }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!String(formData.default_gl_account || '').trim()) {
      alert('Default GL Account is required.');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      {/* Assuming the parent component will provide the title, but if not, one could be added here */}
      <h2 className="text-xl font-semibold mb-4">{supplier ? 'Edit Supplier' : 'Add New Supplier'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Supplier Name *</Label>
          <Input id="name" value={formData.name} onChange={handleChange} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_person">Contact Person</Label>
          <Input id="contact_person" value={formData.contact_person} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" value={formData.phone} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={formData.email} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={formData.address} onChange={handleChange} />
        </div>
        <div className="flex gap-4">
          <div className="space-y-2 flex-1">
            <Label htmlFor="town">Town</Label>
            <Input id="town" value={formData.town} onChange={handleChange} />
          </div>
          <div className="space-y-2 w-24">
            <Label htmlFor="province">Province</Label>
            <Input id="province" value={formData.province} onChange={handleChange} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="postal_code">Postal Code</Label>
          <Input id="postal_code" value={formData.postal_code} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account_number">Account #</Label>
          <Input id="account_number" value={formData.account_number} onChange={handleChange} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default_gl_account">Default GL Account *</Label>
          <Select
            key={`gl-select-${supplier?.id || 'new'}-${formData.default_gl_account}`}
            value={formData.default_gl_account}
            onValueChange={(value) => handleSelectChange('default_gl_account', value)}
          >
            <SelectTrigger id="default_gl_account">
              <SelectValue placeholder="Select a GL account..." />
            </SelectTrigger>
            <SelectContent>
              {glAccounts.map(account => (
                <SelectItem key={account.id} value={account.account_number}>
                  {account.account_number} - {account.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="inventory_supplier"
              checked={formData.inventory_supplier}
              onCheckedChange={(checked) => handleCheckboxChange('inventory_supplier', checked)}
            />
            <Label htmlFor="inventory_supplier">Inventory Supplier</Label>
          </div>
          <p className="text-sm text-slate-500">Include in inventory supplier lists</p>
          
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="pin_to_top"
              checked={formData.pin_to_top}
              onCheckedChange={(checked) => handleCheckboxChange('pin_to_top', checked)}
            />
            <Label htmlFor="pin_to_top">Pin to Top</Label>
          </div>
          <p className="text-sm text-slate-500">Show this supplier at the top of the list</p>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="default_taxable"
              checked={formData.default_taxable}
              onCheckedChange={(checked) => handleCheckboxChange('default_taxable', checked)}
            />
            <Label htmlFor="default_taxable">Default Manual GST</Label>
          </div>
          <p className="text-sm text-slate-500">Default new lines to Manual GST mode (0.00)</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={formData.notes} onChange={handleChange} rows={3} />
      </div>
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save Supplier</Button>
      </div>
    </form>
  );
}