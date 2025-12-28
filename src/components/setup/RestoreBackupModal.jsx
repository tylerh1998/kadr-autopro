import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, AlertTriangle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function RestoreBackupModal({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleRestore = async () => {
    if (!file) return;

    setLoading(true);
    setStatus("Reading file...");

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const jsonContent = JSON.parse(e.target.result);
          
          setStatus("Restoring data... This may take a while.");
          const response = await base44.functions.invoke('restoreBackup', { 
            backupData: jsonContent 
          });

          if (response.data.success) {
            alert(`Restore successful!\nProcessed: ${response.data.total_processed}\nFailed: ${response.data.total_failed}`);
            onClose();
          } else {
            alert('Restore failed: ' + (response.data.error || 'Unknown error'));
          }
        } catch (err) {
          console.error("Parse/Upload error:", err);
          alert('Failed to process file: ' + err.message);
        } finally {
          setLoading(false);
          setStatus("");
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error("Restore error:", error);
      setLoading(false);
      setStatus("");
      alert('Error: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restore Backup</DialogTitle>
          <DialogDescription>
            Upload a JSON backup file to restore data to this environment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex gap-3 text-orange-800 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Warning</p>
              <p>This will insert records from the backup into the current database. Existing data will not be deleted, which may cause duplicates.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup-file">Select Backup File (.json)</Label>
            <Input 
              id="backup-file" 
              type="file" 
              accept=".json"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>

          {status && (
            <div className="flex items-center gap-2 text-sm text-slate-600 justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{status}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button 
            onClick={handleRestore} 
            disabled={!file || loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? 'Restoring...' : 'Restore Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}