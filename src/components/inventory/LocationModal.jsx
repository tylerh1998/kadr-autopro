import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InventoryItem, InventoryLocation } from '@/entities/all';
import { MapPin, Plus, Edit } from 'lucide-react';

export default function LocationModal({ open, onClose, item, onUpdate }) {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(item?.location || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadLocations();
      setSelectedLocation(item?.location || '');
      setShowAddForm(false);
      setShowEditForm(false);
      setNewLocationName('');
      setEditLocationName('');
    }
  }, [open, item]);

  const loadLocations = async () => {
    try {
      const data = await InventoryLocation.filter({ is_active: true });
      setLocations(data);
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const handleLocationChange = async () => {
    if (!item || !selectedLocation) return;

    setLoading(true);
    try {
      await InventoryItem.update(item.id, { location: selectedLocation });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating location:', error);
      alert('Failed to update location.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) {
      alert('Please enter a location name.');
      return;
    }

    try {
      await InventoryLocation.create({
        location_name: newLocationName.trim(),
        description: `Location: ${newLocationName.trim()}`,
        is_active: true
      });
      
      setNewLocationName('');
      setShowAddForm(false);
      loadLocations();
      alert('Location added successfully!');
    } catch (error) {
      console.error('Error adding location:', error);
      alert('Failed to add location.');
    }
  };

  const handleEditLocation = async () => {
    if (!editLocationName.trim() || !editLocationId) {
      alert('Please enter a valid location name.');
      return;
    }

    try {
      await InventoryLocation.update(editLocationId, {
        location_name: editLocationName.trim(),
        description: `Location: ${editLocationName.trim()}`
      });
      
      setEditLocationName('');
      setShowEditForm(false);
      setEditLocationId('');
      loadLocations();
      alert('Location updated successfully!');
    } catch (error) {
      console.error('Error updating location:', error);
      alert('Failed to update location.');
    }
  };

  const handleEditLocationClick = () => {
    const locationObj = locations.find(loc => loc.location_name === selectedLocation);
    if (locationObj) {
      setEditLocationId(locationObj.id);
      setEditLocationName(locationObj.location_name);
      setShowEditForm(true);
      setShowAddForm(false);
    } else {
      alert('Please select a location to edit.');
    }
  };

  const handleAddLocationClick = () => {
    setShowAddForm(true);
    setShowEditForm(false);
    setNewLocationName('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Manage Location: {item?.part_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Current Location</Label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No Location</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.location_name}>
                    {location.location_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleEditLocationClick}
              className="flex-1"
              disabled={!selectedLocation}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Location
            </Button>
            <Button
              variant="outline"
              onClick={handleAddLocationClick}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </div>

          {showAddForm && (
            <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
              <Label>New Location Name</Label>
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="Enter location name"
              />
              <Button onClick={handleAddLocation} className="w-full">
                Submit New Location
              </Button>
            </div>
          )}

          {showEditForm && (
            <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
              <Label>Edit Location Name</Label>
              <Input
                value={editLocationName}
                onChange={(e) => setEditLocationName(e.target.value)}
                placeholder="Enter location name"
              />
              <Button onClick={handleEditLocation} className="w-full">
                Submit Changes
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleLocationChange} 
            disabled={loading || !selectedLocation}
          >
            {loading ? 'Updating...' : 'Update Location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}