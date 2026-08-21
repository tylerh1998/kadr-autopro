import React, { useState, useEffect, useCallback } from 'react';
import { TrainingRecord } from '@/components/paypro/lib/payrollEntities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import TrainingModal from './TrainingModal';

export default function TrainingTab({ employeeId }) {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState(null);

  const fetchTrainings = useCallback(async () => {
    setLoading(true);
    try {
      if (employeeId) {
        const data = await TrainingRecord.filter({ employee_id_ref: employeeId });
        setTrainings(data);
      } else {
        setTrainings([]);
      }
    } catch (error) {
      console.error("Error fetching training records:", error);
      setTrainings([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  const calculateDaysUntilDue = (expiryDate) => {
    if (!expiryDate) return null;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDaysUntilDueBadge = (days) => {
    if (days === null) return <Badge variant="secondary" className="dark:bg-slate-700 dark:text-slate-300">No Expiry</Badge>;
    if (days < 0) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Expired</Badge>;
    if (days <= 30) return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">{days} days</Badge>;
    if (days <= 90) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">{days} days</Badge>;
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">{days} days</Badge>;
  };

  const handleAddNew = () => {
    setEditingTraining(null);
    setModalOpen(true);
  };

  const handleEdit = (training) => {
    setEditingTraining(training);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this training record?")) {
      try {
        await TrainingRecord.delete(id);
        fetchTrainings();
      } catch (error) {
        console.error("Error deleting training record:", error);
        alert("Error deleting training record. Please try again.");
      }
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingTraining(null);
  };

  const handleSaveComplete = () => {
    handleModalClose();
    fetchTrainings();
  };

  if (!employeeId) {
    return (
      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Training & Certifications</CardTitle>
          <CardDescription className="dark:text-slate-400">Save the employee first to add training records.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="dark:text-slate-100">Training & Certifications</CardTitle>
              <CardDescription className="dark:text-slate-400">Track employee training, certifications, and their expiry dates.</CardDescription>
            </div>
            <Button onClick={handleAddNew} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Training
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="w-6 h-6 animate-spin dark:text-slate-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-400">Course/Certification</TableHead>
                  <TableHead className="dark:text-slate-400">Completed Date</TableHead>
                  <TableHead className="dark:text-slate-400">Expiry Date</TableHead>
                  <TableHead className="dark:text-slate-400">Days Until Due</TableHead>
                  <TableHead className="text-right dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainings.map(training => {
                  const daysUntilDue = calculateDaysUntilDue(training.expiry_date);
                  return (
                    <TableRow key={training.id} className="dark:border-slate-800">
                      <TableCell className="font-medium dark:text-slate-200">
                        {training.course_name}
                        {daysUntilDue !== null && daysUntilDue <= 30 && (
                          <AlertTriangle className="w-4 h-4 inline ml-2 text-orange-600 dark:text-orange-400" />
                        )}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">{new Date(training.completed_date).toLocaleDateString('en-CA')}</TableCell>
                      <TableCell className="dark:text-slate-300">
                        {training.expiry_date
                          ? new Date(training.expiry_date).toLocaleDateString('en-CA')
                          : '—'}
                      </TableCell>
                      <TableCell>{getDaysUntilDueBadge(daysUntilDue)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(training)}
                            className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(training.id)}
                            className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {trainings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan="5" className="text-center text-slate-500 dark:text-slate-400">
                      No training records added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <TrainingModal
          training={editingTraining}
          employeeId={employeeId}
          onClose={handleModalClose}
          onSave={handleSaveComplete}
        />
      )}
    </>
  );
}
