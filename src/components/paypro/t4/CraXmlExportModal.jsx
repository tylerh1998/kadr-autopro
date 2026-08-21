import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, X } from "lucide-react";
import { DEFAULT_TRANSMITTER_CONTACT } from "./companyInfo";

// Interim, per-device convenience until company/contact info has a real home in
// Setup (see the SystemSettings-backed "Company Info" tab under discussion) -
// remembers only what the user opts into, never sent anywhere but this browser.
const STORAGE_KEY = 'paypro_cra_transmitter_contact';

function loadSavedContact() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CraXmlExportModal({ onExport, onCancel, exporting }) {
  const saved = loadSavedContact();
  const [name, setName] = useState(saved?.name || DEFAULT_TRANSMITTER_CONTACT.name);
  const [email, setEmail] = useState(saved?.email || DEFAULT_TRANSMITTER_CONTACT.email);
  const [phone, setPhone] = useState(saved?.phone || `${DEFAULT_TRANSMITTER_CONTACT.areaCode}-${DEFAULT_TRANSMITTER_CONTACT.phoneNumber}`);
  const [repId, setRepId] = useState(saved?.repId || '');
  const [remember, setRemember] = useState(!!saved);

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      alert("CRA requires a contact name and email on the T619 transmittal record.");
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      alert("Enter a 10-digit contact phone number (area code + number).");
      return;
    }

    const trimmedRepId = repId.trim();

    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, phone, repId: trimmedRepId }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    onExport({
      name: name.trim(),
      email: email.trim(),
      areaCode: digits.slice(0, 3),
      phoneNumber: `${digits.slice(3, 6)}-${digits.slice(6)}`,
      language: DEFAULT_TRANSMITTER_CONTACT.language,
      repId: trimmedRepId,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">CRA XML Transmitter Contact</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            CRA requires a contact person on every T619 electronic transmittal record - this is
            who CRA may reach out to about this filing. It doesn't need to be the employer of record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Contact Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Contact Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Contact Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="780-847-3002"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <div className="space-y-2">
            <Label className="dark:text-slate-300">Representative ID (RepID)</Label>
            <Input
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              placeholder="e.g. W3ZG535"
              className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only if you upload via Represent a Client - leave blank if you sign in to My Business Account directly.
              CRA rejects the file if this doesn't match your login.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={remember} onCheckedChange={setRemember} id="remember-cra-contact" />
            <Label htmlFor="remember-cra-contact" className="text-sm font-normal cursor-pointer dark:text-slate-300">
              Remember on this device for next time
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
          <Button variant="outline" onClick={onCancel} disabled={exporting} className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={exporting} className="bg-blue-800 hover:bg-blue-900 text-white">
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building XML...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export XML
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
