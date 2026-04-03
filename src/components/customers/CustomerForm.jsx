import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Merge } from 'lucide-react';
import MergeCustomerModal from './MergeCustomerModal';

export default function CustomerForm({ customer, onSubmit, onCancel, isSubmitting }) {
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [formData, setFormData] = useState({
    org_name: '',
    first_name: '',
    last_name: '',
    phone: '',
    secondary_phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    notes: '',
    default_taxable: true,
    is_active: true,
  });

  // Format phone number as XXX XXX XXXX
  const formatPhoneNumber = (value) => {
    // Strip all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format as XXX XXX XXXX
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    } else {
      return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    }
  };

  // Strip formatting from phone number (for saving to database)
  const stripPhoneFormatting = (value) => {
    return value.replace(/\D/g, '');
  };

  useEffect(() => {
    if (customer) {
      setFormData({
        org_name: customer.org_name || '',
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        phone: customer.phone ? formatPhoneNumber(customer.phone) : '',
        secondary_phone: customer.secondary_phone ? formatPhoneNumber(customer.secondary_phone) : '',
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zip_code: customer.zip_code || '',
        notes: customer.notes || '',
        default_taxable: customer.default_taxable !== undefined ? customer.default_taxable : false,
        is_active: customer.is_active !== undefined ? customer.is_active : true,
      });
    }
  }, [customer]);

  const handleMergeComplete = () => {
    // If merge is successful, we probably want to reload the customer data or close the form
    // Since the form is currently editing the MASTER customer (which might have been updated during merge),
    // calling onCancel (which usually acts as a "done" or "back" action) might be appropriate,
    // OR we could trigger a refresh. 
    // Given the context of "Edit Customer", usually finishing a major action closes the edit mode.
    if (onCancel) onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation: Must have either org_name OR (first_name AND last_name)
    const hasOrgName = formData.org_name && formData.org_name.trim() !== '';
    const hasPersonName = formData.first_name && formData.first_name.trim() !== '' && 
                          formData.last_name && formData.last_name.trim() !== '';
    
    if (!hasOrgName && !hasPersonName) {
      alert('Please provide either an Organization Name OR both First Name and Last Name.');
      return;
    }
    
    const strippedPhone = stripPhoneFormatting(formData.phone);
    if (!strippedPhone || strippedPhone.trim() === '') {
      alert('Primary phone number is required.');
      return;
    }

    // Check if customer is being deactivated and deactivate associated vehicles
    if (customer && (customer.is_active !== false) && !formData.is_active) {
      try {
        const res = await base44.functions.invoke('supabaseVehicle', { action: 'filter', match: { customer_id: customer.id } });
        const vehicles = res.data?.data || [];
        if (vehicles && vehicles.length > 0) {
          await Promise.all(vehicles.map(v => base44.functions.invoke('supabaseVehicle', { action: 'update', id: v.id, data: { is_active: false } })));
        }
      } catch (error) {
        console.error("Failed to deactivate customer vehicles:", error);
      }
    }
    
    // Prepare data for submission with stripped phone formatting
    const submissionData = {
      ...formData,
      phone: stripPhoneFormatting(formData.phone),
      secondary_phone: formData.secondary_phone ? stripPhoneFormatting(formData.secondary_phone) : ''
    };
    
    onSubmit(submissionData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e) => {
    const { name, value } = e.target;
    const formatted = formatPhoneNumber(value);
    setFormData(prev => ({ ...prev, [name]: formatted }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <Label htmlFor="org_name">Organization Name</Label>
          <Input
            id="org_name"
            name="org_name"
            value={formData.org_name}
            onChange={handleChange}
            placeholder="Company or organization name"
          />
          <p className="text-xs text-slate-500 mt-1">Leave blank for individual customers</p>
        </div>

        <div>
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            placeholder="First name"
          />
        </div>

        <div>
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            placeholder="Last name"
          />
        </div>

        <div>
          <Label htmlFor="phone">Primary Phone *</Label>
          <Input
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handlePhoneChange}
            placeholder="XXX XXX XXXX"
            required
            maxLength={12}
          />
          <p className="text-xs text-slate-500 mt-1">Format: XXX XXX XXXX</p>
        </div>

        <div>
          <Label htmlFor="secondary_phone">Secondary Phone</Label>
          <Input
            id="secondary_phone"
            name="secondary_phone"
            value={formData.secondary_phone}
            onChange={handlePhoneChange}
            placeholder="XXX XXX XXXX"
            maxLength={12}
          />
          <p className="text-xs text-slate-500 mt-1">Format: XXX XXX XXXX</p>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email address"
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="Street address"
          />
        </div>

        <div>
          <Label htmlFor="city">Town</Label>
          <Input
            id="city"
            name="city"
            value={formData.city}
            onChange={handleChange}
            placeholder="Town"
          />
        </div>

        <div>
          <Label htmlFor="state">Province</Label>
          <Input
            id="state"
            name="state"
            value={formData.state}
            onChange={handleChange}
            placeholder="Province"
          />
        </div>

        <div>
          <Label htmlFor="zip_code">Postal Code</Label>
          <Input
            id="zip_code"
            name="zip_code"
            value={formData.zip_code}
            onChange={handleChange}
            placeholder="Postal Code"
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Additional notes about the customer"
            rows={4}
          />
        </div>

        <div className="md:col-span-2 flex items-center space-x-2">
          <Checkbox
            id="default_taxable"
            checked={formData.default_taxable}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, default_taxable: checked }))}
          />
          <Label htmlFor="default_taxable" className="cursor-pointer">
            Default Taxable (new work orders for this customer will be taxable by default)
          </Label>
        </div>

        <div className="md:col-span-2 flex items-center space-x-2">
          <Checkbox
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
          />
          <Label htmlFor="is_active" className="cursor-pointer">
            Active
          </Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        {customer && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setShowMergeModal(true)}
            className="mr-auto"
          >
            <Merge className="w-4 h-4 mr-2" />
            Merge
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {customer ? 'Update Customer' : 'Create Customer'}
        </Button>
      </div>
      
      {customer && (
        <MergeCustomerModal 
          open={showMergeModal} 
          onClose={() => setShowMergeModal(false)}
          masterCustomer={customer}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </form>
  );
}