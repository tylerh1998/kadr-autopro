import React, { useState, useEffect } from "react";
import { Employee } from "@/entities/Employee";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, User, Loader2, Edit2, Trash2, Check, X } from "lucide-react";

export default function TechDirectory() {
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadTechs();
  }, []);

  const loadTechs = async () => {
    setLoading(true);
    try {
      const techsData = await Employee.list();
      const techsList = techsData.filter(emp => emp.position === 'technician');
      setTechs(techsList);
    } catch (error) {
      console.error('Error loading techs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncWorkPRO = async () => {
    setSyncing(true);
    try {
      // Fetch WorkPRO techs via backend function
      const response = await base44.functions.invoke('fetchWorkPROTechs');
      const workproTechs = response.data.techs;

      // Get existing employees
      const existingEmployees = await Employee.list();

      let newCount = 0;
      let updatedCount = 0;

      for (const workproTech of workproTechs) {
        // Split full_name into first_name and last_name
        const nameParts = (workproTech.full_name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Tech';

        // Try to find existing employee by employee_id or email
        const existingEmp = existingEmployees.find(
          emp => emp.employee_id === workproTech.employee_id || 
                 (emp.email && emp.email === workproTech.user_email)
        );

        if (existingEmp) {
          // Update existing employee
          await Employee.update(existingEmp.id, {
            full_name: workproTech.full_name,
            email: workproTech.user_email,
            employee_type: workproTech.employee_type,
            first_name: firstName,
            last_name: lastName
          });
          updatedCount++;
        } else {
          // Create new employee
          await Employee.create({
            employee_id: workproTech.employee_id || `WP-${Date.now()}`,
            first_name: firstName,
            last_name: lastName,
            full_name: workproTech.full_name,
            email: workproTech.user_email,
            position: 'technician',
            employee_type: workproTech.employee_type,
            pay_rate: 0,
            is_active: true
          });
          newCount++;
        }
      }

      alert(`Sync complete: ${newCount} new technician(s) added, ${updatedCount} updated.`);
      await loadTechs();
    } catch (error) {
      console.error('Error syncing WorkPRO techs:', error);
      alert('Failed to sync with WorkPRO. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleEdit = (tech) => {
    setEditingTech(tech.id);
    setEditForm({
      first_name: tech.first_name,
      last_name: tech.last_name,
      email: tech.email,
      pay_rate: tech.pay_rate || 0
    });
  };

  const handleSaveEdit = async (techId) => {
    try {
      const rate = parseFloat(editForm.pay_rate);
      if (isNaN(rate) || rate < 0) {
        alert('Please enter a valid pay rate');
        return;
      }

      if (!editForm.first_name || !editForm.last_name) {
        alert('First name and last name are required');
        return;
      }

      await Employee.update(techId, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        pay_rate: rate
      });
      
      setEditingTech(null);
      setEditForm({});
      await loadTechs();
    } catch (error) {
      console.error('Error updating tech:', error);
      alert('Failed to update technician');
    }
  };

  const handleCancelEdit = () => {
    setEditingTech(null);
    setEditForm({});
  };

  const handleDelete = async (tech) => {
    if (!confirm(`Delete ${tech.first_name} ${tech.last_name}?`)) return;
    
    try {
      await Employee.delete(tech.id);
      await loadTechs();
    } catch (error) {
      console.error('Error deleting tech:', error);
      alert('Failed to delete technician');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Tech Setup</CardTitle>
            <Button onClick={handleSyncWorkPRO} disabled={syncing}>
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync WorkPRO Technicians
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-slate-200 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : techs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">First Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Last Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Pay Rate ($/hr)</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {techs.map((tech) => (
                    <tr key={tech.id} className="border-b border-slate-100 hover:bg-slate-50">
                      {editingTech === tech.id ? (
                        <>
                          <td className="py-3 px-4">
                            <Input
                              value={editForm.first_name}
                              onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              value={editForm.last_name}
                              onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              value={editForm.pay_rate}
                              onChange={(e) => setEditForm({...editForm, pay_rate: e.target.value})}
                              className="w-24"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleSaveEdit(tech.id)}
                              >
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                <X className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4">{tech.first_name}</td>
                          <td className="py-3 px-4">{tech.last_name}</td>
                          <td className="py-3 px-4 text-slate-600">{tech.email || 'N/A'}</td>
                          <td className="py-3 px-4">${(tech.pay_rate || 0).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(tech)}
                              >
                                <Edit2 className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(tech)}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <User className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Technicians Found</h3>
              <p className="text-slate-600 mb-4">Sync with WorkPRO to import your technicians.</p>
              <Button onClick={handleSyncWorkPRO} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync WorkPRO Technicians
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}