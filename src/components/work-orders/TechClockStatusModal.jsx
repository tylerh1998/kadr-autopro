import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Clock, Briefcase } from 'lucide-react';
import { Employee } from '@/entities/all';
import TechProjectClockInModal from './TechProjectClockInModal';
import GlobalClockInModal from './GlobalClockInModal';
import { useTechClockStatus } from '../context/TechClockStatusContext';

const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

export default function TechClockStatusModal({ open, onClose }) {
  const [techStatuses, setTechStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { initialProjectId } = useTechClockStatus();
  const [selectedTech, setSelectedTech] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showGlobalClockInModal, setShowGlobalClockInModal] = useState(false);

  useEffect(() => {
    if (open) {
      loadTechStatuses();
    }
  }, [open]);

  const handleTechClick = (tech) => {
    setSelectedTech(tech);
    
    if (tech.status === 'clocked_out') {
      // If clocked out, open Global Clock In modal
      setShowGlobalClockInModal(true);
    } else {
      // If active (unassigned or project), open Project Clock In modal
      setShowProjectModal(true);
    }
  };

  const handleProjectClockInSuccess = () => {
    setShowProjectModal(false);
    setSelectedTech(null);
    loadTechStatuses(); 
  };

  const handleGlobalClockInSuccess = () => {
    setShowGlobalClockInModal(false);
    setSelectedTech(null);
    loadTechStatuses();
  };

  const loadTechStatuses = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch local employees (techs only)
      const employees = await Employee.filter({ employee_type: 'tech' });
      
      // Fetch WorkPRO TimeRecord (global clock in/out)
      const timeRecordResponse = await fetch(`${API_BASE_URL}/TimeRecord`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });
      const timeRecordData = await timeRecordResponse.json();
      const timeRecords = Array.isArray(timeRecordData) ? timeRecordData : (timeRecordData?.records || []);

      // Fetch WorkPRO ProjectTimeSession (project clock in)
      const projectSessionResponse = await fetch(`${API_BASE_URL}/ProjectTimeSession`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });
      const projectSessionData = await projectSessionResponse.json();
      const projectSessions = Array.isArray(projectSessionData) ? projectSessionData : (projectSessionData?.records || []);

      // Fetch WorkPRO Projects for names
      const projectsResponse = await fetch(`${API_BASE_URL}/Project`, {
        headers: { 'api_key': WORKPRO_API_KEY }
      });
      const projectsData = await projectsResponse.json();
      const projects = Array.isArray(projectsData) ? projectsData : (projectsData?.records || []);

      // Build project lookup by ID
      const projectLookup = {};
      projects.forEach(p => {
        projectLookup[p.id] = p.customer || p.name || 'Unknown Project';
      });

      // Find active global clock-ins (status is "active" or "clocked_in")
      const activeGlobalClockIns = timeRecords.filter(tr => 
        (tr.status === 'active' || tr.status === 'clocked_in') && !tr.clock_out_time
      );

      // Find active project sessions (has start_time but no end_time)
      const activeProjectSessions = projectSessions.filter(ps => ps.start_time && !ps.end_time);

      // Build status for each tech
      const statuses = employees.map(emp => {
        const empEmail = emp.email?.toLowerCase();
        const empName = emp.full_name || `${emp.first_name} ${emp.last_name}`.trim();

        // Check if clocked into a project (by email or name match)
        const projectSession = activeProjectSessions.find(ps => 
          ps.user_email?.toLowerCase() === empEmail || 
          ps.user_name?.toLowerCase() === empName.toLowerCase() ||
          ps.employee_name?.toLowerCase() === empName.toLowerCase()
        );

        if (projectSession) {
          const projectName = projectLookup[projectSession.project_id] || 'Unknown Project';
          return {
            id: emp.id,
            name: empName,
            status: 'project',
            projectName: projectName
          };
        }

        // Check if globally clocked in (by name match since TimeRecord uses employee_name)
        const globalClockIn = activeGlobalClockIns.find(tr => 
          tr.employee_name?.toLowerCase() === empName.toLowerCase()
        );

        if (globalClockIn) {
          return {
            id: emp.id,
            name: empName,
            status: 'unassigned',
            projectName: null
          };
        }

        // Not clocked in at all
        return {
          id: emp.id,
          name: empName,
          full_name: empName, // Ensure full_name is available for GlobalClockInModal
          status: 'clocked_out',
          projectName: null
        };
      });

      // Sort: project first, then unassigned, then clocked out
      statuses.sort((a, b) => {
        const order = { project: 0, unassigned: 1, clocked_out: 2 };
        return order[a.status] - order[b.status];
      });

      setTechStatuses(statuses);
    } catch (err) {
      console.error('Error loading tech statuses:', err);
      setError('Failed to load tech clock statuses');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status, projectName) => {
    switch (status) {
      case 'project':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <Briefcase className="w-3 h-3 mr-1" />
            {projectName}
          </Badge>
        );
      case 'unassigned':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="w-3 h-3 mr-1" />
            Unassigned
          </Badge>
        );
      case 'clocked_out':
        return (
          <Badge className="bg-slate-100 text-slate-600 border-slate-200">
            Clocked Out
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Tech Clock Status
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            {error}
          </div>
        ) : techStatuses.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No technicians found
          </div>
        ) : (
          <div className="space-y-2 py-2">
            {techStatuses.map((tech) => (
              <div 
                key={tech.id} 
                onClick={() => handleTechClick(tech)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer hover:bg-blue-50 hover:border-blue-200 shadow-sm ${
                  tech.status === 'clocked_out' 
                    ? 'bg-slate-50 border-slate-200' 
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className={`w-4 h-4 ${tech.status === 'clocked_out' ? 'text-slate-400' : 'text-slate-600'}`} />
                  <span className={`font-medium ${tech.status === 'clocked_out' ? 'text-slate-500' : 'text-slate-900'}`}>
                    {tech.name}
                  </span>
                </div>
                {getStatusBadge(tech.status, tech.projectName)}
              </div>
            ))}
          </div>
        )}

        <TechProjectClockInModal 
          open={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          tech={selectedTech}
          initialProjectId={initialProjectId}
          onSuccess={handleProjectClockInSuccess}
        />

        <GlobalClockInModal
          open={showGlobalClockInModal}
          onClose={() => setShowGlobalClockInModal(false)}
          user={selectedTech}
          onClockIn={handleGlobalClockInSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}