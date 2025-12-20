import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Briefcase, Clock, AlertTriangle } from 'lucide-react';

const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function TechProjectClockInModal({ open, onClose, tech, initialProjectId, onSuccess }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open) {
      loadActiveProjects();
    }
  }, [open]);

  const loadActiveProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/Project`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });
      const data = await response.json();
      const allProjects = Array.isArray(data) ? data : (data?.records || []);
      
      // Filter active (not archived)
      const activeProjects = allProjects.filter(p => p.status !== 'archived');
      
      // Sort: if initialProjectId matches, put it first. Then newest created.
      activeProjects.sort((a, b) => {
        if (initialProjectId) {
          if (a.id === initialProjectId) return -1;
          if (b.id === initialProjectId) return 1;
        }
        return new Date(b.created_date) - new Date(a.created_date);
      });

      setProjects(activeProjects);
    } catch (error) {
      console.error("Error loading projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClockInToProject = async (project) => {
    if (!tech) return;
    setProcessing(true);

    try {
      const now = new Date().toISOString();
      const empName = tech.name || tech.full_name;
      const empEmail = tech.email;

      // 1. Find and end current active ProjectTimeSession
      // Using user_name for filtering as per schema
      const sessionsRes = await fetch(`${API_BASE_URL}/ProjectTimeSession?user_name=${encodeURIComponent(empName)}`, {
          headers: { 'api_key': WORKPRO_API_KEY }
      });
      
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        const sessions = Array.isArray(sessionsData) ? sessionsData : (sessionsData?.records || []);
        
        // Find session that has start_time but NO end_time
        const activeSession = sessions.find(s => s.start_time && !s.end_time);

        if (activeSession) {
          console.log("Ending active ProjectTimeSession:", activeSession.id);
          // End it
          const startTime = new Date(activeSession.start_time);
          const endTime = new Date();
          const totalHours = (endTime - startTime) / (1000 * 60 * 60);

          await fetch(`${API_BASE_URL}/ProjectTimeSession/${activeSession.id}`, {
            method: 'PUT',
            headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              end_time: now,
              total_hours: Math.round(totalHours * 100) / 100,
              status: 'completed'
            })
          });
        }
      }

      // 2. Find and end current active UnassignedTime
      // Changed from UnassignedTimeRecord to UnassignedTime
      // Using user_name for filtering
      const unassignedRes = await fetch(`${API_BASE_URL}/UnassignedTime?user_name=${encodeURIComponent(empName)}`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });
      
      if (unassignedRes.ok) {
        const unassignedData = await unassignedRes.json();
        const unassignedRecs = Array.isArray(unassignedData) ? unassignedData : (unassignedData?.records || []);
        
        // Filter for active
        const activeUnassigned = unassignedRecs.find(r => 
          r.start_time && !r.end_time
        );

        if (activeUnassigned) {
          console.log("Ending active UnassignedTime:", activeUnassigned.id);
          const startTime = new Date(activeUnassigned.start_time);
          const endTime = new Date();
          const duration = (endTime - startTime) / (1000 * 60 * 60);

          await fetch(`${API_BASE_URL}/UnassignedTime/${activeUnassigned.id}`, {
            method: 'PUT',
            headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              end_time: now,
              total_hours: Math.round(duration * 100) / 100, // Changed duration to total_hours to match user instructions
              status: 'completed'
            })
          });
        }
      }

      // 3. Create NEW ProjectTimeSession
      console.log("Creating new ProjectTimeSession for project:", project.id, project.name);
      const createRes = await fetch(`${API_BASE_URL}/ProjectTimeSession`, {
        method: 'POST',
        headers: { 'api_key': WORKPRO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          project_name: project.name,
          user_name: empName,
          user_email: empEmail || "",
          start_time: now,
          total_hours: 0,
          status: 'active'
        })
      });

      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error("Failed to create ProjectTimeSession:", errorText);
        throw new Error(`Failed to create session: ${createRes.status} ${createRes.statusText}`);
      }

      const createdSession = await createRes.json();
      console.log("Created ProjectTimeSession:", createdSession);

      if (onSuccess) onSuccess();
      onClose();

    } catch (error) {
      console.error("Error keying into project:", error);
      alert("Failed to clock into project");
    } finally {
      setProcessing(false);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.customer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.work_order?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Clock {tech?.name} into Project</DialogTitle>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input 
            placeholder="Search projects..." 
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No active projects found.
            </div>
          ) : (
            filteredProjects.map(project => (
              <div 
                key={project.id} 
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  project.id === initialProjectId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">{project.name}</h4>
                    {project.id === initialProjectId && (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Current Context</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                    {project.customer && <span>{project.customer}</span>}
                    {project.work_order && <span>{project.work_order}</span>}
                  </div>
                </div>
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 ml-4"
                  disabled={processing}
                  onClick={() => handleClockInToProject(project)}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
                  Clock In
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}