import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Edit2, Trash2, Check, X } from "lucide-react";

export default function TechDirectory() {
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTech, setEditingTech] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadTechs();
  }, []);

  const loadTechs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Employee')
        .select('*')
        .eq('employee_type', 'tech');
      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    } finally {
      setLoading(false);
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

      const { error } = await supabase
        .from('Employee')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          email: editForm.email,
          pay_rate: rate
        })
        .eq('id', techId);
      if (error) throw error;

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
      const { error } = await supabase
        .from('Employee')
        .delete()
        .eq('id', tech.id);
      if (error) throw error;
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
          <CardTitle>Tech Setup</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : techs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">First Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Last Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Pay Rate ($/hr)</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {techs.map((tech) => (
                    <tr key={tech.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
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
                                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4">{tech.first_name}</td>
                          <td className="py-3 px-4">{tech.last_name}</td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{tech.email || 'N/A'}</td>
                          <td className="py-3 px-4">${(tech.pay_rate || 0).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEdit(tech)}
                              >
                                <Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(tech)}
                              >
                                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
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
              <User className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Technicians Found</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">No technicians are currently in the Employee directory.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
