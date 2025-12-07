import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, User } from 'lucide-react';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

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
      // Fetch ProjectTimeSession directly from WorkPRO API
      const response = await fetch(`${API_BASE_URL}/ProjectTimeSession?project_id=${project.id}`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });

      if (!response.ok) {
        throw new Error(`WorkPRO API error: ${response.status}`);
      }

      const data = await response.json();
      const sessions = Array.isArray(data) ? data : (data?.records || []);

      // Map to expected format and sort by date and start time (most recent first)
      const sortedLogs = sessions
        .map(session => ({
          id: session.id,
          date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
          hours: parseFloat(session.total_hours) || 0,
          workpro_user_name: session.user_name || session.employee_name || 'Unknown User',
          workpro_start_time: session.start_time,
          workpro_end_time: session.end_time,
          notes: session.notes || '',
          isRunning: session.start_time && !session.end_time
        }))
        .sort((a, b) => {
          const dateCompare = new Date(b.date) - new Date(a.date);
          if (dateCompare !== 0) return dateCompare;
          
          if (a.workpro_start_time && b.workpro_start_time) {
            return new Date(b.workpro_start_time) - new Date(a.workpro_start_time);
          }
          return 0;
        });

      setTimeLogs(sortedLogs);
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

  const getTotalHours = () => {
    return timeLogs.reduce((sum, log) => sum + (log.hours || 0), 0).toFixed(1);
  };

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