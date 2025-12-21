import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const CATEGORIES = {
  billable: { label: 'Billable', color: 'bg-blue-100 text-blue-800' },
  rework: { label: 'Rework', color: 'bg-red-100 text-red-800' },
  warranty: { label: 'Warranty', color: 'bg-orange-100 text-orange-800' },
  training: { label: 'Training', color: 'bg-purple-100 text-purple-800' },
  internal: { label: 'Internal', color: 'bg-slate-100 text-slate-800' },
  shop_work: { label: 'Shop Work', color: 'bg-green-100 text-green-800' },
  split: { label: 'Split', color: 'bg-yellow-100 text-yellow-800' }
};

export default function TechTimeModal({ open, onClose, project }) {
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && project?.id) {
      loadTimeLogs();
    }
  }, [open, project?.id]);

  const loadTimeLogs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await base44.functions.invoke('getProjectTimeSessions', { 
        projectId: project.id 
      });

      if (response.data?.success) {
        setTimeLogs(response.data.logs);
      } else {
        throw new Error(response.data?.error || 'Failed to fetch time logs');
      }
    } catch (error) {
      console.error('Error loading tech time logs:', error);
      setError(`Failed to load tech time data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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
        const key = Object.keys(catObj)[0];
        if (key && CATEGORIES[key]) return key;
      } catch {
        // ignore error
      }
    }
    return project?.default_category || 'billable';
  };

  const handleCategoryChange = async (log, newCategory) => {
    const currentCategory = getCategory(log);
    if (currentCategory === newCategory) return;

    if (!log.id) {
        console.error("Missing log ID", log);
        alert("Cannot update: Missing Log ID");
        return;
    }

    const hours = parseFloat(log.hours) || 0;
    const categoryObj = { [newCategory]: hours };

    // Optimistic update
    setTimeLogs(prev => prev.map(l => {
      if (l.id === log.id) {
        return { 
          ...l, 
          category: categoryObj 
        };
      }
      return l;
    }));

    try {
      await base44.functions.invoke('workProProxy', {
        entityName: 'ProjectTimeSession',
        method: 'update',
        id: log.id,
        params: { category: categoryObj }
      });
    } catch (error) {
      console.error('Error updating category:', error);
      alert(`Failed to update category: ${error.message}`);
      // Revert on error (reload logs)
      loadTimeLogs();
    }
  };

  const getTotalHours = () => {
    return timeLogs.reduce((sum, log) => sum + (log.hours || 0), 0).toFixed(1);
  };

  const getTechBreakdown = () => {
    const breakdown = {};
    timeLogs.forEach(log => {
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
            <Badge variant="outline" className="text-lg font-semibold">
              Total: {getTotalHours()} hrs
            </Badge>
          </DialogTitle>
          {project && (
            <p className="text-sm text-slate-600 mt-1">
              {project.name || project.customer}
            </p>
          )}
        </DialogHeader>

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
        ) : timeLogs.length === 0 ? (
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
            {timeLogs.map((log) => (
              <Card key={log.id} className="hover:shadow-md transition-shadow">
                <CardContent className="px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <span className="font-semibold text-slate-900">
                          {log.workpro_user_name || 'Unknown User'}
                        </span>
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
                      {!log.isRunning && (
                        <Select 
                          value={getCategory(log)} 
                          onValueChange={(val) => handleCategoryChange(log, val)}
                        >
                          <SelectTrigger className={`w-[120px] h-8 text-xs font-medium border-0 ${CATEGORIES[getCategory(log)]?.color}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORIES).map(([key, config]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {config.label}
                              </SelectItem>
                            ))}
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
    </Dialog>
  );
}