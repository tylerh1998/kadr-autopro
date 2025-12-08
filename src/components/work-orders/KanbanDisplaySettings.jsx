import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings } from "lucide-react";

export default function KanbanDisplaySettings({ open, onClose, workOrderStatuses, columnSizes, onSave }) {
  const [localSizes, setLocalSizes] = useState({});

  useEffect(() => {
    if (open) {
      // Initialize with current sizes or defaults
      const initialSizes = {};
      workOrderStatuses.forEach(status => {
        initialSizes[status.name] = columnSizes[status.name] || { width: 280, height: 600 };
      });
      setLocalSizes(initialSizes);
    }
  }, [open, workOrderStatuses, columnSizes]);

  const handleWidthChange = (statusName, value) => {
    setLocalSizes(prev => ({
      ...prev,
      [statusName]: { ...prev[statusName], width: value[0] }
    }));
  };

  const handleHeightChange = (statusName, value) => {
    setLocalSizes(prev => ({
      ...prev,
      [statusName]: { ...prev[statusName], height: value[0] }
    }));
  };

  const handleSave = () => {
    onSave(localSizes);
    onClose();
  };

  const handleReset = () => {
    const defaultSizes = {};
    workOrderStatuses.forEach(status => {
      defaultSizes[status.name] = { width: 280, height: 600 };
    });
    setLocalSizes(defaultSizes);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Kanban Board Display Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {workOrderStatuses.map(status => (
            <div key={status.name} className="space-y-4 p-4 border border-slate-200 rounded-lg">
              <h3 className="font-semibold text-slate-900">{status.name}</h3>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-slate-600">
                    Column Width: {localSizes[status.name]?.width || 280}px
                  </Label>
                  <Slider
                    value={[localSizes[status.name]?.width || 280]}
                    onValueChange={(value) => handleWidthChange(status.name, value)}
                    min={200}
                    max={500}
                    step={10}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label className="text-sm text-slate-600">
                    Column Height: {localSizes[status.name]?.height || 600}px
                  </Label>
                  <Slider
                    value={[localSizes[status.name]?.height || 600]}
                    onValueChange={(value) => handleHeightChange(status.name, value)}
                    min={400}
                    max={1000}
                    step={50}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}