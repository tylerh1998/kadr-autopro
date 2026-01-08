import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, X } from 'lucide-react';
import { Supplier } from '@/entities/all';

export default function OtherChargeForm({ open, onClose, onSubmit, charge, glAccounts }) {
  const [formData, setFormData] = useState({
    description: '',
    base_amount: 0,
    gl_account: '',
    is_taxable: true,
    is_active: true,
    apply_cost: false,
    linked_supplier_id: '',
    levy: false,
  });

  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  useEffect(() => {
    const fetchSuppliers = async () => {
      setLoadingSuppliers(true);
      try {
        const suppliersData = await Supplier.list('name');
        setSuppliers(suppliersData);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
      } finally {
        setLoadingSuppliers(false);
      }
    };

    if (open) {
      fetchSuppliers();
    }
  }, [open]);

  useEffect(() => {
    if (charge) {
      setFormData({
        description: charge.description || '',
        base_amount: charge.base_amount || 0,
        gl_account: charge.gl_account || '',
        is_taxable: charge.is_taxable ?? true,
        is_active: charge.is_active ?? true,
        apply_cost: charge.apply_cost ?? false,
        linked_supplier_id: charge.linked_supplier_id || '',
        levy: charge.levy ?? false,
        reportable_levy: charge.reportable_levy ?? false,
      });
    } else {
      setFormData({
        description: '',
        base_amount: 0,
        gl_account: '',
        is_taxable: true,
        is_active: true,
        apply_cost: false,
        linked_supplier_id: '',
        levy: false,
        reportable_levy: false,
      });
    }
  }, [charge, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.description || !formData.gl_account) {
      alert('Please fill in Description and GL Account.');
      return;
    }
    onSubmit({
      ...formData,
      base_amount: parseFloat(formData.base_amount) || 0,
      linked_supplier_id: formData.linked_supplier_id || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{charge ? 'Edit Predefined Charge' : 'Add Predefined Charge'}</DialogTitle>
          <DialogDescription>
            Set the default values for a charge that can be quickly added to work orders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="base_amount">Base Amount</Label>
                <Input
                  id="base_amount"
                  type="number"
                  step="0.01"
                  value={formData.base_amount}
                  onChange={(e) => handleChange('base_amount', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gl_account">GL Account</Label>
                <Select
                  value={formData.gl_account}
                  onValueChange={(value) => handleChange('gl_account', value)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {glAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.account_number}>
                        {acc.account_number} - {acc.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                    <Label>Taxable</Label>
                    <p className="text-sm text-muted-foreground">Apply GST to this charge by default.</p>
                </div>
                <Switch
                    checked={formData.is_taxable}
                    onCheckedChange={(checked) => handleChange('is_taxable', checked)}
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">Allow this charge to be selected on work orders.</p>
                </div>
                <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => handleChange('is_active', checked)}
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                    <Label>Apply Cost</Label>
                    <p className="text-sm text-muted-foreground">Enable cost tracking for this charge type.</p>
                </div>
                <Switch
                    checked={formData.apply_cost}
                    onCheckedChange={(checked) => handleChange('apply_cost', checked)}
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                    <Label>Levy</Label>
                    <p className="text-sm text-muted-foreground">Hide from manual selection (can still be added as tag-along).</p>
                </div>
                <Switch
                    checked={formData.levy}
                    onCheckedChange={(checked) => handleChange('levy', checked)}
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                    <Label>Reportable Levy</Label>
                    <p className="text-sm text-muted-foreground">Track this charge as a reportable levy (e.g. Tire Tax).</p>
                </div>
                <Switch
                    checked={formData.reportable_levy}
                    onCheckedChange={(checked) => handleChange('reportable_levy', checked)}
                />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linked_supplier">Linked Supplier (Optional)</Label>
              <Select
                value={formData.linked_supplier_id}
                onValueChange={(value) => handleChange('linked_supplier_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingSuppliers ? "Loading suppliers..." : "Select a supplier"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Default supplier for cost application when this charge is used.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button type="submit">
              <Save className="mr-2 h-4 w-4" /> {charge ? 'Save Changes' : 'Create Charge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}