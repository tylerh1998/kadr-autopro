import React, { useState } from "react";
import { TrainingRecord } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";

export default function TrainingModal({ training, employeeId, onClose, onSave }) {
  const [formData, setFormData] = useState({
    course_name: training?.course_name || '',
    completed_date: training?.completed_date || '',
    expiry_date: training?.expiry_date || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.course_name || !formData.completed_date) {
      alert("Please fill in course name and completed date.");
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        employee_id_ref: employeeId,
        expiry_date: formData.expiry_date || null
      };

      if (training) {
        await TrainingRecord.update(training.id, data);
      } else {
        await TrainingRecord.create(data);
      }

      onSave();
    } catch (error) {
      console.error("Error saving training record:", error);
      alert("Error saving training record. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {training ? 'Edit Training Record' : 'Add Training Record'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="course_name" className="dark:text-slate-300">Course/Certification Name *</Label>
              <Input
                id="course_name"
                placeholder="e.g., First Aid, Forklift Certification"
                value={formData.course_name}
                onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                required
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="completed_date" className="dark:text-slate-300">Completed Date *</Label>
              <Input
                id="completed_date"
                type="date"
                value={formData.completed_date}
                onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })}
                required
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_date" className="dark:text-slate-300">Expiry Date (Optional)</Label>
              <Input
                id="expiry_date"
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Leave blank if certification doesn't expire</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {training ? 'Update' : 'Save'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
