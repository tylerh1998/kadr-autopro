import React, { useState, useEffect } from "react";
import { TaxYearConstant, PayrollSetting } from "@/components/paypro/lib/payrollEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Calendar, Settings as SettingsIcon, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ConstantEditor from "@/components/paypro/setup/ConstantEditor";

export default function Setup() {
  const [constants, setConstants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periodCloseDate, setPeriodCloseDate] = useState('');
  const [editingConstant, setEditingConstant] = useState(null);
  const [showConstantEditor, setShowConstantEditor] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [constantsList, settings] = await Promise.all([
      TaxYearConstant.list('-year'),
      PayrollSetting.list()
    ]);

    setConstants(constantsList);

    const closeDateSetting = settings.find(s => s.key === 'period_close_date');
    if (closeDateSetting) {
      setPeriodCloseDate(closeDateSetting.value);
    }

    setLoading(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const existingSettings = await PayrollSetting.list();

      // Save period close date
      const closeDateSetting = existingSettings.find(s => s.key === 'period_close_date');
      if (closeDateSetting) {
        await PayrollSetting.update(closeDateSetting.id, { value: periodCloseDate });
      } else {
        await PayrollSetting.create({ key: 'period_close_date', value: periodCloseDate });
      }

      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Error saving settings. Please try again.");
    }
    setSaving(false);
  };

  const handleAddConstant = () => {
    setEditingConstant(null);
    setShowConstantEditor(true);
  };

  const handleEditConstant = (constant) => {
    setEditingConstant(constant);
    setShowConstantEditor(true);
  };

  const handleConstantSaved = () => {
    setShowConstantEditor(false);
    setEditingConstant(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin dark:text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Payroll Setup & Configuration</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage tax year constants and payroll settings</p>
      </div>

      <Tabs defaultValue="constants" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="constants">
            <Calendar className="w-4 h-4 mr-2" />
            Tax Year Constants
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon className="w-4 h-4 mr-2" />
            General Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="constants">
          <Card className="border-0 shadow-sm dark:bg-slate-900">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="dark:text-slate-100">Tax Year Constants</CardTitle>
                <Button onClick={handleAddConstant} className="bg-blue-800 hover:bg-blue-900">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Tax Year
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {constants.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  No tax year constants configured. Click "Add Tax Year" to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="dark:text-slate-400">Year</TableHead>
                      <TableHead className="dark:text-slate-400">CPP Max</TableHead>
                      <TableHead className="dark:text-slate-400">EI Max</TableHead>
                      <TableHead className="dark:text-slate-400">CPP Rate</TableHead>
                      <TableHead className="dark:text-slate-400">EI Rate</TableHead>
                      <TableHead className="dark:text-slate-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {constants.map(constant => (
                      <TableRow key={constant.id} className="dark:border-slate-800">
                        <TableCell className="font-semibold dark:text-slate-200">{constant.year}</TableCell>
                        <TableCell className="dark:text-slate-300">${constant.cpp_max_pensionable_earnings?.toLocaleString()}</TableCell>
                        <TableCell className="dark:text-slate-300">${constant.ei_max_insurable_earnings?.toLocaleString()}</TableCell>
                        <TableCell className="dark:text-slate-300">{(constant.cpp_rate_employee * 100).toFixed(2)}%</TableCell>
                        <TableCell className="dark:text-slate-300">{(constant.ei_rate_employee * 100).toFixed(2)}%</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditConstant(constant)}
                            className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="border-0 shadow-sm dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="dark:text-slate-100">General Payroll Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="periodCloseDate" className="dark:text-slate-300">Period Close Date</Label>
                <Input
                  id="periodCloseDate"
                  type="date"
                  value={periodCloseDate}
                  onChange={(e) => setPeriodCloseDate(e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Paycheques cannot be created for periods on or before this date.
                </p>
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-blue-800 hover:bg-blue-900"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showConstantEditor && (
        <ConstantEditor
          constant={editingConstant}
          onClose={() => {
            setShowConstantEditor(false);
            setEditingConstant(null);
          }}
          onSave={handleConstantSaved}
        />
      )}
    </div>
  );
}
