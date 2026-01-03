import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check } from 'lucide-react';

export default function RecordDetailsModal({ open, onClose, record, entityName, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [saving, setSaving] = useState(false);

  if (!record) return null;

  const handleEdit = () => {
    setEditedJson(JSON.stringify(record, null, 2));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedJson('');
  };

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(editedJson);
      setSaving(true);
      await onUpdate(parsed);
      setSaving(false);
      setIsEditing(false);
    } catch (e) {
      setSaving(false);
      alert('Invalid JSON or update failed: ' + e.message);
    }
  };

  const sortedKeys = Object.keys(record).sort();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit Record - ${entityName}` : `Record Details - ${entityName}`}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-4 -mr-4">
          {isEditing ? (
            <div className="py-4 h-full">
              <Textarea 
                value={editedJson}
                onChange={(e) => setEditedJson(e.target.value)}
                className="font-mono text-xs min-h-[500px] h-full resize-none"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              {sortedKeys.map((key) => {
                const value = record[key];
                let displayValue = '';

                if (value === null || value === undefined) {
                  displayValue = '';
                } else if (typeof value === 'object') {
                  displayValue = JSON.stringify(value, null, 2);
                } else if (typeof value === 'string') {
                  try {
                    const parsed = JSON.parse(value);
                    if (typeof parsed === 'object' && parsed !== null) {
                      displayValue = JSON.stringify(parsed, null, 2);
                    } else {
                      displayValue = value;
                    }
                  } catch (e) {
                    displayValue = value;
                  }
                } else {
                  displayValue = String(value);
                }
                
                const isLongText = displayValue.length > 50 || displayValue.includes('\n');

                return (
                  <div key={key} className="grid grid-cols-4 items-start gap-4">
                    <Label className="text-right pt-2 font-mono text-xs text-slate-500 break-words col-span-1">
                      {key}
                    </Label>
                    <div className="col-span-3 relative group">
                      {isLongText ? (
                        <Textarea 
                          readOnly 
                          value={displayValue} 
                          className="font-mono text-xs min-h-[80px] bg-slate-50 resize-y"
                        />
                      ) : (
                        <Input 
                          readOnly 
                          value={displayValue} 
                          className="font-mono text-xs bg-slate-50 h-8"
                        />
                      )}
                      <CopyButton text={displayValue} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleEdit}>Edit</Button>
              <Button onClick={onClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!text) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute top-0 right-0 h-8 w-8 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}