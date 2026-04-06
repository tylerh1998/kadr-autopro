import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LocationFilterDialog({ open, onClose, onApplyFilter, initialLocationFrom, initialLocationTo }) {
  const [locationFrom, setLocationFrom] = useState("");
  const [locationTo, setLocationTo] = useState("");

  useEffect(() => {
    if (open) {
      setLocationFrom(initialLocationFrom || "");
      setLocationTo(initialLocationTo || "");
    }
  }, [open, initialLocationFrom, initialLocationTo]);

  const handleApply = () => {
    onApplyFilter(locationFrom, locationTo);
    onClose();
  };

  const handleClear = () => {
    setLocationFrom("");
    setLocationTo("");
    onApplyFilter("", "");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter by Location Range</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="locationFrom" className="text-right">
              From Location
            </Label>
            <Input
              id="locationFrom"
              value={locationFrom}
              onChange={(e) => setLocationFrom(e.target.value)}
              className="col-span-3"
              placeholder="e.g., A01"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="locationTo" className="text-right">
              To Location
            </Label>
            <Input
              id="locationTo"
              value={locationTo}
              onChange={(e) => setLocationTo(e.target.value)}
              className="col-span-3"
              placeholder="e.g., A99"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between w-full sm:justify-between">
          <Button variant="outline" onClick={handleClear}>Clear Filter</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleApply}>Apply Filter</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}