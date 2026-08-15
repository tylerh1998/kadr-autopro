import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, GripVertical, Save, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const COLOR_OPTIONS = [
  { value: 'slate', label: 'Slate', class: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800' },
  { value: 'green', label: 'Green', class: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800' },
  { value: 'red', label: 'Red', class: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 border-pink-300 dark:border-pink-800' },
];

export default function WorkOrderStatusManager() {
  const { user, employee } = useAuth();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStatus, setEditingStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    color: 'blue',
    is_active: true
  });

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('WorkOrderStatus').select('*');
      if (error) throw error;
      const sorted = (data || []).sort((a, b) => a.display_order - b.display_order);
      setStatuses(sorted);
    } catch (error) {
      console.error('Error loading statuses:', error);
      alert('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(statuses);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update display_order for all items
    const updatedItems = items.map((item, index) => ({
      ...item,
      display_order: index + 1
    }));

    setStatuses(updatedItems);

    // Save new order to database
    try {
      const results = await Promise.all(
        updatedItems.map(item =>
          supabase.from('WorkOrderStatus').update({ display_order: item.display_order }).eq('id', item.id)
        )
      );
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
    } catch (error) {
      console.error('Error updating status order:', error);
      alert('Failed to update status order');
      loadStatuses(); // Reload on error
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingStatus) {
        const { error } = await supabase
          .from('WorkOrderStatus')
          .update({ ...formData, updated_date: new Date().toISOString() })
          .eq('id', editingStatus.id);
        if (error) throw error;
      } else {
        const maxOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.display_order)) : 0;
        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('WorkOrderStatus').insert({
          id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          ...formData,
          display_order: maxOrder + 1,
          created_date: nowIso,
          updated_date: nowIso,
          created_by: employee?.full_name || employee?.email || user?.email || '',
          created_by_id: user?.id || ''
        });
        if (error) throw error;
      }

      setShowForm(false);
      setEditingStatus(null);
      setFormData({ name: '', color: 'blue', is_active: true });
      loadStatuses();
    } catch (error) {
      console.error('Error saving status:', error);
      alert('Failed to save status');
    }
  };

  const handleEdit = (status) => {
    setEditingStatus(status);
    setFormData({
      name: status.name,
      color: status.color,
      is_active: status.is_active
    });
    setShowForm(true);
  };

  const handleDelete = async (status) => {
    if (!confirm(`Are you sure you want to delete the status "${status.name}"?`)) return;

    try {
      const { error } = await supabase.from('WorkOrderStatus').delete().eq('id', status.id);
      if (error) throw error;
      loadStatuses();
    } catch (error) {
      console.error('Error deleting status:', error);
      alert('Failed to delete status. It may be in use by existing work orders.');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingStatus(null);
    setFormData({ name: '', color: 'blue', is_active: true });
  };

  const getColorClass = (color) => {
    const colorOption = COLOR_OPTIONS.find(opt => opt.value === color);
    return colorOption ? colorOption.class : COLOR_OPTIONS[0].class;
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-600 dark:text-slate-400">Loading statuses...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Work Order Statuses</CardTitle>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Status
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800">
            <h3 className="font-semibold text-lg">
              {editingStatus ? 'Edit Status' : 'New Status'}
            </h3>

            <div>
              <Label htmlFor="name">Status Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Open, In Progress, Completed"
                required
              />
            </div>

            <div>
              <Label htmlFor="color">Badge Color *</Label>
              <Select
                value={formData.color}
                onValueChange={(value) => setFormData({ ...formData, color: value })}
              >
                <SelectTrigger id="color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Badge className={`${option.class} border`}>
                          {option.label}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
            </div>

            <div className="flex gap-2">
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" />
                {editingStatus ? 'Update' : 'Create'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Drag and drop to reorder statuses. The order determines how they appear in lists and dropdowns.
          </p>

          {statuses.length === 0 ? (
            <p className="text-center py-8 text-slate-500 dark:text-slate-400">No statuses defined yet. Click "Add Status" to create one.</p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="statuses">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Status Name</TableHead>
                          <TableHead>Badge Preview</TableHead>
                          <TableHead>Active</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statuses.map((status, index) => (
                          <Draggable key={status.id} draggableId={status.id} index={index}>
                            {(provided, snapshot) => (
                              <TableRow
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={snapshot.isDragging ? 'bg-slate-100 dark:bg-slate-800' : ''}
                              >
                                <TableCell {...provided.dragHandleProps}>
                                  <GripVertical className="w-4 h-4 text-slate-400 dark:text-slate-500 cursor-grab" />
                                </TableCell>
                                <TableCell className="font-medium">{status.name}</TableCell>
                                <TableCell>
                                  <Badge className={`${getColorClass(status.color)} border`}>
                                    {status.name}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={status.is_active ? 'default' : 'secondary'}>
                                    {status.is_active ? 'Yes' : 'No'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEdit(status)}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(status)}
                                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </CardContent>
    </Card>
  );
}