import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Upload, File, ExternalLink, Trash2 } from "lucide-react";
import { Employee, EmployeeFile } from "@/components/paypro/lib/payrollEntities";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import EmployeeFileModal from "./EmployeeFileModal";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

// A file row not yet migrated off base44 (D3, Phase 3B) has a full http(s) URL in
// file_url instead of a storage path - paypro-viewEmployeeFile can't resolve it.
const isMigratedFile = (file) => !!file.file_url && !/^https?:\/\//i.test(file.file_url);

export default function OtherTab({ employee, onFieldChange, employeeId }) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(employee.notes || '');
  const [alerts, setAlerts] = useState(employee.alerts || '');

  const queryClient = useQueryClient();

  const { data: files, isLoading: loadingFiles } = useQuery({
    queryKey: ['employeeFiles', employeeId],
    queryFn: () => EmployeeFile.filter({ employee_id: employeeId }),
    enabled: !!employeeId,
  });

  const [viewingFile, setViewingFile] = useState(null);

  const handleViewFile = async (file) => {
    setViewingFile(file.id);
    try {
      const { data, error } = await supabase.functions.invoke('paypro-viewEmployeeFile', { body: { file_id: file.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newWindow = window.open(data.signedUrl, '_blank');
      if (!newWindow) {
        alert('Please allow popups for this website to view the file.');
      }
    } catch (error) {
      console.error("Error viewing file:", error);
      alert(`Failed to view file: ${error.message || 'Unknown error'}`);
    } finally {
      setViewingFile(null);
    }
  };

  const deleteFileMutation = useMutation({
    mutationFn: (id) => EmployeeFile.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['employeeFiles', employeeId]);
    }
  });

  const handleDeleteFile = async (id) => {
    if (confirm("Are you sure you want to delete this file?")) {
      deleteFileMutation.mutate(id);
    }
  };

  const handleSaveNotes = async () => {
    if (!employeeId) {
      alert("Please save the employee first before adding notes.");
      return;
    }

    setSaving(true);
    try {
      await Employee.update(employeeId, { notes, alerts });
      onFieldChange('notes', notes);
      onFieldChange('alerts', alerts);
      alert("Notes and alerts saved successfully!");
    } catch (error) {
      console.error("Error saving notes:", error);
      alert("Error saving notes. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Additional Notes</CardTitle>
          <CardDescription className="dark:text-slate-400">Add any additional information or notes about this employee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes" className="dark:text-slate-300">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Enter any additional notes, comments, or information about this employee..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              className="resize-y dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="space-y-2 mt-4">
            <Label htmlFor="alerts" className="dark:text-slate-300">Alerts (Payroll Reminders)</Label>
            <div className="bg-white dark:bg-slate-800 rounded-md">
              <ReactQuill
                theme="snow"
                value={alerts}
                onChange={setAlerts}
                placeholder="Enter any important short reminders or alerts for payroll processing..."
                className="[&_.ql-toolbar]:rounded-t-md [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-600 [&_.ql-toolbar]:dark:bg-slate-800 [&_.ql-container]:rounded-b-md [&_.ql-container]:border-slate-200 dark:[&_.ql-container]:border-slate-600 [&_.ql-editor]:dark:text-slate-100 [&_.ql-editor.ql-blank::before]:dark:text-slate-500 [&_.ql-stroke]:dark:stroke-slate-300 [&_.ql-fill]:dark:fill-slate-300 [&_.ql-picker]:dark:text-slate-300"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This will be displayed as a purple alert box when processing this employee's paycheque.</p>
          </div>
          <Button
            onClick={handleSaveNotes}
            disabled={saving || !employeeId}
            className="bg-blue-600 hover:bg-blue-700 mt-4"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Notes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="dark:bg-slate-900 dark:border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="dark:text-slate-100">Employee Files</CardTitle>
            <CardDescription className="dark:text-slate-400">Manage documents and files for this employee.</CardDescription>
          </div>
          <Button onClick={() => setShowUploadModal(true)} disabled={!employeeId} className="bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </CardHeader>
        <CardContent>
          {loadingFiles ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin dark:text-slate-400" />
            </div>
          ) : !files || files.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground dark:text-slate-400">
              No files uploaded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-slate-700">
                  <TableHead className="dark:text-slate-400">File Name</TableHead>
                  <TableHead className="dark:text-slate-400">Document Date</TableHead>
                  <TableHead className="dark:text-slate-400">Date Uploaded</TableHead>
                  <TableHead className="dark:text-slate-400">Notes</TableHead>
                  <TableHead className="text-right dark:text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} className="dark:border-slate-800">
                    <TableCell className="font-medium flex items-center gap-2 dark:text-slate-200">
                      <File className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      {file.file_name}
                    </TableCell>
                    <TableCell className="dark:text-slate-300">{file.document_date || '-'}</TableCell>
                    <TableCell className="dark:text-slate-300">{file.upload_date}</TableCell>
                    <TableCell className="max-w-xs truncate dark:text-slate-300" title={file.notes}>{file.notes || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewFile(file)}
                            disabled={viewingFile === file.id || !isMigratedFile(file)}
                            title={!isMigratedFile(file) ? "This file predates the new storage system and can't be previewed here yet." : undefined}
                            className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                            {viewingFile === file.id ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <ExternalLink className="w-4 h-4 mr-1" />
                            )}
                            {isMigratedFile(file) ? 'Preview' : 'Not migrated'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFile(file.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
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

      {showUploadModal && (
        <EmployeeFileModal
          employeeId={employeeId}
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={() => queryClient.invalidateQueries(['employeeFiles', employeeId])}
        />
      )}
    </div>
  );
}
