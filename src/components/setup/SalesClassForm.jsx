import React, { useState } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, X } from "lucide-react";

export default function SalesClassForm({ salesClass, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: salesClass?.name || "",
    description: salesClass?.description || "",
    is_active: salesClass?.is_active !== false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>{salesClass ? 'Edit Sales Class' : 'Add New Sales Class'}</span>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </DialogTitle>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Sales Class Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            placeholder="e.g., Retail, Wholesale, Contractor"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Optional description of this sales class..."
            rows={3}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => handleChange('is_active', checked)}
          />
          <Label htmlFor="is_active">Active Sales Class</Label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            {salesClass ? 'Update' : 'Create'} Sales Class
          </Button>
        </div>
      </form>
    </>
  );
}