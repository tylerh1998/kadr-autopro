import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Clock, User, AlertCircle, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Plus } from 'lucide-react';

const CATEGORIES = {
  billable: { label: 'Billable', color: 'bg-blue-100 text-blue-800' },
  rework: { label: 'Rework', color: 'bg-red-100 text-red-800' },
  warranty: { label: 'Warranty', color: 'bg-orange-100 text-orange-800' },
  training: { label: 'Training', color: 'bg-purple-100 text-purple-800' },
  internal: { label: 'Internal', color: 'bg-slate-100 text-slate-800' },
  shop_work: { label: 'Shop Work', color: 'bg-green-100 text-green-800' },
  split: { label: 'Split', color: 'bg-yellow-100 text-yellow-800' }
};

function SplitTimeDialog({ open, onClose, onSave, log }) {
  const [allocations, setAllocations] = useState({});
  const totalHours = parseFloat(log?.hours || 0);

  useEffect(() => {
    if (open && log?.category) {
      try {
        const catObj = typeof log.category === 'string' ? JSON.parse(log.category) : log.category;
        setAllocations(catObj || {});
      } catch {
        setAllocations({});
      }
    } else if (open) {
      setAllocations({});
    }
  }, [open, log]);

  const handleAllocationChange = (key, value) => {
    setAllocations(prev => ({
      ...prev,
      [key]: value === '' ? '' : parseFloat(value)
    }));
  };

  const currentTotal = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const remaining = totalHours - currentTotal;
  const isValid = Math.abs(remaining) < 0.01; // Allow for tiny floating point differences

  const handleLabelClick = (key) => {
    if (remaining <= 0.001) return;

    const currentVal = parseFloat(allocations[key] || 0);
    const newVal = currentVal + remaining;
    // Round to 2 decimals
    const rounded = Math.round(newVal * 100) / 100;
    
    handleAllocationChange(key, rounded);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    
    // Filter out zero or empty allocations
    const finalAllocations = Object.entries(allocations).reduce((acc, [key, val]) => {
      const numVal = parseFloat(val);
      if (numVal > 0) {
        acc[key] = numVal;
      }
      return acc;
    }, {});

    onSave(finalAllocations);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Split Time Allocation</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="bg-slate-50 p-3 rounded-md mb-4 flex justify-between items-center">
             <div>
               <p className="text-sm font-medium text-slate-500">Total Time</p>
               <p className="text-xl font-bold">{totalHours.toFixed(2)} hrs</p>
             </div>
             <div className="text-right">
               <p className="text-sm font-medium text-slate-500">Remaining</p>
               <p className={`text-xl font-bold ${Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                 {remaining.toFixed(2)} hrs
               </p>
             </div>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {Object.entries(CATEGORIES)
              .filter(([key]) => key !== 'split')
              .map(([key, config]) => (
              <div key={key} className="grid grid-cols-2 gap-4 items-center">
                <div 
                  onClick={() => handleLabelClick(key)}
                  className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                  title="Click to assign remaining time"
                >
                  <Badge className={`w-full justify-center py-1.5 text-sm font-medium border-0 ${config.color}`}>
                    {config.label}
                  </Badge>
                </div>
                <div className="relative">
                  <Input
                    id={`cat-${key}`}
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={allocations[key] || ''}
                    onChange={(e) => handleAllocationChange(key, e.target.value)}
                    className={allocations[key] > 0 ? "border-blue-500 bg-blue-50 font-medium" : ""}
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">hrs</span>
                </div>
              </div>
            ))}
          </div>
          
          {!isValid && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              <span>Total allocation must equal {totalHours.toFixed(2)} hrs</span>
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!isValid}>Save Split</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TechTimeModal({ open, onClose, project, projects = [], workOrder, onTimeChange }) {
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [splitDialogLog, setSplitDialogLog] = useState(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [currentWorkOrder, setCurrentWorkOrder] = useState(null);
  const [manualLogs, setManualLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {
        console.error("Failed to load user", e);
      }
    };
    fetchUser();
  }, []);

  // Manual Add Form State
  const [manualDate, setManualDate] = useState(() => {
    // Default to current date in Mountain Time
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  });
  const [manualTech, setManualTech] = useState('');
  const [manualHours, setManualHours] = useState('');

  useEffect(() => {
    let timeoutId;
    if (open && (projects.length > 0 || project?.id || workOrder?.id)) {
      // Debounce the load to prevent rapid multiple calls
      timeoutId = setTimeout(() => {
        loadTimeLogs();
        loadEmployees();
      }, 300);
    }
    return () => clearTimeout(timeoutId);
  }, [open, projects.length, project?.id, workOrder?.id, workOrder?.tech_time]);

  const loadEmployees = async () => {
    try {
      const allEmployees = await base44.entities.Employee.list();
      // Filter for techs as requested
      const techs = allEmployees.filter(e => e.employee_type === 'tech' && e.is_active !== false);
      setEmployees(techs);
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const loadTimeLogs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Fetch WorkPRO Logs (from ALL projects)
      let fetchedLogs = [];
      const projectsToLoad = projects.length > 0 ? projects : (project?.id ? [project] : []);

      if (projectsToLoad.length > 0) {
        // Process in batches to avoid 429 errors
        const BATCH_SIZE = 3;
        for (let i = 0; i < projectsToLoad.length; i += BATCH_SIZE) {
          const batch = projectsToLoad.slice(i, i + BATCH_SIZE);
          const promises = batch.map(p => 
            base44.functions.invoke('autopro-getProjectTimeSessions', { projectId: p.id })
          );
          
          const responses = await Promise.all(promises);
          
          responses.forEach(response => {
             if (response.data?.success && Array.isArray(response.data.logs)) {
               fetchedLogs = [...fetchedLogs, ...response.data.logs];
             } else {
               console.error('Failed to fetch WorkPRO logs for a project:', response.data?.error);
             }
          });

          // Small delay between batches to respect rate limits
          if (i + BATCH_SIZE < projectsToLoad.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        // Remove duplicates if any
        fetchedLogs = Array.from(new Map(fetchedLogs.map(log => [log.id, log])).values());
      }

      // 2. Fetch Manual Logs if WorkOrder exists
      let fetchedManualLogs = [];
      let targetWO = null;

      if (workOrder?.id) {
        try {
           const response = await base44.functions.invoke('SupabaseProxy', {
             action: 'read',
             table: 'WorkOrder',
             match: { id: workOrder.id }
           });
           const wos = response.data?.data || [];
           targetWO = (wos && wos.length > 0) ? wos[0] : workOrder;
        } catch (e) {
           console.error("Error fetching latest WO:", e);
           targetWO = workOrder;
        }
      } else {
        const proj = projects.length > 0 ? projects[0] : project;
        if (proj?.work_order) {
          let response = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'WorkOrder',
            match: { wo_number: proj.work_order }
          });
          let wos = response.data?.data || [];

          if ((!wos || wos.length === 0) && proj.work_order) {
             response = await base44.functions.invoke('SupabaseProxy', {
               action: 'read',
               table: 'WorkOrder',
               match: { ro_number: proj.work_order }
             });
             wos = response.data?.data || [];
          }

          if (wos && wos.length > 0) {
            targetWO = wos[0];
          }
        }
      }

      if (targetWO) {
        setCurrentWorkOrder(targetWO);
        if (targetWO.tech_time) {
          try {
            fetchedManualLogs = JSON.parse(targetWO.tech_time);
          } catch (e) {
            console.error('Error parsing tech_time:', e);
          }
        }
      } else {
        setCurrentWorkOrder(null);
      }

      setTimeLogs(fetchedLogs);
      setManualLogs(fetchedManualLogs);

    } catch (error) {
      console.error('Error loading tech time logs:', error);
      setError(`Failed to load tech time data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveManualTime = async () => {
    const targetId = currentWorkOrder?.id || workOrder?.id;
    if (!targetId || !manualTech || !manualHours) {
        console.error("Cannot save manual time: missing WO ID or input fields", { targetId, manualTech, manualHours });
        return;
    }

    try {
      const newLog = {
        id: `manual-${Date.now()}`,
        date: manualDate,
        tech_name: manualTech,
        hours: parseFloat(manualHours),
        category: 'manual',
        created_at: new Date().toISOString()
      };

      // 1. Fetch fresh data
      let currentLogs = [];
      try {
          const response = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'WorkOrder',
            match: { id: targetId }
          });
          const wos = response.data?.data || [];
          if (wos && wos.length > 0) {
             const freshWO = wos[0];
             if (freshWO.tech_time) {
                 currentLogs = typeof freshWO.tech_time === 'string' ? JSON.parse(freshWO.tech_time) : freshWO.tech_time;
             }
          } else {
             throw new Error(`WorkOrder ${targetId} not found`);
          }
      } catch (e) {
          console.error("Error fetching fresh WO for save:", e);
          // Only fallback to local state if fetch failed (e.g. network)
          // But safer to fail if we can't confirm state? 
          // Let's assume empty if we can't fetch, or use existing manualLogs if array
          currentLogs = Array.isArray(manualLogs) ? manualLogs : [];
      }

      // Ensure array
      if (!Array.isArray(currentLogs)) currentLogs = [];

      const updatedLogs = [...currentLogs, newLog];
      const jsonString = JSON.stringify(updatedLogs);
      
      // 2. Update DB
      await base44.functions.invoke('SupabaseProxy', {
        action: 'update',
        table: 'WorkOrder',
        id: targetId,
        data: {
          tech_time: jsonString
        }
      });

      // 3. Update local state
      setManualLogs(updatedLogs);
      setShowManualAdd(false);
      setManualTech('');
      setManualHours('');

      // 4. Notify parent
      if (onTimeChange) {
        await onTimeChange();
      }
      
    } catch (error) {
      console.error('Error saving manual time:', error);
      alert(`Failed to save manual time: ${error.message}`);
    }
  };

  const handleDeleteManualTime = async (logToDelete) => {
    if (!confirm('Are you sure you want to delete this manual time entry?')) return;
    
    const targetId = currentWorkOrder?.id || workOrder?.id;
    if (!targetId) {
        console.error("Cannot delete: missing WO ID");
        return;
    }

    try {
      // 1. Fetch fresh data
      let currentLogs = [];
      try {
          const response = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'WorkOrder',
            match: { id: targetId }
          });
          const wos = response.data?.data || [];
          if (wos && wos.length > 0) {
             const freshWO = wos[0];
             if (freshWO.tech_time) {
                 currentLogs = typeof freshWO.tech_time === 'string' ? JSON.parse(freshWO.tech_time) : freshWO.tech_time;
             }
          } else {
             throw new Error("WorkOrder not found");
          }
      } catch (e) {
          console.error("Error fetching fresh WO for delete:", e);
          currentLogs = Array.isArray(manualLogs) ? manualLogs : [];
      }

      if (!Array.isArray(currentLogs)) currentLogs = [];

      const updatedLogs = currentLogs.filter(l => l.id !== logToDelete.id);
      const jsonString = JSON.stringify(updatedLogs);

      // 2. Update DB
      await base44.functions.invoke('SupabaseProxy', {
        action: 'update',
        table: 'WorkOrder',
        id: targetId,
        data: {
          tech_time: jsonString
        }
      });

      // 3. Update local state
      setManualLogs(updatedLogs);

      // 4. Notify parent
      if (onTimeChange) {
        await onTimeChange();
      }
      
    } catch (error) {
      console.error('Error deleting manual time:', error);
      alert(`Failed to delete manual time: ${error.message}`);
    }
  };

  // Merge and sort all logs for display
  const allLogs = [
    ...timeLogs.map(l => ({ ...l, source: 'workpro' })),
    ...manualLogs.map(l => ({
      id: l.id,
      date: l.date,
      hours: l.hours,
      workpro_user_name: l.tech_name, // Map to display field
      source: 'manual',
      category: 'manual', // Force category
      isRunning: false
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first

  const formatTime = (dateTimeString) => {
    if (!dateTimeString) return 'N/A';
    try {
      return new Date(dateTimeString).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Edmonton'
      });
    } catch {
      return 'Invalid';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Edmonton'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const getDisplayHours = (log) => {
    if (log.isRunning && log.workpro_start_time) {
      const startTime = new Date(log.workpro_start_time);
      const now = new Date();
      const elapsedHours = (now - startTime) / (1000 * 60 * 60);
      return elapsedHours.toFixed(1);
    }
    return log.hours;
  };

  const getCategory = (log) => {
    if (log.category) {
      try {
        const catObj = typeof log.category === 'string' ? JSON.parse(log.category) : log.category;
        const keys = Object.keys(catObj);
        if (keys.length > 1) return 'split';
        const key = keys[0];
        if (key && CATEGORIES[key]) return key;
      } catch {
        // ignore error
      }
    }
    // Fallback to project default if available, or billable
    const proj = projects.find(p => p.id === log.project_id) || project;
    return proj?.default_category || 'billable';
  };

  const handleCategoryChange = (log, newCategory) => {
    if (newCategory === 'split') {
      setSplitDialogLog(log);
      return;
    }
    
    const currentCategory = getCategory(log);
    if (currentCategory === newCategory) return;

    const hours = parseFloat(log.hours) || 0;
    const categoryObj = { [newCategory]: hours };
    updateLog(log, categoryObj);
  };

  const handleSplitSave = async (allocations) => {
    if (!splitDialogLog) return;
    
    // Create note text
    const breakdownText = Object.entries(allocations)
      .map(([key, hours]) => `${CATEGORIES[key]?.label || key}: ${hours}h`)
      .join(', ');
      
    const noteText = `Split Time: ${breakdownText}`;
    
    // Append to existing notes or create new
    const currentNotes = splitDialogLog.notes || '';
    const newNotes = currentNotes ? `${currentNotes}\n${noteText}` : noteText;
    
    await updateLog(splitDialogLog, allocations, newNotes);
    setSplitDialogLog(null);
  };

  const updateLog = async (log, categoryObj, newNotes = null) => {
    // Optimistic update
    setTimeLogs(prev => prev.map(l => {
      if (l.id === log.id) {
        return { 
          ...l, 
          category: categoryObj,
          notes: newNotes !== null ? newNotes : l.notes
        };
      }
      return l;
    }));

    try {
      const params = { category: categoryObj };
      if (newNotes !== null) {
        params.notes = newNotes;
      }

      await base44.functions.invoke('workProProxy', {
        entityName: 'ProjectTimeSession',
        method: 'update',
        id: log.id,
        params: params
      });
    } catch (error) {
      console.error('Error updating log:', error);
      alert(`Failed to update: ${error.message}`);
      // Revert on error (reload logs)
      loadTimeLogs();
    }
  };

  const getTotalHours = () => {
    return allLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0).toFixed(1);
  };

  const getTechBreakdown = () => {
    const breakdown = {};
    allLogs.forEach(log => {
      const name = log.workpro_user_name || 'Unknown User';
      breakdown[name] = (breakdown[name] || 0) + (parseFloat(log.hours) || 0);
    });
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  };

  const techBreakdown = getTechBreakdown();
  const showBreakdown = techBreakdown.length > 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Tech Time Sessions</span>
            <div className="flex items-center gap-3">
              {currentWorkOrder && !showManualAdd && (
                 <Button size="sm" variant="outline" onClick={() => setShowManualAdd(true)}>
                   <Plus className="w-4 h-4 mr-2" /> Manual Add
                 </Button>
              )}
              <Badge variant="outline" className="text-lg font-semibold">
                Total: {getTotalHours()} hrs
              </Badge>
            </div>
          </DialogTitle>
          {project && (
            <p className="text-sm text-slate-600 mt-1">
              {project.name || project.customer}
            </p>
          )}
        </DialogHeader>

        {showManualAdd && (
          <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200">
            <h3 className="font-semibold mb-3 text-sm">Add Manual Time Record</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label className="text-xs mb-1.5 block">Date</Label>
                <Input 
                  type="date" 
                  value={manualDate} 
                  onChange={(e) => setManualDate(e.target.value)} 
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Technician Name</Label>
                <Select value={manualTech} onValueChange={setManualTech}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.full_name}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Hours</Label>
                <Input 
                  type="number" 
                  step="0.1" 
                  placeholder="0.0" 
                  value={manualHours} 
                  onChange={(e) => setManualHours(e.target.value)} 
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowManualAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveManualTime} disabled={!manualTech || !manualHours}>Save Record</Button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">{error}</p>
            <p className="text-yellow-600 text-xs mt-1">Showing cached data if available.</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : allLogs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600">No tech time sessions recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {showBreakdown && (
              <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Technician Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {techBreakdown.map(([name, hours]) => (
                    <div key={name} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                      <span className="text-sm text-slate-600 truncate mr-2" title={name}>{name}</span>
                      <Badge variant="secondary" className="font-mono">
                        {hours.toFixed(1)}h
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {allLogs.map((log) => (
              <Card key={log.id} className="hover:shadow-md transition-shadow">
                <CardContent className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <span className="font-semibold text-slate-900">
                          {log.workpro_user_name || 'Unknown User'}
                        </span>
                        {log.source === 'manual' && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1 bg-gray-50">Manual</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <span>{formatDate(log.date)}</span>
                        {log.workpro_start_time && (
                          <span>
                            {formatTime(log.workpro_start_time)}
                            {log.workpro_end_time ? ` - ${formatTime(log.workpro_end_time)}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.source === 'manual' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteManualTime(log)}
                          title="Delete manual entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {!log.isRunning && (
                        <Select 
                          value={log.source === 'manual' ? 'manual' : getCategory(log)} 
                          onValueChange={(val) => handleCategoryChange(log, val)}
                          disabled={log.source === 'manual'}
                        >
                          <SelectTrigger className={`w-[120px] h-8 text-xs font-medium border-0 ${log.source === 'manual' ? 'bg-gray-100 text-gray-800' : CATEGORIES[getCategory(log)]?.color}`}>
                            <SelectValue>
                                {log.source === 'manual' ? 'Manual' : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORIES).map(([key, config]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {config.label}
                              </SelectItem>
                            ))}
                            {log.source === 'manual' && (
                               <SelectItem value="manual" className="text-xs">Manual</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      
                      <Badge className={`font-bold ${log.isRunning ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {getDisplayHours(log)} hrs
                      </Badge>
                      <Badge className={log.isRunning ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
                        {log.isRunning ? "Running" : "Completed"}
                      </Badge>
                    </div>
                  </div>
                  {log.notes && (
                    <div className="mt-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                      <p className="text-sm text-slate-700">{log.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>

      <SplitTimeDialog 
        open={!!splitDialogLog} 
        onClose={() => setSplitDialogLog(null)} 
        onSave={handleSplitSave}
        log={splitDialogLog}
      />
    </Dialog>
  );
}