import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function PayrollEmployeeForm({ open, onClose, employee, onSubmit }) {
  const [formData, setFormData] = useState({
    pay_type: 'wage',
    pay_rate: '',
    pto_enrolled: false
  });

  useEffect(() => {
    if (employee) {
      setFormData({
        pay_type: employee.pay_type || 'wage',
        pay_rate: employee.pay_rate?.toString() || '',
        pto_enrolled: employee.pto_enrolled || false
      });
    }
  }, [employee]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      pay_rate: parseFloat(formData.pay_rate) || 0,
    });
  };

  const getPayRateLabel = () => {
    switch (formData.pay_type) {
      case 'wage':
        return 'Hourly Rate ($/hr)';
      case 'salaried':
        return 'Annual Salary ($/yr)';
      case 'bus_driver':
        return 'Daily Rate ($/day)';
      default:
        return 'Pay Rate';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Payroll for {employee?.first_name} {employee?.last_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="pay_type">Pay Type</Label>
            <Select value={formData.pay_type} onValueChange={(value) => handleChange('pay_type', value)}>
              <SelectTrigger id="pay_type">
                <SelectValue placeholder="Select pay type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wage">Wage (per hour)</SelectItem>
                <SelectItem value="salaried">Salaried</SelectItem>
                <SelectItem value="bus_driver">Bus Driver (per day)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay_rate">{getPayRateLabel()}</Label>
            <Input
              id="pay_rate"
              type="number"
              step="0.01"
              value={formData.pay_rate}
              onChange={(e) => handleChange('pay_rate', e.target.value)}
              required
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="pto_enrolled"
              checked={formData.pto_enrolled}
              onCheckedChange={(checked) => handleChange('pto_enrolled', checked)}
            />
            <Label htmlFor="pto_enrolled" className="font-normal">
              Enrolled in PTO Program
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}