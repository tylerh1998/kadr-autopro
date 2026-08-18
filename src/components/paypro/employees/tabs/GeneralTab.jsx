import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function GeneralTab({ employee, onFieldChange }) {
  const handleDateChange = (field, value) => {
    onFieldChange(field, value === "" ? null : value);
  };

  return (
    <Card className="dark:bg-slate-900 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="dark:text-slate-100">General Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="first_name" className="dark:text-slate-300">First Name *</Label>
            <Input id="first_name" value={employee.first_name} onChange={(e) => onFieldChange('first_name', e.target.value)} required className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="dark:text-slate-300">Last Name *</Label>
            <Input id="last_name" value={employee.last_name} onChange={(e) => onFieldChange('last_name', e.target.value)} required className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address" className="dark:text-slate-300">Address</Label>
          <Input id="address" value={employee.address} onChange={(e) => onFieldChange('address', e.target.value)} placeholder="Street address" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="town" className="dark:text-slate-300">Town/City</Label>
            <Input id="town" value={employee.town || ''} onChange={(e) => onFieldChange('town', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="province" className="dark:text-slate-300">Province</Label>
            <Input id="province" value={employee.province || 'AB'} onChange={(e) => onFieldChange('province', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code" className="dark:text-slate-300">Postal Code</Label>
            <Input id="postal_code" value={employee.postal_code || ''} onChange={(e) => onFieldChange('postal_code', e.target.value)} placeholder="T0B 1G0" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phone_number" className="dark:text-slate-300">Phone Number</Label>
              <Input id="phone_number" type="tel" value={employee.phone_number || ''} onChange={(e) => onFieldChange('phone_number', e.target.value)} placeholder="780-123-4567" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="dark:text-slate-300">Email</Label>
              <Input id="email" type="email" value={employee.email} onChange={(e) => onFieldChange('email', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
        </div>

        <div className="space-y-2 bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg p-4">
          <Label htmlFor="kadr_email" className="flex items-center gap-2 dark:text-slate-300">
            <span className="font-semibold">WorkPRO Email</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-normal">(For timesheet matching)</span>
          </Label>
          <Input
            id="kadr_email"
            type="email"
            value={employee.kadr_email || ''}
            onChange={(e) => onFieldChange('kadr_email', e.target.value)}
            placeholder="employee@kensauto.ca"
            className="bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
          <p className="text-xs text-slate-600 dark:text-slate-400">This email must exactly match the user's email in KADR WorkPRO for automated timesheet import.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="emergency_contact" className="dark:text-slate-300">Emergency Contact Name</Label>
              <Input id="emergency_contact" value={employee.emergency_contact || ''} onChange={(e) => onFieldChange('emergency_contact', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emerg_contact_phone_num" className="dark:text-slate-300">Emergency Contact Phone</Label>
              <Input id="emerg_contact_phone_num" type="tel" value={employee.emerg_contact_phone_num || ''} onChange={(e) => onFieldChange('emerg_contact_phone_num', e.target.value)} placeholder="780-123-4567" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="sin" className="dark:text-slate-300">Social Insurance Number</Label>
              <Input id="sin" value={employee.sin} onChange={(e) => onFieldChange('sin', e.target.value)} placeholder="123-456-789" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="date_of_birth" className="dark:text-slate-300">Date of Birth</Label>
                <Input id="date_of_birth" type="date" value={employee.date_of_birth || ""} onChange={(e) => handleDateChange('date_of_birth', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="position" className="dark:text-slate-300">Position</Label>
          <Input id="position" value={employee.position || ''} onChange={(e) => onFieldChange('position', e.target.value)} placeholder="e.g., Mechanic, Driver, Office Manager" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
              <Label htmlFor="employee_type" className="dark:text-slate-300">Employee Type</Label>
              <Select value={employee.employee_type} onValueChange={(value) => onFieldChange('employee_type', value)}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectItem value="Full Time">Full Time</SelectItem>
                  <SelectItem value="Part Time">Part Time</SelectItem>
                  <SelectItem value="Bus Driver">Bus Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="pay_frequency" className="dark:text-slate-300">Pay Frequency</Label>
                <Select value={employee.pay_frequency || 'semi_monthly'} onValueChange={(value) => onFieldChange('pay_frequency', value)}>
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue placeholder="Select pay frequency" /></SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                        <SelectItem value="semi_monthly">Semi-monthly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="space-y-2">
                <Label htmlFor="start_date" className="dark:text-slate-300">Start Date</Label>
                <Input id="start_date" type="date" value={employee.start_date || ""} onChange={(e) => handleDateChange('start_date', e.target.value)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
             <div className="space-y-2">
                <Label htmlFor="end_date" className="dark:text-slate-300">End Date</Label>
                <Input id="end_date" type="date" value={employee.end_date || ""} onChange={(e) => handleDateChange('end_date', e.target.value)} disabled={!employee.start_date} className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
            <div className="space-y-2">
                <Label className="dark:text-slate-300">Calculated Status</Label>
                <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className={employee.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}>
                    {employee.status}
                </Badge>
            </div>
        </div>

      </CardContent>
    </Card>
  );
}
