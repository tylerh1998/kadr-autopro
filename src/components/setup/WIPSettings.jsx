import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import WorkOrderStatusManager from "./WorkOrderStatusManager";
import CompanySettingsTab from "./CompanySettingsTab";

export default function WIPSettings({ currentUser }) {
  const { user, employee } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState("statuses");
  const [legalText, setLegalText] = useState("");
  const [defaultMessage, setDefaultMessage] = useState("");
  const [nextRoNumber, setNextRoNumber] = useState(1001);
  const [nextInvNumber, setNextInvNumber] = useState(1001);
  const [legalHasChanges, setLegalHasChanges] = useState(false);
  const [messageHasChanges, setMessageHasChanges] = useState(false);
  const [numberingHasChanges, setNumberingHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemSettingsId, setSystemSettingsId] = useState(null);

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
        setLegalText(systemSettings.wip_legal || "");
        setDefaultMessage(systemSettings.default_message || "");
        setNextRoNumber(systemSettings.next_ro_number || 1001);
        setNextInvNumber(systemSettings.next_inv_number || 1001);
      }
    } catch (error) {
      console.error("Error loading system settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLegal = async () => {
    setSaving(true);
    try {
      if (systemSettingsId) {
        const { error } = await supabase
          .from('SystemSettings')
          .update({ wip_legal: legalText, updated_date: new Date().toISOString() })
          .eq('id', systemSettingsId);
        if (error) throw error;
      } else {
        const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        const { error } = await supabase.from('SystemSettings').insert({
          id: newId,
          wip_legal: legalText,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: employee?.full_name || employee?.email || user?.email || '',
          created_by_id: user?.id || ''
        });
        if (error) throw error;
        setSystemSettingsId(newId);
      }
      setLegalHasChanges(false);
      alert("Legal text saved successfully!");
    } catch (error) {
      console.error("Error saving legal text:", error);
      alert("Failed to save legal text. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDefaultMessage = async () => {
    setSaving(true);
    try {
      if (systemSettingsId) {
        const { error } = await supabase
          .from('SystemSettings')
          .update({ default_message: defaultMessage, updated_date: new Date().toISOString() })
          .eq('id', systemSettingsId);
        if (error) throw error;
      } else {
        const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        const { error } = await supabase.from('SystemSettings').insert({
          id: newId,
          default_message: defaultMessage,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: employee?.full_name || employee?.email || user?.email || '',
          created_by_id: user?.id || ''
        });
        if (error) throw error;
        setSystemSettingsId(newId);
      }
      setMessageHasChanges(false);
      alert("Default message saved successfully!");
    } catch (error) {
      console.error("Error saving default message:", error);
      alert("Failed to save default message. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNumbering = async () => {
    setSaving(true);
    try {
      if (systemSettingsId) {
        const { error } = await supabase
          .from('SystemSettings')
          .update({
            next_ro_number: nextRoNumber,
            next_inv_number: nextInvNumber,
            updated_date: new Date().toISOString()
          })
          .eq('id', systemSettingsId);
        if (error) throw error;
      } else {
        const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        const { error } = await supabase.from('SystemSettings').insert({
          id: newId,
          next_ro_number: nextRoNumber,
          next_inv_number: nextInvNumber,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
          created_by: employee?.full_name || employee?.email || user?.email || '',
          created_by_id: user?.id || ''
        });
        if (error) throw error;
        setSystemSettingsId(newId);
      }
      setNumberingHasChanges(false);
      alert("Numbering settings saved successfully!");
    } catch (error) {
      console.error("Error saving numbering settings:", error);
      alert("Failed to save numbering settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">General Settings</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Configure work-in-progress, filing, and company-wide settings</p>
      </div>

      <div className="flex gap-6">
        {/* Vertical Tabs on Left */}
        <div className="w-48">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab} orientation="vertical" className="w-full">
            <TabsList className="flex flex-col h-auto w-full">
              <TabsTrigger value="statuses" className="w-full justify-start">
                WIP Statuses
              </TabsTrigger>
              <TabsTrigger value="main" className="w-full justify-start">
                WIP Numbering
              </TabsTrigger>
              <TabsTrigger value="legal" className="w-full justify-start">
                Legal
              </TabsTrigger>
              <TabsTrigger value="default_message" className="w-full justify-start">
                Default Message
              </TabsTrigger>
              <TabsTrigger value="company" className="w-full justify-start">
                Company Settings
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeSubTab === "statuses" && (
            <WorkOrderStatusManager />
          )}

          {activeSubTab === "main" && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Numbering Settings</h3>
                  <Button
                    onClick={handleSaveNumbering}
                    disabled={!numberingHasChanges || saving || currentUser?.role !== 'admin'}
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
                
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="next_ro">Next RO#</Label>
                      <Input
                        id="next_ro"
                        type="number"
                        min="1"
                        value={nextRoNumber}
                        onChange={(e) => {
                          setNextRoNumber(parseInt(e.target.value) || 1001);
                          setNumberingHasChanges(true);
                        }}
                        className="max-w-xs"
                        disabled={currentUser?.role !== 'admin'}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        The next RO number that will be assigned (e.g., 1001 becomes RO1001)
                      </p>
                    </div>
                    
                    <div>
                      <Label htmlFor="next_inv">Next Inv#</Label>
                      <Input
                        id="next_inv"
                        type="number"
                        min="1"
                        value={nextInvNumber}
                        onChange={(e) => {
                          setNextInvNumber(parseInt(e.target.value) || 1001);
                          setNumberingHasChanges(true);
                        }}
                        className="max-w-xs"
                        disabled={currentUser?.role !== 'admin'}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        The next Invoice number that will be assigned (e.g., 1001 becomes INV1001)
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSubTab === "legal" && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Legal Text</h3>
                  <Button
                    onClick={handleSaveLegal}
                    disabled={!legalHasChanges || saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {saving ? "Saving..." : "Save Legal Text"}
                  </Button>
                </div>
                
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={legalText}
                      onChange={(e) => {
                        setLegalText(e.target.value);
                        setLegalHasChanges(true);
                      }}
                      placeholder="Enter legal text, terms and conditions, or disclaimers here..."
                      className="min-h-[400px] font-mono text-sm"
                    />
                    
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      This text will appear on work orders, estimates, and invoices as legal terms and conditions.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeSubTab === "default_message" && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Default Message</h3>
                  <Button
                    onClick={handleSaveDefaultMessage}
                    disabled={!messageHasChanges || saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {saving ? "Saving..." : "Save Default Message"}
                  </Button>
                </div>
                
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={defaultMessage}
                      onChange={(e) => {
                        setDefaultMessage(e.target.value);
                        setMessageHasChanges(true);
                      }}
                      placeholder="Enter default message to include on all new work orders..."
                      className="min-h-[400px] font-mono text-sm"
                    />
                    
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      This message will be automatically added to the "Notes to Customer" field when creating new work orders.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeSubTab === "company" && (
            <CompanySettingsTab currentUser={currentUser} />
          )}
        </div>
      </div>
    </div>
  );
}