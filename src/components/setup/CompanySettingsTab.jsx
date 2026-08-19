import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

const FIELDS = [
  { key: 'company_name', label: 'Company Name' },
  { key: 'company_address', label: 'Address' },
  { key: 'company_town', label: 'Town / City' },
  { key: 'company_province', label: 'Province', placeholder: 'AB' },
  { key: 'company_postal_code', label: 'Postal Code', placeholder: 'T0B 1G0' },
  { key: 'company_country', label: 'Country', placeholder: 'CAN' },
  { key: 'company_phone', label: 'Phone' },
  { key: 'company_email', label: 'Email' },
  { key: 'payroll_account_number', label: 'Payroll (RP) Account Number', placeholder: '000000000RP0000' },
  { key: 'gst_business_number', label: 'GST Business Number' },
];

const emptyForm = () => FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});

export default function CompanySettingsTab({ currentUser }) {
  const { user, employee } = useAuth();
  const isAdmin = currentUser?.admin === true;
  const [form, setForm] = useState(emptyForm());
  const [systemSettingsId, setSystemSettingsId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: settings, error } = await supabase.from('SystemSettings').select('*');
      if (error) throw error;
      if (settings && settings.length > 0) {
        const systemSettings = settings[0];
        setSystemSettingsId(systemSettings.id);
        setForm(FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: systemSettings[f.key] || '' }), {}));
      }
    } catch (error) {
      console.error("Error loading company settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (systemSettingsId) {
        const { error } = await supabase
          .from('SystemSettings')
          .update({ ...form, updated_date: new Date().toISOString() })
          .eq('id', systemSettingsId);
        if (error) throw error;
      } else {
        const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        const { error } = await supabase.from('SystemSettings').insert({
          id: newId,
          ...form,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: employee?.full_name || employee?.email || user?.email || '',
          created_by_id: user?.id || ''
        });
        if (error) throw error;
        setSystemSettingsId(newId);
      }
      setHasChanges(false);
      alert("Company settings saved successfully!");
    } catch (error) {
      console.error("Error saving company settings:", error);
      alert("Failed to save company settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Company Settings</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Employer identity and tax IDs used on T4/T4A slips, the CRA XML export, and other filings.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving || !isAdmin}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        {!isAdmin && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Only admin users can edit company settings.
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            {FIELDS.map(field => (
              <div key={field.key} className={field.key === 'company_address' ? 'md:col-span-2' : ''}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
