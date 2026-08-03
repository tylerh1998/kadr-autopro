import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { MapPin, Plus, Edit, Search, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function LocationModal({ open, onClose, item, onUpdate }) {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(item?.location || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef(null);

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
      const { data, error } = await supabase
        .from('InventoryLocation')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      setLocations((data || []).sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '')));
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const filteredLocations = useMemo(() => {
    if (!selectedLocation) return locations;
    const searchLower = selectedLocation.toLowerCase();
    return locations.filter(loc => 
      (loc.location_name || '').toLowerCase().includes(searchLower)
    );
  }, [selectedLocation, locations]);

  const handleLocationChange = async () => {
    if (!item || !selectedLocation) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('InventoryItem')
        .update({
          location: selectedLocation,
          updated_date: new Date().toISOString()
        })
        .eq('id', item.id);
      if (error) throw error;
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
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const { error } = await supabase.from('InventoryLocation').insert([{
        id: crypto.randomUUID(),
        location_name: newLocationName.trim(),
        description: `Location: ${newLocationName.trim()}`,
        is_active: true,
        created_date: now,
        updated_date: now,
        created_by: authUser?.user_metadata?.full_name || authUser?.email || null,
        created_by_id: authUser?.id || null
      }]);
      if (error) throw error;

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
      const { error } = await supabase
        .from('InventoryLocation')
        .update({
          location_name: editLocationName.trim(),
          description: `Location: ${editLocationName.trim()}`,
          updated_date: new Date().toISOString()
        })
        .eq('id', editLocationId);
      if (error) throw error;

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
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedLocation || "Select location..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2">
                  <Input
                    ref={inputRef}
                    placeholder="Search locations..."
                    value={selectedLocation === item?.location ? '' : selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="mb-2"
                    autoFocus
                  />
                  <div className="max-h-[300px] overflow-y-auto space-y-1">
                    <div
                        onClick={() => {
                            setSelectedLocation('');
                            setSearchOpen(false);
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
                        >
                        <span className="text-slate-500 italic">No Location</span>
                        {(!selectedLocation || selectedLocation === '') && <Check className="ml-auto h-4 w-4" />}
                        </div>
                    {filteredLocations.length === 0 ? (
                        <div className="py-2 text-center text-sm text-slate-500">No locations found.</div>
                    ) : (
                        filteredLocations.map((location) => (
                        <div
                            key={location.id}
                            onClick={() => {
                                setSelectedLocation(location.location_name);
                                setSearchOpen(false);
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-slate-100"
                        >
                            <span>{location.location_name}</span>
                            {selectedLocation === location.location_name && (
                                <Check className="ml-auto h-4 w-4" />
                            )}
                        </div>
                        ))
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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