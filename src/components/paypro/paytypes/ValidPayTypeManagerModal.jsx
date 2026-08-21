import React, { useState, useEffect } from "react";
import { ValidPayType } from "@/components/paypro/lib/payrollEntities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ValidPayTypeManagerModal({ isOpen, onClose }) {
  const [validPayTypes, setValidPayTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPayType, setEditingPayType] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPayTypes();
    }
  }, [isOpen]);

  const loadPayTypes = async () => {
    setLoading(true);
    try {
      const data = await ValidPayType.list('-created_date');
      setValidPayTypes(data);
    } catch (error) {
      console.error("Error loading valid pay types:", error);
    }
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingPayType(null);
    setFormData({ name: '' });
    setFormOpen(true);
  };

  const handleEdit = (payType) => {
    setEditingPayType(payType);
    setFormData({ name: payType.name });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Please enter a pay type name.");
      return;
    }

    setSaving(true);
    try {
      if (editingPayType) {
        await ValidPayType.update(editingPayType.id, formData);
      } else {
        await ValidPayType.create(formData);
      }
      setFormOpen(false);
      setFormData({ name: '' });
      setEditingPayType(null);
      loadPayTypes();
    } catch (error) {
      console.error("Error saving pay type:", error);
      alert("Error saving pay type. Please try again.");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this pay type? This will not affect existing employee pay types.")) {
      try {
        await ValidPayType.delete(id);
        loadPayTypes();
      } catch (error) {
        console.error("Error deleting pay type:", error);
        alert("Error deleting pay type. Please try again.");
      }
    }
  };

  const handleCancel = () => {
    setFormOpen(false);
    setFormData({ name: '' });
    setEditingPayType(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Manage Valid Pay Types</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Add, edit, or remove valid pay type options that will be available when setting up employee pay.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add/Edit Form */}
          {formOpen && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900">
              <CardHeader>
                <CardTitle className="text-lg dark:text-slate-100">
                  {editingPayType ? 'Edit Pay Type' : 'Add New Pay Type'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payTypeName" className="dark:text-slate-300">Pay Type Name *</Label>
                  <Input
                    id="payTypeName"
                    placeholder="e.g., Regular, Overtime, Route 5"
                    value={formData.name}
                    onChange={(e) => setFormData({ name: e.target.value })}
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add Button */}
          {!formOpen && (
            <Button onClick={handleAdd} className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />
              Add New Pay Type
            </Button>
          )}

          {/* List of Pay Types */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg dark:text-slate-100">Existing Pay Types</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-24">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-800 dark:text-blue-400" />
                </div>
              ) : validPayTypes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <p>No pay types defined yet.</p>
                  <p className="text-sm">Click "Add New Pay Type" to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-slate-700">
                      <TableHead className="dark:text-slate-400">Pay Type Name</TableHead>
                      <TableHead className="text-right dark:text-slate-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validPayTypes.map(payType => (
                      <TableRow key={payType.id} className="dark:border-slate-800">
                        <TableCell className="font-medium dark:text-slate-200">{payType.name}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEdit(payType)}
                              className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDelete(payType.id)}
                              className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
