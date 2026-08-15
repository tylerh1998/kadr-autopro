import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, X } from "lucide-react";

export default function PricingMatrixModal({ salesClass, onSubmit, onCancel }) {
  const [ranges, setRanges] = useState([]);
  const [salesClassName, setSalesClassName] = useState("");
  const [salesClassDescription, setSalesClassDescription] = useState("");

  useEffect(() => {
    if (salesClass) {
      setSalesClassName(salesClass.name || "");
      setSalesClassDescription(salesClass.description || "");
      
      let parsedRanges = [];
      try {
        if (salesClass.pricing_matrix) {
          // First parse to unwrap the initial string
          let tempParsed = JSON.parse(salesClass.pricing_matrix);
          
          // If the result is still a string (due to double encoding), parse it again
          if (typeof tempParsed === 'string') {
            tempParsed = JSON.parse(tempParsed);
          }
          
          // Ensure the final result is an array
          if (Array.isArray(tempParsed)) {
            parsedRanges = tempParsed;
          }
        }
      } catch (error) {
        console.error("Error parsing pricing matrix:", error);
      }
      
      if (parsedRanges.length > 0) {
        setRanges(parsedRanges);
      } else {
        setRanges([{ min_cost: "", max_cost: "", margin: "" }]);
      }

    } else {
      setSalesClassName("");
      setSalesClassDescription("");
      setRanges([{ min_cost: "", max_cost: "", margin: "" }]);
    }
  }, [salesClass]);

  const handleAddRange = () => {
    setRanges([...ranges, { min_cost: "", max_cost: "", margin: "" }]);
  };

  const handleRemoveRange = (index) => {
    if (ranges.length > 1) {
      setRanges(ranges.filter((_, i) => i !== index));
    }
  };

  const handleRangeChange = (index, field, value) => {
    const updatedRanges = [...ranges];
    updatedRanges[index][field] = value;
    setRanges(updatedRanges);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!salesClassName.trim()) {
      alert("Sales class name is required.");
      return;
    }

    const validRanges = ranges.filter(range => 
      range.min_cost !== "" && range.max_cost !== "" && range.margin !== ""
    );

    const salesClassData = {
      name: salesClassName,
      description: salesClassDescription,
      pricing_matrix: JSON.stringify(validRanges),
      is_active: salesClass ? salesClass.is_active : true
    };

    onSubmit(salesClassData);
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {salesClass ? `Edit Sales Class: ${salesClass.name}` : "Create New Sales Class"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salesClassName">Sales Class Name *</Label>
              <Input
                id="salesClassName"
                value={salesClassName}
                onChange={(e) => setSalesClassName(e.target.value)}
                placeholder="Enter sales class name"
                required
              />
            </div>
             <div>
              <Label htmlFor="salesClassDescription">Description</Label>
              <Input
                id="salesClassDescription"
                value={salesClassDescription}
                onChange={(e) => setSalesClassDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <Label>Pricing Ranges</Label>
              <Button
                type="button"
                onClick={handleAddRange}
                variant="outline"
                size="sm"
                disabled={ranges.length >= 10}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Range
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Min Cost ($)</TableHead>
                    <TableHead>Max Cost ($)</TableHead>
                    <TableHead>Margin (%)</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranges.map((range, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={range.min_cost}
                          onChange={(e) => handleRangeChange(index, 'min_cost', e.target.value)}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={range.max_cost}
                          onChange={(e) => handleRangeChange(index, 'max_cost', e.target.value)}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={range.margin}
                          onChange={(e) => handleRangeChange(index, 'margin', e.target.value)}
                          placeholder="0.0"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRange(index)}
                          disabled={ranges.length <= 1}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              You can add up to 10 pricing ranges. Each range should specify the minimum and maximum cost along with the corresponding margin percentage.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              <Save className="w-4 h-4 mr-2" />
              {salesClass ? 'Update' : 'Create'} Sales Class
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}