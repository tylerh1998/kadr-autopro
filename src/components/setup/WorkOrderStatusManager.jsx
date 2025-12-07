import React, { useState, useEffect } from 'react';
import { WorkOrderStatus } from '@/entities/all';
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
  { value: 'slate', label: 'Slate', class: 'bg-slate-100 text-slate-800 border-slate-300' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'green', label: 'Green', class: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'red', label: 'Red', class: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 text-pink-800 border-pink-300' },
];

export default function WorkOrderStatusManager() {
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
      const data = await WorkOrderStatus.list();
      const sorted = data.sort((a, b) => a.display_order - b.display_order);
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
      await Promise.all(
        updatedItems.map(item =>
          WorkOrderStatus.update(item.id, { display_order: item.display_order })
        )
      );
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
        await WorkOrderStatus.update(editingStatus.id, formData);
      } else {
        const maxOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.display_order)) : 0;
        await WorkOrderStatus.create({
          ...formData,
          display_order: maxOrder + 1
        });
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
      await WorkOrderStatus.delete(status.id);
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
    return <div className="text-center py-8 text-slate-600">Loading statuses...</div>;
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
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
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
          <p className="text-sm text-slate-600 mb-3">
            Drag and drop to reorder statuses. The order determines how they appear in lists and dropdowns.
          </p>
          
          {statuses.length === 0 ? (
            <p className="text-center py-8 text-slate-500">No statuses defined yet. Click "Add Status" to create one.</p>
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
                                className={snapshot.isDragging ? 'bg-slate-100' : ''}
                              >
                                <TableCell {...provided.dragHandleProps}>
                                  <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
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
                                      className="text-red-600 hover:text-red-700"
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