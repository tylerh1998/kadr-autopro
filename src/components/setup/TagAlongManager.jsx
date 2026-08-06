import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import TagAlongForm from './TagAlongForm';

export default function TagAlongManager() {
  const { user, employee } = useAuth();
  const [tagAlongs, setTagAlongs] = useState([]);
  const [otherCharges, setOtherCharges] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTagAlong, setEditingTagAlong] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tagAlongsResult, otherChargesResult] = await Promise.all([
        supabase.from('TagAlong').select('*').order('name'),
        supabase.from('OtherChargeList').select('*')
      ]);
      if (tagAlongsResult.error) throw tagAlongsResult.error;
      if (otherChargesResult.error) throw otherChargesResult.error;
      setTagAlongs(tagAlongsResult.data || []);
      setOtherCharges(otherChargesResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setTagAlongs([]);
      setOtherCharges([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    try {
      const nowIso = new Date().toISOString();
      if (editingTagAlong) {
        const { error } = await supabase
          .from('TagAlong')
          .update({ ...formData, updated_date: nowIso })
          .eq('id', editingTagAlong.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('TagAlong')
          .insert({
            id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            ...formData,
            created_date: nowIso,
            updated_date: nowIso,
            created_by: employee?.full_name || employee?.email || user?.email || '',
            created_by_id: user?.id || ''
          });
        if (error) throw error;
      }
      setShowForm(false);
      setEditingTagAlong(null);
      fetchData();
    } catch (error) {
      console.error('Error saving tag along:', error);
      alert('Failed to save tag along. Please try again.');
    }
  };

  const handleEdit = (tagAlong) => {
    setEditingTagAlong(tagAlong);
    setShowForm(true);
  };

  const handleDelete = async (tagAlong) => {
    if (window.confirm(`Are you sure you want to delete "${tagAlong.name}"?`)) {
      try {
        const { error } = await supabase.from('TagAlong').delete().eq('id', tagAlong.id);
        if (error) throw error;
        fetchData();
      } catch (error) {
        console.error('Error deleting tag along:', error);
        alert('Failed to delete tag along. Please try again.');
      }
    }
  };

  const getLinkedChargeName = (otherChargeId) => {
    const charge = otherCharges.find(c => c.id === otherChargeId);
    return charge ? charge.description : 'Unknown';
  };

  const filteredTagAlongs = tagAlongs.filter(ta =>
    ta.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ta.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Tag Alongs</CardTitle>
          <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Tag Along
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search tag alongs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : filteredTagAlongs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No tag alongs found. Click "Add Tag Along" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Name</th>
                    <th className="text-left p-3 font-semibold">Description</th>
                    <th className="text-left p-3 font-semibold">Linked Charge</th>
                    <th className="text-right p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTagAlongs.map((tagAlong) => (
                    <tr key={tagAlong.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">{tagAlong.name}</td>
                      <td className="p-3">{tagAlong.description}</td>
                      <td className="p-3">{getLinkedChargeName(tagAlong.other_charge_id)}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(tagAlong)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tagAlong)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTagAlong ? 'Edit Tag Along' : 'Add New Tag Along'}</DialogTitle>
          </DialogHeader>
          <TagAlongForm
            tagAlong={editingTagAlong}
            otherCharges={otherCharges}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingTagAlong(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}