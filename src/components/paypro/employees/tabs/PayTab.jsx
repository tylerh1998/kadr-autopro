import React, { useState, useEffect, useCallback } from 'react';
import { EmployeePayType, ValidPayType } from '@/components/paypro/lib/payrollEntities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2, Save, Edit, X, Percent, PiggyBank } from "lucide-react";

export default function PayTab({ employeeId, employee, onFieldChange }) {
  const [payTypes, setPayTypes] = useState([]);
  const [validPayTypes, setValidPayTypes] = useState([]);
  const [newPayType, setNewPayType] = useState({ pay_type_name: '', rate: '', unit: 'Hour' });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});

  const fetchPayTypes = useCallback(async () => {
    setLoading(true);
    try {
        const [validTypes, employeePayTypes] = await Promise.all([
          ValidPayType.list('-created_date'),
          employeeId ? EmployeePayType.filter({ employee_id_ref: employeeId }) : Promise.resolve([])
        ]);

        setValidPayTypes(validTypes);
        setPayTypes(employeePayTypes);
    } catch (error) {
        console.error("Error fetching pay types:", error);
        setValidPayTypes([]);
        setPayTypes([]);
    } finally {
        setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchPayTypes();
  }, [fetchPayTypes]);

  const handleAddPayType = async () => {
    if (!newPayType.pay_type_name || !newPayType.rate || !employeeId) {
      alert("Please fill in all fields for the new pay type.");
      return;
    }
    try {
      // Find the selected ValidPayType to get its workpro_type
      const selectedValidPayType = validPayTypes.find(vpt => vpt.name === newPayType.pay_type_name);
      const workproType = selectedValidPayType?.workpro_type || null;

      await EmployeePayType.create({
        ...newPayType,
        rate: parseFloat(newPayType.rate),
        employee_id_ref: employeeId,
        workpro_type: workproType
      });
      setNewPayType({ pay_type_name: '', rate: '', unit: 'Hour' });
      fetchPayTypes();
    } catch (error) {
      console.error("Error adding pay type:", error);
      alert("Error adding pay type. Please try again.");
    }
  };

  const handleEditStart = (payType) => {
    setEditingId(payType.id);
    setEditingData({
      pay_type_name: payType.pay_type_name,
      rate: payType.rate,
      unit: payType.unit || 'Hour',
      workpro_type: payType.workpro_type || null
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingData({});
  };

  const handleEditSave = async (id) => {
    if (!editingData.pay_type_name || !editingData.rate) {
      alert("Please fill in all fields.");
      return;
    }
    try {
      // Find the selected ValidPayType to get its updated workpro_type
      const selectedValidPayType = validPayTypes.find(vpt => vpt.name === editingData.pay_type_name);
      const workproType = selectedValidPayType?.workpro_type || null;

      await EmployeePayType.update(id, {
        pay_type_name: editingData.pay_type_name,
        rate: parseFloat(editingData.rate),
        unit: editingData.unit,
        workpro_type: workproType
      });
      setEditingId(null);
      setEditingData({});
      fetchPayTypes();
    } catch (error) {
      console.error("Error updating pay type:", error);
      alert("Error updating pay type. Please try again.");
    }
  };

  const handleDeletePayType = async (id) => {
    if (window.confirm("Are you sure you want to delete this pay type?")) {
      try {
        await EmployeePayType.delete(id);
        fetchPayTypes();
      } catch (error) {
        console.error("Error deleting pay type:", error);
        alert("Error deleting pay type. Please try again.");
      }
    }
  };

  const handleVacationPayRateChange = (value) => {
    const percentage = parseFloat(value) || 0;
    const decimal = percentage / 100;
    onFieldChange('vacation_pay_rate', decimal);
  };

  if (!employeeId) {
    return (
        <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
                <CardTitle className="dark:text-slate-100">Pay Information</CardTitle>
                <CardDescription className="dark:text-slate-400">Save the employee first to add pay types.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vacation Pay Rate Section */}
      <Card className="bg-white border-blue-100 dark:bg-blue-950/20 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg dark:text-slate-100">
            <Percent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Vacation Pay
          </CardTitle>
          <CardDescription className="dark:text-slate-400">
            Set a percentage of gross earnings to be added as vacation pay (e.g., 4% or 6%).
            You can choose to pay it directly each period or bank it for later release.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="vacation_pay_rate" className="dark:text-slate-300">Vacation Pay Rate (%)</Label>
            <Input
              id="vacation_pay_rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="0"
              value={employee.vacation_pay_rate ? (employee.vacation_pay_rate * 100).toFixed(1) : '0'}
              onChange={(e) => handleVacationPayRateChange(e.target.value)}
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Current rate: {employee.vacation_pay_rate ? (employee.vacation_pay_rate * 100).toFixed(1) : '0'}%
              (set to 0 to disable vacation pay)
            </p>
          </div>

          {/* Banked Vacation Pay Option */}
          <div className="border-t border-blue-200 dark:border-blue-900 pt-4">
            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-900">
              <div className="flex items-center gap-3">
                <PiggyBank className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <Label htmlFor="is_vacation_banked" className="text-base font-semibold cursor-pointer dark:text-slate-100">
                    Bank Vacation Pay
                  </Label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    When enabled, vacation pay is accumulated in a balance instead of being paid each period
                  </p>
                </div>
              </div>
              <Switch
                id="is_vacation_banked"
                checked={employee.is_vacation_banked || false}
                onCheckedChange={(checked) => onFieldChange('is_vacation_banked', checked)}
              />
            </div>

            {employee.is_vacation_banked && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-900 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-300">Current Banked Balance</p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      Vacation pay will accumulate here and can be released during payroll
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-900 dark:text-green-300">
                      ${(employee.banked_vacation_pay_balance || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hourly Pay Types Section */}
      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Hourly Pay Types</CardTitle>
          <CardDescription className="dark:text-slate-400">Manage the different hourly rates for this employee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2 dark:text-slate-100">Add New Pay Type</h3>
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="pay_type_name" className="dark:text-slate-300">Pay Type Name</Label>
                <Select
                  value={newPayType.pay_type_name}
                  onValueChange={(value) => setNewPayType({...newPayType, pay_type_name: value})}
                >
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
                    <SelectValue placeholder="Select a pay type" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {validPayTypes.map(type => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="rate" className="dark:text-slate-300">Rate</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 25.50"
                  value={newPayType.rate}
                  onChange={e => setNewPayType({...newPayType, rate: e.target.value})}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="unit" className="dark:text-slate-300">Unit</Label>
                <Input
                  id="unit"
                  placeholder="e.g., Hour, Day, Route"
                  value={newPayType.unit}
                  onChange={e => setNewPayType({...newPayType, unit: e.target.value})}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <Button onClick={handleAddPayType} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2"/>
                Add
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2 dark:text-slate-100">Existing Pay Types</h3>
            {loading ? (
               <div className="flex justify-center items-center h-24">
                  <Loader2 className="w-6 h-6 animate-spin dark:text-slate-400"/>
               </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-400">Pay Type Name</TableHead>
                  <TableHead className="dark:text-slate-400">Rate</TableHead>
                  <TableHead className="dark:text-slate-400">Unit</TableHead>
                  <TableHead className="text-right dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payTypes.map(pt => (
                  <TableRow key={pt.id} className="dark:border-slate-800">
                    {editingId === pt.id ? (
                      <>
                        <TableCell>
                          <Select
                            value={editingData.pay_type_name}
                            onValueChange={(value) => setEditingData({...editingData, pay_type_name: value})}
                          >
                            <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                              {validPayTypes.map(type => (
                                <SelectItem key={type.id} value={type.name}>
                                  {type.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingData.rate}
                            onChange={e => setEditingData({...editingData, rate: e.target.value})}
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editingData.unit}
                            onChange={e => setEditingData({...editingData, unit: e.target.value})}
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditSave(pt.id)} className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30">
                              <Save className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={handleEditCancel} className="border-gray-400 text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium dark:text-slate-200">{pt.pay_type_name}</TableCell>
                        <TableCell className="dark:text-slate-300">${pt.rate.toFixed(2)}</TableCell>
                        <TableCell className="dark:text-slate-300">{pt.unit || 'Hour'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditStart(pt)} className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDeletePayType(pt.id)} className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                 {payTypes.length === 0 && (
                  <TableRow>
                      <TableCell colSpan="4" className="text-center text-slate-500 dark:text-slate-400">
                          No pay types added yet.
                      </TableCell>
                  </TableRow>
                 )}
              </TableBody>
            </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
