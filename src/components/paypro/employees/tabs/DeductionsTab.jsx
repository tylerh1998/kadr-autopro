import React, { useState, useEffect, useCallback } from 'react';
import { EmployeeDeduction, TaxYearConstant } from '@/components/paypro/lib/payrollEntities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, Save, Edit, X, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DeductionsTab({ employee, onFieldChange, employeeId }) {
  const [deductions, setDeductions] = useState([]);
  const [newDeduction, setNewDeduction] = useState({ deduction_name: '', amount: '', deduction_type: 'fixed', gl_account: '' });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [taxConstants, setTaxConstants] = useState({ current: null, next: null });

  const fetchDeductions = useCallback(async () => {
    setLoading(true);
    try {
        if (employeeId) {
            const data = await EmployeeDeduction.filter({ employee_id_ref: employeeId });
            setDeductions(data);
        } else {
            setDeductions([]);
        }
    } catch (error) {
        console.error("Error fetching deductions:", error);
        setDeductions([]);
    } finally {
        setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchDeductions();
  }, [fetchDeductions]);

  useEffect(() => {
    const fetchTaxConstants = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        const allConstants = await TaxYearConstant.filter({});

        const current = allConstants.find(c => c.year === currentYear) || null;
        const next = allConstants.find(c => c.year === nextYear) || null;

        setTaxConstants({ current, next });
      } catch (error) {
        console.error("Error fetching tax constants:", error);
      }
    };
    fetchTaxConstants();
  }, []);

  const handleAddDeduction = async () => {
    if (!newDeduction.deduction_name || !newDeduction.amount || !newDeduction.gl_account || !employeeId) {
      alert("Please fill in all fields for the new deduction.");
      return;
    }
    if (!/^\d{4}$/.test(newDeduction.gl_account)) {
      alert("GL Account must be a 4-digit number.");
      return;
    }
    try {
      await EmployeeDeduction.create({
        ...newDeduction,
        amount: parseFloat(newDeduction.amount),
        employee_id_ref: employeeId,
        is_active: true
      });
      setNewDeduction({ deduction_name: '', amount: '', deduction_type: 'fixed', gl_account: '' });
      fetchDeductions();
    } catch (error) {
      console.error("Error adding deduction:", error);
      alert("Error adding deduction. Please try again.");
    }
  };

  const handleEditStart = (deduction) => {
    setEditingId(deduction.id);
    setEditingData({
      deduction_name: deduction.deduction_name,
      amount: deduction.amount.toString(),
      is_active: deduction.is_active,
      deduction_type: deduction.deduction_type || 'fixed',
      gl_account: deduction.gl_account || ''
    });
  };

  const handleEditSave = async (id) => {
    if (!editingData.gl_account) {
      alert("GL Account is required.");
      return;
    }
    if (!/^\d{4}$/.test(editingData.gl_account)) {
      alert("GL Account must be a 4-digit number.");
      return;
    }
    try {
      await EmployeeDeduction.update(id, {
        deduction_name: editingData.deduction_name,
        amount: parseFloat(editingData.amount),
        is_active: editingData.is_active,
        deduction_type: editingData.deduction_type,
        gl_account: editingData.gl_account
      });
      setEditingId(null);
      setEditingData({});
      fetchDeductions();
    } catch (error) {
      console.error("Error updating deduction:", error);
      alert("Error updating deduction. Please try again.");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingData({});
  };

  const handleDeleteDeduction = async (id) => {
    if (confirm("Are you sure you want to delete this deduction?")) {
      try {
        await EmployeeDeduction.delete(id);
        fetchDeductions();
      } catch (error) {
        console.error("Error deleting deduction:", error);
        alert("Error deleting deduction. Please try again.");
      }
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      await EmployeeDeduction.update(id, { is_active: !currentStatus });
      fetchDeductions();
    } catch (error) {
      console.error("Error toggling deduction status:", error);
      alert("Error updating deduction status. Please try again.");
    }
  };

  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {(taxConstants.current || taxConstants.next) && (
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-300">Tax Year Constants Reference</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-400">
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {taxConstants.current && (
                <div>
                  <p className="font-semibold">{taxConstants.current.year} (Current Year)</p>
                  <p>Federal: {formatCurrency(taxConstants.current.federal_basic_personal_amount)}</p>
                  <p>Provincial: {formatCurrency(taxConstants.current.provincial_basic_personal_amount)}</p>
                </div>
              )}
              {taxConstants.next && (
                <div>
                  <p className="font-semibold">{taxConstants.next.year} (Next Year)</p>
                  <p>Federal: {formatCurrency(taxConstants.next.federal_basic_personal_amount)}</p>
                  <p>Provincial: {formatCurrency(taxConstants.next.provincial_basic_personal_amount)}</p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Tax & Basic Deduction Information</CardTitle>
          <CardDescription className="dark:text-slate-400">TD1 amounts for federal and provincial taxes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="federal_td1_basic" className="dark:text-slate-300">Federal Basic Personal Amount</Label>
              <Input
                id="federal_td1_basic"
                type="number"
                min="0"
                step="0.01"
                value={employee.federal_td1_basic ?? ''}
                onChange={(e) => onFieldChange('federal_td1_basic', e.target.value)}
                placeholder={taxConstants.current ? formatCurrency(taxConstants.current.federal_basic_personal_amount) : "Standard"}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provincial_td1_basic" className="dark:text-slate-300">Alberta Basic Personal Amount</Label>
              <Input
                id="provincial_td1_basic"
                type="number"
                min="0"
                step="0.01"
                value={employee.provincial_td1_basic ?? ''}
                onChange={(e) => onFieldChange('provincial_td1_basic', e.target.value)}
                placeholder={taxConstants.current ? formatCurrency(taxConstants.current.provincial_basic_personal_amount) : "Standard"}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t dark:border-slate-700">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_cpp_exempt"
                checked={employee.is_cpp_exempt || false}
                onChange={(e) => onFieldChange('is_cpp_exempt', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-slate-600"
              />
              <Label htmlFor="is_cpp_exempt" className="text-sm font-medium cursor-pointer dark:text-slate-300">
                Exempt from CPP deductions
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_ei_exempt"
                checked={employee.is_ei_exempt || false}
                onChange={(e) => onFieldChange('is_ei_exempt', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-slate-600"
              />
              <Label htmlFor="is_ei_exempt" className="text-sm font-medium cursor-pointer dark:text-slate-300">
                Exempt from EI deductions
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Additional Deductions</CardTitle>
          <CardDescription className="dark:text-slate-400">Manage garnishments, union dues, and other deductions for this employee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2 dark:text-slate-100">Add New Deduction</h3>
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="deduction_name" className="dark:text-slate-300">Deduction Name</Label>
                <Input
                  id="deduction_name"
                  placeholder="e.g., Garnishment, Union Dues"
                  value={newDeduction.deduction_name}
                  onChange={e => setNewDeduction({...newDeduction, deduction_name: e.target.value})}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="w-48 space-y-2">
                <Label htmlFor="deduction_type" className="dark:text-slate-300">Type</Label>
                <Select
                    value={newDeduction.deduction_type}
                    onValueChange={value => setNewDeduction({...newDeduction, deduction_type: value})}
                >
                    <SelectTrigger id="deduction_type" className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="amount" className="dark:text-slate-300">Value</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder={newDeduction.deduction_type === 'fixed' ? "e.g., 50.00" : "e.g., 5"}
                  value={newDeduction.amount}
                  onChange={e => setNewDeduction({...newDeduction, amount: e.target.value})}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <div className="w-32 space-y-2">
                <Label htmlFor="gl_account" className="dark:text-slate-300">GL Account *</Label>
                <Input
                  id="gl_account"
                  type="text"
                  placeholder="e.g., 5200"
                  maxLength="4"
                  value={newDeduction.gl_account}
                  onChange={e => setNewDeduction({...newDeduction, gl_account: e.target.value.replace(/\D/g, '')})}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
              </div>
              <Button onClick={handleAddDeduction} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2"/>
                Add
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2 dark:text-slate-100">Existing Deductions</h3>
            {loading ? (
               <div className="flex justify-center items-center h-24">
                  <Loader2 className="w-6 h-6 animate-spin dark:text-slate-400"/>
               </div>
            ) : deductions.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 py-4">No additional deductions configured for this employee.</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-400">Deduction Name</TableHead>
                  <TableHead className="dark:text-slate-400">Value</TableHead>
                  <TableHead className="dark:text-slate-400">GL Account</TableHead>
                  <TableHead className="dark:text-slate-400">Active</TableHead>
                  <TableHead className="text-right dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductions.map(deduction => (
                  <TableRow key={deduction.id} className="dark:border-slate-800">
                    {editingId === deduction.id ? (
                      <>
                        <TableCell>
                          <Input
                            value={editingData.deduction_name}
                            onChange={e => setEditingData({...editingData, deduction_name: e.target.value})}
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          />
                        </TableCell>
                        <TableCell className="flex gap-2 items-center">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingData.amount}
                            onChange={e => setEditingData({...editingData, amount: e.target.value})}
                            className="flex-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          />
                           <Select
                                value={editingData.deduction_type}
                                onValueChange={value => setEditingData({...editingData, deduction_type: value})}
                            >
                                <SelectTrigger className="w-24 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"><SelectValue /></SelectTrigger>
                                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                                    <SelectItem value="fixed">$</SelectItem>
                                    <SelectItem value="percentage">%</SelectItem>
                                </SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            placeholder="e.g., 5200"
                            maxLength="4"
                            value={editingData.gl_account}
                            onChange={e => setEditingData({...editingData, gl_account: e.target.value.replace(/\D/g, '')})}
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={editingData.is_active}
                            onCheckedChange={checked => setEditingData({...editingData, is_active: checked})}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditSave(deduction.id)} className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30">
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
                        <TableCell className="font-medium dark:text-slate-200">{deduction.deduction_name}</TableCell>
                        <TableCell className="dark:text-slate-300">
                          {deduction.deduction_type === 'percentage'
                              ? `${(deduction.amount || 0).toFixed(2)}%`
                              : `$${(deduction.amount || 0).toFixed(2)}`}
                        </TableCell>
                        <TableCell className="dark:text-slate-300">{deduction.gl_account || 'N/A'}</TableCell>
                        <TableCell>
                          <Switch
                            checked={deduction.is_active}
                            onCheckedChange={() => handleToggleActive(deduction.id, deduction.is_active)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleEditStart(deduction)} className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleDeleteDeduction(deduction.id)} className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
