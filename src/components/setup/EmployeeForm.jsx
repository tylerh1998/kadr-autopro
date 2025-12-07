import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X } from "lucide-react";

export default function EmployeeForm({ employee, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    employee_id: employee?.employee_id || "",
    first_name: employee?.first_name || "",
    last_name: employee?.last_name || "",
    position: employee?.position || "technician",
    hourly_rate: employee?.hourly_rate || "",
    hire_date: employee?.hire_date || "",
    phone: employee?.phone || "",
    email: employee?.email || "",
    address: employee?.address || "",
    is_active: employee?.is_active !== undefined ? employee.is_active : true,
    certifications: employee?.certifications || "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : undefined
    };
    onSubmit(submitData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{employee ? 'Edit Employee' : 'Add New Employee'}</span>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="employee_id">Employee ID *</Label>
              <Input
                value={formData.employee_id}
                onChange={(e) => handleChange('employee_id', e.target.value)}
                placeholder="EMP001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hire_date">Hire Date</Label>
              <Input
                type="date"
                value={formData.hire_date}
                onChange={(e) => handleChange('hire_date', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                value={formData.first_name}
                onChange={(e) => handleChange('first_name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                value={formData.last_name}
                onChange={(e) => handleChange('last_name', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Position and Rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="position">Position *</Label>
              <Select
                value={formData.position}
                onValueChange={(value) => handleChange('position', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="apprentice">Apprentice</SelectItem>
                  <SelectItem value="service_advisor">Service Advisor</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Hourly Rate *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.hourly_rate}
                onChange={(e) => handleChange('hourly_rate', e.target.value)}
                placeholder="25.00"
                required
              />
            </div>
          </div>
          
          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="123 Main St, City, State 12345"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="certifications">Certifications</Label>
            <Textarea
              value={formData.certifications}
              onChange={(e) => handleChange('certifications', e.target.value)}
              placeholder="ASE certifications, licenses, etc..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              <Save className="w-4 h-4 mr-2" />
              {employee ? 'Update Employee' : 'Add Employee'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}