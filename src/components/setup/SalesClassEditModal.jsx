import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Plus, Trash2 } from "lucide-react";

export default function SalesClassEditModal({ salesClass, open, onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true
  });
  const [pricingRules, setPricingRules] = useState([]);

  useEffect(() => {
    if (open) {
      if (salesClass) {
        setFormData({
          name: salesClass.name || "",
          description: salesClass.description || "",
          is_active: salesClass.is_active !== false
        });
        try {
          const rules = salesClass.pricing_matrix ? JSON.parse(salesClass.pricing_matrix) : [];
          setPricingRules(rules.length > 0 ? rules : createDefaultRules());
        } catch {
          setPricingRules(createDefaultRules());
        }
      } else {
        // Reset for new class
        setFormData({ name: "", description: "", is_active: true });
        setPricingRules(createDefaultRules());
      }
    }
  }, [salesClass, open]);
  
  const createDefaultRules = () => [
    { id: Date.now(), cost_from: 0, cost_to: 999999, margin: 0 }
  ];

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleRuleChange = (id, field, value) => {
    setPricingRules(rules => 
      rules.map(rule => 
        rule.id === id ? { ...rule, [field]: parseFloat(value) || 0 } : rule
      )
    );
  };
  
  const addRule = () => {
    if (pricingRules.length >= 10) {
      alert("You can have a maximum of 10 pricing rules.");
      return;
    }
    const newRule = { id: Date.now(), cost_from: 0, cost_to: 0, margin: 0 };
    setPricingRules([...pricingRules, newRule]);
  };

  const deleteRule = (id) => {
    setPricingRules(rules => rules.filter(rule => rule.id !== id));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert("Sales Class Name is required.");
      return;
    }
    const finalData = {
      ...formData,
      pricing_matrix: JSON.stringify(pricingRules)
    };
    onSubmit(finalData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{salesClass ? 'Edit Sales Class' : 'Add New Sales Class'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-6 p-1">
          {/* Sales Class Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Sales Class Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows={1}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleFormChange('is_active', checked)}
            />
            <Label htmlFor="is_active">Active Sales Class</Label>
          </div>

          {/* Pricing Matrix */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Pricing Rules (Max 10)</Label>
              <Button type="button" onClick={addRule} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" /> Add Rule
              </Button>
            </div>
            
            <div className="grid grid-cols-4 gap-4 font-semibold text-sm text-slate-600 border-b pb-2 px-2">
              <div>Cost From ($)</div>
              <div>Cost To ($)</div>
              <div>Margin (%)</div>
              <div>Actions</div>
            </div>
            
            <div className="space-y-3">
              {pricingRules.map((rule) => (
                <div key={rule.id} className="grid grid-cols-4 gap-4 items-center px-2">
                  <Input
                    type="number" step="0.01" min="0"
                    value={rule.cost_from}
                    onChange={(e) => handleRuleChange(rule.id, 'cost_from', e.target.value)}
                  />
                  <Input
                    type="number" step="0.01" min="0"
                    value={rule.cost_to === 999999 ? '' : rule.cost_to}
                    onChange={(e) => handleRuleChange(rule.id, 'cost_to', e.target.value || 999999)}
                    placeholder="No limit"
                  />
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={rule.margin}
                    onChange={(e) => handleRuleChange(rule.id, 'margin', e.target.value)}
                  />
                  <Button
                    type="button" variant="ghost" size="icon"
                    onClick={() => deleteRule(rule.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </form>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="sales-class-form" onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            {salesClass ? 'Save Changes' : 'Create Sales Class'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}