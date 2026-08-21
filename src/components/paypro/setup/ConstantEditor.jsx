import React, { useState } from "react";
import { TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";

export default function ConstantEditor({ constant, onClose, onSave }) {
  const [formData, setFormData] = useState({
    year: constant?.year || new Date().getFullYear() + 1,
    ei_max_insurable_earnings: constant?.ei_max_insurable_earnings || '',
    cpp_max_pensionable_earnings: constant?.cpp_max_pensionable_earnings || '',
    cpp_basic_exemption: constant?.cpp_basic_exemption || 3500,
    ei_rate_employee: constant?.ei_rate_employee ? (constant.ei_rate_employee * 100).toFixed(2) : '',
    ei_rate_employer_multiplier: constant?.ei_rate_employer_multiplier || 1.4,
    cpp_rate_employee: constant?.cpp_rate_employee ? (constant.cpp_rate_employee * 100).toFixed(2) : '',
    federal_basic_personal_amount: constant?.federal_basic_personal_amount || '',
    provincial_basic_personal_amount: constant?.provincial_basic_personal_amount || ''
  });
  const [processing, setProcessing] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);

    const dataToSave = {
        year: parseInt(formData.year),
        ei_max_insurable_earnings: parseFloat(formData.ei_max_insurable_earnings),
        cpp_max_pensionable_earnings: parseFloat(formData.cpp_max_pensionable_earnings),
        cpp_basic_exemption: parseFloat(formData.cpp_basic_exemption),
        ei_rate_employee: parseFloat(formData.ei_rate_employee) / 100, // Convert percentage to decimal
        ei_rate_employer_multiplier: parseFloat(formData.ei_rate_employer_multiplier),
        cpp_rate_employee: parseFloat(formData.cpp_rate_employee) / 100, // Convert percentage to decimal
        federal_basic_personal_amount: parseFloat(formData.federal_basic_personal_amount),
        provincial_basic_personal_amount: parseFloat(formData.provincial_basic_personal_amount)
    };

    try {
      if (constant) {
        await TaxYearConstant.update(constant.id, dataToSave);
      } else {
        await TaxYearConstant.create(dataToSave);
      }
      alert("Tax year constants saved successfully!");
      onSave();
    } catch (error) {
      console.error("Error saving constant:", error);
      alert("Failed to save constants. Please check the values and try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
        <form onSubmit={handleFormSubmit}>
            <DialogHeader>
                <DialogTitle className="dark:text-slate-100">{constant ? `Edit ${constant.year} Tax Constants` : "Add New Tax Year Constants"}</DialogTitle>
                <DialogDescription className="dark:text-slate-400">
                    Enter the official CRA values for the specified tax year. Rates should be entered as percentages (e.g., 2.29 for 2.29%).
                </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="year" className="dark:text-slate-300">Tax Year</Label>
                        <Input
                            id="year"
                            type="number"
                            placeholder="e.g., 2025"
                            value={formData.year}
                            onChange={(e) => handleInputChange('year', e.target.value)}
                            required
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cpp_basic_exemption" className="dark:text-slate-300">CPP Basic Exemption</Label>
                        <Input
                            id="cpp_basic_exemption"
                            type="number"
                            step="0.01"
                            placeholder="e.g., 3500"
                            value={formData.cpp_basic_exemption}
                            onChange={(e) => handleInputChange('cpp_basic_exemption', e.target.value)}
                            required
                            className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        />
                    </div>
                </div>

                <div className="border-t pt-4 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Maximum Earnings</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="ei_max" className="dark:text-slate-300">EI Max Insurable Earnings</Label>
                            <Input
                                id="ei_max"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 64000"
                                value={formData.ei_max_insurable_earnings}
                                onChange={(e) => handleInputChange('ei_max_insurable_earnings', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cpp_max" className="dark:text-slate-300">CPP Max Pensionable Earnings</Label>
                            <Input
                                id="cpp_max"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 69700"
                                value={formData.cpp_max_pensionable_earnings}
                                onChange={(e) => handleInputChange('cpp_max_pensionable_earnings', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Contribution Rates</h4>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="ei_rate" className="dark:text-slate-300">EI Employee Rate (%)</Label>
                            <Input
                                id="ei_rate"
                                type="number"
                                step="0.001"
                                placeholder="e.g., 2.29"
                                value={formData.ei_rate_employee}
                                onChange={(e) => handleInputChange('ei_rate_employee', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cpp_rate" className="dark:text-slate-300">CPP Employee Rate (%)</Label>
                            <Input
                                id="cpp_rate"
                                type="number"
                                step="0.001"
                                placeholder="e.g., 5.95"
                                value={formData.cpp_rate_employee}
                                onChange={(e) => handleInputChange('cpp_rate_employee', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ei_multiplier" className="dark:text-slate-300">EI Employer Multiplier</Label>
                            <Input
                                id="ei_multiplier"
                                type="number"
                                step="0.1"
                                placeholder="e.g., 1.4"
                                value={formData.ei_rate_employer_multiplier}
                                onChange={(e) => handleInputChange('ei_rate_employer_multiplier', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Basic Personal Amounts</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="federal_basic" className="dark:text-slate-300">Federal Basic Personal Amount</Label>
                            <Input
                                id="federal_basic"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 15705"
                                value={formData.federal_basic_personal_amount}
                                onChange={(e) => handleInputChange('federal_basic_personal_amount', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="provincial_basic" className="dark:text-slate-300">Alberta Basic Personal Amount</Label>
                            <Input
                                id="provincial_basic"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 21003"
                                value={formData.provincial_basic_personal_amount}
                                onChange={(e) => handleInputChange('provincial_basic_personal_amount', e.target.value)}
                                required
                                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" type="button" onClick={onClose} disabled={processing} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
                <Button type="submit" disabled={processing} className="bg-blue-800 hover:bg-blue-900">
                {processing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                    <><Save className="mr-2 h-4 w-4" /> Save Constants</>
                )}
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
