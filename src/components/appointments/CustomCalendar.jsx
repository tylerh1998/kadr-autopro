import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Trash2, Edit2, Move, Users } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, differenceInMinutes, addMinutes } from 'date-fns';
import CellAppointmentsModal from './CellAppointmentsModal';
import WorkPROModal from '../work-orders/WorkPROModal';

// Constants for layout
const SLOT_DURATION_MINUTES = 30;
const MIN_SLOT_HEIGHT_PX = 60;

export default function CustomCalendar({
  events,
  onSelectSlot,
  onSelectEvent,
  onEventDrop,
  loading,
  onOpenWorkOrder,
  onDeleteAppointment,
  bayColors,
  techColors,
  employees,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('week');
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateTimeoutRef = useRef(null);

  const [contextMenu, setContextMenu] = useState(null);
  const [moveMode, setMoveMode] = useState(false);
  const [appointmentToMove, setAppointmentToMove] = useState(null);

  // State variables for CellAppointmentsModal
  const [showCellAppointmentsModal, setShowCellAppointmentsModal] = useState(false);
  const [selectedCellAppointments, setSelectedCellAppointments] = useState([]);
  const [selectedCellSlotInfo, setSelectedCellSlotInfo] = useState(null);

  // State for WorkPRO Modal
  const [showWorkPROModal, setShowWorkPROModal] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

  const parseTimeString = useCallback((timeString, day) => {
    const [hour, minute] = timeString.split(':').map(Number);
    const newDate = new Date(day);
    newDate.setHours(hour, minute, 0, 0);
    return newDate;
  }, []);

  const techResources = useMemo(() => {
    return employees.map(emp => ({
      id: emp.id,
      title: `${emp.first_name} ${emp.last_name}`,
    }));
  }, [employees]);

  const formattedEvents = useMemo(() => {
    return events.map(event => {
      const startDate = event.start_time instanceof Date ? event.start_time : new Date(event.start_time);
      const endDate = event.end_time instanceof Date ? event.end_time : new Date(event.end_time);
      
      const tech = employees.find(emp => emp.id === event.employee_id);

      let bayId = event.bay;
      if (bayId === 'Floor') {
          bayId = 'Main Floor';
      }

      return {
        ...event,
        start: startDate,
        end: endDate,
        resourceId: event.employee_id,
        bayId: bayId,
        tech: tech,
      };
    });
  }, [events, employees]);

  const getBayColorClass = useCallback((bay) => {
    const bayColorMap = {
      'Floor': 'bg-orange-100 border-orange-300 dark:bg-orange-950/40 dark:border-orange-800/60 dark:text-orange-300',
      'Main Floor': 'bg-orange-100 border-orange-300 dark:bg-orange-950/40 dark:border-orange-800/60 dark:text-orange-300',
      'Main Hoist': 'bg-green-100 border-green-300 dark:bg-green-950/40 dark:border-green-800/60 dark:text-green-300',
      'North Floor': 'bg-purple-100 border-purple-300 dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-300',
      'North Hoist': 'bg-yellow-100 border-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-800/60 dark:text-yellow-300',
      'Outside': 'bg-slate-100 border-slate-300 dark:bg-slate-900/50 dark:border-slate-700/50 dark:text-slate-300',
      'Other': 'bg-pink-100 border-pink-300 dark:bg-pink-950/40 dark:border-pink-800/60 dark:text-pink-300',
    };
    return bayColorMap[bay] || 'bg-slate-100 border-slate-300 dark:bg-slate-900/50 dark:border-slate-700/50 dark:text-slate-300';
  }, []);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 8; hour < 12; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    for (let hour = 13; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }, []);

  const bayOptions = ['Main Floor', 'Main Hoist', 'North Floor', 'North Hoist', 'Other'];

  const displayDays = useMemo(() => {
    if (view === 'day') {
      return [currentDate];
    } else if (view === 'week') {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return eachDayOfInterval({ start, end });
    }
  }, [currentDate, view]);

  // Group appointments by day for week view (must be at component level, not inside render function)
  const groupedWeekAppointments = useMemo(() => {
    if (view !== 'week') return {};
    
    const grouped = {};
    displayDays.forEach(day => {
      const dayKey = day.toISOString();
      const dayEvents = formattedEvents.filter(event => isSameDay(event.start, day));
      dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
      
      const dayClusters = [];
      const processedIds = new Set();

      for (const event of dayEvents) {
        if (processedIds.has(event.id)) continue;

        let cluster = {
          appointments: [event],
          earliestStart: event.start,
          latestEnd: event.end,
          type: 'single'
        };
        processedIds.add(event.id);

        // Find all overlapping events
        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const other of dayEvents) {
            if (!processedIds.has(other.id)) {
              if (other.start < cluster.latestEnd && other.end > cluster.earliestStart) {
                cluster.appointments.push(other);
                cluster.earliestStart = new Date(Math.min(cluster.earliestStart.getTime(), other.start.getTime()));
                cluster.latestEnd = new Date(Math.max(cluster.latestEnd.getTime(), other.end.getTime()));
                cluster.type = 'group';
                processedIds.add(other.id);
                expanded = true;
              }
            }
          }
        }
        
        if (cluster.appointments.length > 1) {
          cluster.appointments.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
        
        dayClusters.push(cluster);
      }
      
      grouped[dayKey] = dayClusters;
    });
    return grouped;
  }, [view, displayDays, formattedEvents]);

  // Group appointments by Bay for Day view
  const groupedDayAppointments = useMemo(() => {
    if (view !== 'day') return {};
    
    const grouped = {};
    const day = currentDate;
    const dayEvents = formattedEvents.filter(event => isSameDay(event.start, day));
    
    bayOptions.forEach(bay => {
      const bayEvents = dayEvents.filter(event => event.bayId === bay);
      bayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
      
      const bayClusters = [];
      const processedIds = new Set();

      for (const event of bayEvents) {
        if (processedIds.has(event.id)) continue;

        let cluster = {
          appointments: [event],
          earliestStart: event.start,
          latestEnd: event.end,
          type: 'single'
        };
        processedIds.add(event.id);

        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const other of bayEvents) {
            if (!processedIds.has(other.id)) {
              if (other.start < cluster.latestEnd && other.end > cluster.earliestStart) {
                cluster.appointments.push(other);
                cluster.earliestStart = new Date(Math.min(cluster.earliestStart.getTime(), other.start.getTime()));
                cluster.latestEnd = new Date(Math.max(cluster.latestEnd.getTime(), other.end.getTime()));
                cluster.type = 'group';
                processedIds.add(other.id);
                expanded = true;
              }
            }
          }
        }
        
        if (cluster.appointments.length > 1) {
          cluster.appointments.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
        
        bayClusters.push(cluster);
      }
      grouped[bay] = bayClusters;
    });
    return grouped;
  }, [view, currentDate, formattedEvents, bayOptions]);



  // Helper: Calculate how many 30-minute slots an event spans
  const calculateEventSlotSpan = useCallback((event) => {
    const durationMinutes = differenceInMinutes(event.end, event.start);
    return Math.ceil(durationMinutes / SLOT_DURATION_MINUTES);
  }, []);

  // Helper: Check if an event starts at a specific time slot
  const eventStartsAtSlot = useCallback((event, slotTime) => {
    const slotEnd = addMinutes(slotTime, SLOT_DURATION_MINUTES);
    return event.start >= slotTime && event.start < slotEnd;
  }, []);

  // Helper: Get all events that overlap a specific time slot
  const getEventsForCellSlot = useCallback((day, timeString, resourceId = null, bay = null) => {
    const slotStart = parseTimeString(timeString, day);
    const slotEnd = addMinutes(slotStart, SLOT_DURATION_MINUTES);

    return formattedEvents.filter(event => {
      const matchesDay = isSameDay(event.start, day);
      const overlapsSlot = event.start < slotEnd && event.end > slotStart;
      
      let matchesResource = true;
      if (resourceId) {
        matchesResource = event.employee_id === resourceId;
      }
      
      let matchesBay = true;
      if (bay) {
        matchesBay = event.bayId === bay;
      }
      
      return matchesDay && overlapsSlot && matchesResource && matchesBay;
    }).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [formattedEvents, parseTimeString]);

  const handleNavigate = (action) => {
    let newDate = currentDate;
    
    if (action === 'PREV') {
      if (view === 'month') {
        newDate = addDays(startOfMonth(currentDate), -1);
      } else if (view === 'week') {
        newDate = addDays(currentDate, -7);
      } else {
        newDate = addDays(currentDate, -1);
      }
    } else if (action === 'NEXT') {
      if (view === 'month') {
        newDate = addDays(endOfMonth(currentDate), 1);
      } else if (view === 'week') {
        newDate = addDays(currentDate, 7);
      } else {
        newDate = addDays(currentDate, 1);
      }
    } else if (action === 'TODAY') {
      newDate = new Date();
    }
    
    setCurrentDate(newDate);
  };

  const handleDateClick = (day) => {
    setCurrentDate(day);
    setView('day');
  };

  const getEventStyle = useCallback((event) => {
    let backgroundColor = '#3174ad';
    if (event.bayId) {
      backgroundColor = bayColors[event.bayId] || backgroundColor;
    } else if (event.employee_id) {
      backgroundColor = techColors[event.employee_id] || backgroundColor;
    }
    return { backgroundColor };
  }, [bayColors, techColors]);

  const debouncedUpdate = useCallback((event, updatedSlot) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    if (isUpdating) {
      return;
    }

    updateTimeoutRef.current = setTimeout(async () => {
      setIsUpdating(true);
      try {
        await onEventDrop(event, updatedSlot);
      } catch (error) {
        console.error('Error updating appointment:', error);
      } finally {
        setIsUpdating(false);
      }
    }, 300);
  }, [onEventDrop, isUpdating]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  const handleAppointmentClick = (e, event) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      event: event
    });
  };

  const handleSelectEvent = useCallback((event) => {
    onSelectEvent(event);
    setShowCellAppointmentsModal(false);
  }, [onSelectEvent]);

  const handleContextEdit = () => {
    if (contextMenu?.event) {
      handleSelectEvent(contextMenu.event);
      setContextMenu(null);
    }
  };

  const handleContextMove = () => {
    if (contextMenu?.event) {
      setAppointmentToMove(contextMenu.event);
      setMoveMode(true);
      setContextMenu(null);
    }
  };

  const handleContextDelete = () => {
    if (contextMenu?.event) {
      onDeleteAppointment(contextMenu.event.id);
      setContextMenu(null);
    }
  };

  const handleContextOpenWorkOrder = () => {
    if (contextMenu?.event?.workOrder) {
      onOpenWorkOrder(contextMenu.event.workOrder.ro_number);
      setContextMenu(null);
    }
  };

  const handleContextOpenWorkPRO = () => {
    if (contextMenu?.event?.workOrder) {
      setSelectedWorkOrder(contextMenu.event.workOrder);
      setShowWorkPROModal(true);
      setContextMenu(null);
    }
  };

  const handleMoveToCell = (timeString, day, targetResourceId = null, targetBay = null) => {
    if (!moveMode || !appointmentToMove || isUpdating) return;

    const eventDuration = differenceInMinutes(appointmentToMove.end, appointmentToMove.start);
    const newStart = parseTimeString(timeString, day);
    const newEnd = addMinutes(newStart, eventDuration);

    const updatedSlot = {
      start: newStart,
      end: newEnd,
    };

    if (view === 'day' && targetBay) {
      updatedSlot.employee_id = appointmentToMove.employee_id;
      updatedSlot.bay = targetBay;
    } else {
      updatedSlot.employee_id = appointmentToMove.employee_id;
      updatedSlot.bay = appointmentToMove.bayId;
    }

    debouncedUpdate(appointmentToMove, updatedSlot);
    
    setMoveMode(false);
    setAppointmentToMove(null);
    setContextMenu(null);
  };

  const handleDragStart = (e, event) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, timeString, day, targetResourceId = null, targetBay = null) => {
    e.preventDefault();
    
    if (!draggedEvent || isUpdating) return;

    const eventDuration = differenceInMinutes(draggedEvent.end, draggedEvent.start);
    const newStart = parseTimeString(timeString, day);
    const newEnd = addMinutes(newStart, eventDuration);

    const updatedSlot = {
      start: newStart,
      end: newEnd,
    };

    if (view === 'day' && targetBay) {
      updatedSlot.employee_id = draggedEvent.employee_id;
      updatedSlot.bay = targetBay;
    } else {
      updatedSlot.employee_id = draggedEvent.employee_id;
      updatedSlot.bay = draggedEvent.bayId;
    }

    debouncedUpdate(draggedEvent, updatedSlot);
    setDraggedEvent(null);
  };

  const handleCellClick = useCallback((cellEvents, slotStart, slotEnd, bay = null, techId = null, techName = null) => {
    if (moveMode && appointmentToMove) {
      const timeString = format(slotStart, 'HH:mm');
      const day = slotStart;
      handleMoveToCell(timeString, day, techId, bay);
      return;
    }

    if (cellEvents.length > 1) {
      const slotInfo = {
        start: slotStart,
        end: slotEnd,
        bay: bay,
        techId: techId,
        techName: techName,
      };
      setSelectedCellAppointments(cellEvents);
      setSelectedCellSlotInfo(slotInfo);
      setShowCellAppointmentsModal(true);
    } else if (cellEvents.length === 1) {
      handleSelectEvent(cellEvents[0]);
    } else {
      if (!isUpdating) {
        onSelectSlot({
          start: slotStart,
          end: slotEnd,
          bay: bay,
          employee_id: techId
        });
      }
    }
  }, [moveMode, appointmentToMove, isUpdating, onSelectSlot, handleMoveToCell, handleSelectEvent]);

  // Component for rendering a single appointment
  const SingleAppointmentCard = ({ event, colorClass = null, useTechColors = false }) => {
    const customerName = event.customer 
      ? (event.customer.org_name || `${event.customer.first_name} ${event.customer.last_name}`.trim())
      : event.displayTitle || 'Appointment';
    
    const isCancelledOrNoShow = event.status === 'Cancelled' || event.status === 'No Show';
    
    const hoverText = [
      event.bayId ? `Bay: ${event.bayId}` : null,
      event.tech ? `Tech: ${event.tech.first_name} ${event.tech.last_name}` : null,
      event.status ? `Status: ${event.status}` : null
    ].filter(Boolean).join(' | ') || 'No additional info';
    
    let cardClasses;
    let cardStyle = { height: '100%', width: '100%' };
    
    if (useTechColors && event.employee_id && techColors[event.employee_id]) {
      const techColor = techColors[event.employee_id];
      cardStyle = {
        ...cardStyle,
        backgroundColor: techColor + '20',
        borderColor: techColor,
        borderWidth: '1px'
      };
      cardClasses = `text-xs px-2 py-1 rounded truncate hover:opacity-80 transition-all cursor-pointer flex flex-col justify-center ${
        isCancelledOrNoShow ? 'opacity-50' : ''
      }`;
    } else if (colorClass) {
      cardClasses = `text-xs px-2 py-1 rounded border truncate hover:opacity-80 transition-all cursor-pointer flex flex-col justify-center ${colorClass} ${
        isCancelledOrNoShow ? 'opacity-50' : ''
      }`;
    } else {
      cardClasses = `text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 truncate hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer flex flex-col justify-center ${
        isCancelledOrNoShow ? 'opacity-50' : ''
      }`;
    }
    
    return (
      <div
        draggable={!moveMode} 
        onDragStart={(e) => handleDragStart(e, event)} 
        className={cardClasses}
        style={cardStyle}
        onClick={(e) => {
          e.stopPropagation();
          if (!moveMode) {
            onSelectEvent(event);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!moveMode) {
            handleAppointmentClick(e, event);
          }
        }}
        title={hoverText}
      >
        <div className={`text-sm font-medium text-slate-900 dark:text-inherit truncate ${
          isCancelledOrNoShow ? 'line-through' : ''
        }`}>
          {customerName}
        </div>
        <div className={`text-xs text-slate-700 dark:text-inherit/80 ${
          isCancelledOrNoShow ? 'line-through' : ''
        }`}>
          {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
        </div>
        {event.bayId && (
          <div className={`text-xs text-slate-650 dark:text-inherit/60 ${
            isCancelledOrNoShow ? 'line-through' : ''
          }`}>
            {event.bayId}
          </div>
        )}
      </div>
    );
  };

  // MultiAppointmentCard component - shows duration and individual times
  const MultiAppointmentCard = ({ appointments, earliestStart, latestEnd, onClick, colorClass }) => {
    const totalCount = appointments.length;
    
    // Extract border color for text/icon if possible, or default to slate/black
    // Default blue style
    let containerClass = "w-full bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-300 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30";
    let iconClass = "text-blue-600 dark:text-blue-400";
    let titleClass = "text-blue-800 dark:text-blue-300";
    let dividerClass = "border-blue-200 dark:border-blue-800";

    if (colorClass) {
      // Assuming colorClass is like "bg-blue-100 border-blue-300"
      // We want to make it look like a group card (maybe slightly different or just use the colors)
      // Let's use the passed color class but add border-2
      containerClass = `w-full border-2 rounded p-1 cursor-pointer transition-colors h-full flex flex-col justify-start overflow-hidden ${colorClass} hover:opacity-90`;
      
      // Attempt to derive text colors or just use slate-900
      iconClass = "text-slate-700 dark:text-inherit";
      titleClass = "text-slate-905 dark:text-inherit";
      dividerClass = "border-slate-300 dark:border-slate-700";
    } else {
      containerClass += " rounded p-1 cursor-pointer transition-colors h-full flex flex-col justify-start overflow-hidden";
    }

    return (
      <div
        className={containerClass}
        onClick={onClick}
      >
        <div className="flex items-center gap-1 mb-1 px-1 flex-shrink-0">
          <Users className={`w-3 h-3 ${iconClass}`} />
          <span className={`font-semibold text-xs ${titleClass}`}>
            {totalCount} Appts
          </span>
        </div>
        <div className="space-y-1 overflow-y-auto max-h-full px-1 scrollbar-hide">
          {appointments.map((event) => {
            const customerName = event.customer 
              ? (event.customer.org_name || `${event.customer.first_name} ${event.customer.last_name}`.trim())
              : event.displayTitle || 'Appointment';
            
            const isCancelledOrNoShow = event.status === 'Cancelled' || event.status === 'No Show';

            return (
              <div key={event.id} className={`flex flex-col border-b ${dividerClass} last:border-0 pb-1 ${isCancelledOrNoShow ? 'opacity-50 line-through' : ''}`}>
                <span className="truncate text-sm font-medium text-slate-900 dark:text-inherit">{customerName}</span>
                <span className="text-xs text-slate-700 dark:text-inherit/80">{format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}</span>
                {event.bayId && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border w-fit mt-0.5 ${getBayColorClass(event.bayId)} text-slate-800 dark:text-inherit/70`}>
                    {event.bayId}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // New component for overlap summary in Day/Tech views (unchanged behavior)
  const OverlapSummaryCard = ({ cellEvents, onClick }) => {
    const maxNamesToShow = 3;
    const totalCount = cellEvents.length;
    const namesToDisplay = cellEvents.slice(0, maxNamesToShow);
    const remainingCount = totalCount - maxNamesToShow;

    return (
      <div
        className="bg-slate-100 border-2 border-slate-300 rounded p-2 cursor-pointer hover:bg-slate-200 transition-colors h-full flex flex-col justify-center"
        onClick={onClick}
      >
        <div className="flex items-center gap-1 mb-1">
          <Users className="w-4 h-4 text-slate-600" />
          <span className="font-semibold text-sm text-slate-800">
            {totalCount} Appointment{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="space-y-0.5">
          {namesToDisplay.map((event) => {
            const customerName = event.customer 
              ? (event.customer.org_name || `${event.customer.first_name} ${event.customer.last_name}`.trim())
              : event.displayTitle || 'Appointment';
            
            return (
              <div key={event.id} className="text-xs text-slate-700 truncate">
                {customerName}
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div className="text-xs text-slate-500 italic pl-2">
              +{remainingCount} more
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const day = currentDate;
    const coveredCells = {};
    bayOptions.forEach(bay => { coveredCells[bay] = {}; });

    // Build row map
    const rowMap = [];
    timeSlots.forEach(t => {
      if (parseInt(t.split(':')[0]) < 12) rowMap.push({ time: t, type: 'morning' });
    });
    rowMap.push({ time: 'LUNCH', type: 'lunch' });
    timeSlots.forEach(t => {
      if (parseInt(t.split(':')[0]) >= 13) rowMap.push({ time: t, type: 'afternoon' });
    });

    const getRowSpan = (start, end) => {
      const startTimeStr = format(start, 'HH:mm');
      let startIndex = rowMap.findIndex(r => r.time === startTimeStr);
      
      if (startIndex === -1) {
        const startMins = start.getHours() * 60 + start.getMinutes();
        startIndex = rowMap.findIndex(r => {
          if (r.type === 'lunch') return false;
          const [h, m] = r.time.split(':').map(Number);
          const slotMins = h * 60 + m;
          return startMins >= slotMins && startMins < slotMins + 30;
        });
      }
      if (startIndex === -1) return 1;

      const endTimeStr = format(end, 'HH:mm');
      let endIndex = rowMap.findIndex(r => r.time === endTimeStr);
      
      if (endIndex === -1) {
        const endMins = end.getHours() * 60 + end.getMinutes();
        for (let i = startIndex; i < rowMap.length; i++) {
          const r = rowMap[i];
          if (r.type === 'lunch') {
            if (endMins > 12 * 60) continue;
            else { endIndex = i; break; }
          }
          const [h, m] = r.time.split(':').map(Number);
          const slotMins = h * 60 + m;
          if (endMins <= slotMins) {
            endIndex = i;
            break;
          }
        }
        if (endIndex === -1) endIndex = rowMap.length;
      }
      
      return Math.max(1, endIndex - startIndex);
    };

    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '80px' }} />
            {bayOptions.map(bay => <col key={bay} />)}
          </colgroup>
          <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
            <tr>
              <th className="border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-2 w-20 text-left font-semibold text-sm text-slate-700 dark:text-slate-300">Time</th>
              {bayOptions.map(bay => (
                <th key={bay} className="border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-2 text-center font-semibold text-sm text-slate-700 dark:text-slate-300">{bay}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, day);
              const slotEnd = addMinutes(slotTime, SLOT_DURATION_MINUTES);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-slate-600 dark:text-slate-400 align-top bg-slate-50 dark:bg-slate-800/40">{format(slotTime, 'h:mm a')}</td>
                  {bayOptions.map(bay => {
                    if (coveredCells[bay][timeString]) return null;

                    const bayClusters = groupedDayAppointments[bay] || [];
                    const cluster = bayClusters.find(c => 
                      c.earliestStart >= slotTime && c.earliestStart < slotEnd
                    );
                    
                    let cellContent = null;
                    let rowSpan = 1;

                    if (cluster) {
                      rowSpan = getRowSpan(cluster.earliestStart, cluster.latestEnd);
                      
                      if (cluster.type === 'group') {
                        cellContent = <MultiAppointmentCard 
                          appointments={cluster.appointments}
                          earliestStart={cluster.earliestStart}
                          latestEnd={cluster.latestEnd}
                          colorClass={getBayColorClass(bay)}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(cluster.appointments, cluster.earliestStart, cluster.latestEnd, bay, null, null); }}
                        />;
                      } else {
                        const event = cluster.appointments[0];
                        cellContent = <SingleAppointmentCard event={event} colorClass={getBayColorClass(bay)} />;
                      }

                      // Mark all covered cells
                      const clusterStartTime = format(cluster.earliestStart, 'HH:mm');
                      let markingIndex = rowMap.findIndex(r => r.time === clusterStartTime);
                      
                      if (markingIndex === -1) {
                        const startMins = cluster.earliestStart.getHours() * 60 + cluster.earliestStart.getMinutes();
                        markingIndex = rowMap.findIndex(r => {
                          if (r.type === 'lunch') return false;
                          const [h, m] = r.time.split(':').map(Number);
                          const slotMins = h * 60 + m;
                          return startMins >= slotMins && startMins < slotMins + 30;
                        });
                      }
                      
                      if (markingIndex !== -1) {
                        for (let i = 0; i < rowSpan; i++) {
                          if (markingIndex + i < rowMap.length) {
                            const r = rowMap[markingIndex + i];
                            if (r.time === 'LUNCH') {
                              coveredCells[bay]['LUNCH'] = true;
                            } else {
                              coveredCells[bay][r.time] = true;
                            }
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={bay} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => handleCellClick([], slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={bay} rowSpan={rowSpan} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => {}}>
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>{cellContent}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Lunch Row */}
            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-white bg-black align-middle text-center">LUNCH</td>
              {bayOptions.map(bay => {
                if (coveredCells[bay]['LUNCH']) return null;
                return <td key={bay} className="border border-slate-300 dark:border-slate-800 bg-black"></td>;
              })}
            </tr>

            {/* Afternoon Block */}
            {timeSlots.filter(t => parseInt(t.split(':')[0]) >= 13).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, day);
              const slotEnd = addMinutes(slotTime, SLOT_DURATION_MINUTES);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-slate-600 dark:text-slate-400 align-top bg-slate-50 dark:bg-slate-800/40">{format(slotTime, 'h:mm a')}</td>
                  {bayOptions.map(bay => {
                    if (coveredCells[bay][timeString]) return null;

                    const bayClusters = groupedDayAppointments[bay] || [];
                    const cluster = bayClusters.find(c => 
                      c.earliestStart >= slotTime && c.earliestStart < slotEnd
                    );
                    
                    let cellContent = null;
                    let rowSpan = 1;

                    if (cluster) {
                      rowSpan = getRowSpan(cluster.earliestStart, cluster.latestEnd);
                      
                      if (cluster.type === 'group') {
                        cellContent = <MultiAppointmentCard 
                          appointments={cluster.appointments}
                          earliestStart={cluster.earliestStart}
                          latestEnd={cluster.latestEnd}
                          colorClass={getBayColorClass(bay)}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(cluster.appointments, cluster.earliestStart, cluster.latestEnd, bay, null, null); }}
                        />;
                      } else {
                        const event = cluster.appointments[0];
                        cellContent = <SingleAppointmentCard event={event} colorClass={getBayColorClass(bay)} />;
                      }

                      // Mark all covered cells
                      const clusterStartTime = format(cluster.earliestStart, 'HH:mm');
                      let markingIndex = rowMap.findIndex(r => r.time === clusterStartTime);
                      
                      if (markingIndex === -1) {
                        const startMins = cluster.earliestStart.getHours() * 60 + cluster.earliestStart.getMinutes();
                        markingIndex = rowMap.findIndex(r => {
                          if (r.type === 'lunch') return false;
                          const [h, m] = r.time.split(':').map(Number);
                          const slotMins = h * 60 + m;
                          return startMins >= slotMins && startMins < slotMins + 30;
                        });
                      }
                      
                      if (markingIndex !== -1) {
                        for (let i = 0; i < rowSpan; i++) {
                          if (markingIndex + i < rowMap.length) {
                            const r = rowMap[markingIndex + i];
                            if (r.time === 'LUNCH') {
                              coveredCells[bay]['LUNCH'] = true;
                            } else {
                              coveredCells[bay][r.time] = true;
                            }
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={bay} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => handleCellClick([], slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={bay} rowSpan={rowSpan} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => {}}>
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>{cellContent}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderWeekView = () => {
    const days = displayDays;
    const columnWidthPercent = (100 - 5) / days.length;
    const coveredCells = {};
    days.forEach(day => { coveredCells[day.toISOString()] = {}; });

    // Build row map
    const rowMap = [];
    timeSlots.forEach(t => {
      if (parseInt(t.split(':')[0]) < 12) rowMap.push({ time: t, type: 'morning' });
    });
    rowMap.push({ time: 'LUNCH', type: 'lunch' });
    timeSlots.forEach(t => {
      if (parseInt(t.split(':')[0]) >= 13) rowMap.push({ time: t, type: 'afternoon' });
    });

    const getRowSpan = (start, end) => {
      const startTimeStr = format(start, 'HH:mm');
      let startIndex = rowMap.findIndex(r => r.time === startTimeStr);
      
      if (startIndex === -1) {
        const startMins = start.getHours() * 60 + start.getMinutes();
        startIndex = rowMap.findIndex(r => {
          if (r.type === 'lunch') return false;
          const [h, m] = r.time.split(':').map(Number);
          const slotMins = h * 60 + m;
          return startMins >= slotMins && startMins < slotMins + 30;
        });
      }
      if (startIndex === -1) return 1;

      const endTimeStr = format(end, 'HH:mm');
      let endIndex = rowMap.findIndex(r => r.time === endTimeStr);
      
      if (endIndex === -1) {
        const endMins = end.getHours() * 60 + end.getMinutes();
        for (let i = startIndex; i < rowMap.length; i++) {
          const r = rowMap[i];
          if (r.type === 'lunch') {
            if (endMins > 12 * 60) continue;
            else { endIndex = i; break; }
          }
          const [h, m] = r.time.split(':').map(Number);
          const slotMins = h * 60 + m;
          if (endMins <= slotMins) {
            endIndex = i;
            break;
          }
        }
        if (endIndex === -1) endIndex = rowMap.length;
      }
      
      return Math.max(1, endIndex - startIndex);
    };

    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '80px' }} />
            {days.map((day, index) => <col key={index} style={{ width: columnWidthPercent + '%' }} />)}
          </colgroup>
          <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
            <tr>
              <th className="border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-2 text-left font-semibold text-sm text-slate-700 dark:text-slate-300">Time</th>
              {days.map(day => (
                <th key={day.toISOString()} onClick={() => { setCurrentDate(day); setView('day'); }} className={`border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 p-2 text-center font-semibold text-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isSameDay(day, new Date()) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200' : 'text-slate-700 dark:text-slate-300'}`}>
                  <div>{format(day, 'EEE')}</div>
                  <div className="text-lg">{format(day, 'd')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Morning Block */}
            {timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, currentDate);
              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-slate-600 dark:text-slate-400 align-top bg-slate-50 dark:bg-slate-800/40">{format(slotTime, 'h:mm a')}</td>
                  {days.map(day => {
                    const dayKey = day.toISOString();
                    if (coveredCells[dayKey][timeString]) return null;

                    const dayClusters = groupedWeekAppointments[dayKey] || [];
                    // Find cluster that starts at or overlaps this slot
                    const daySlotTime = parseTimeString(timeString, day);
                    const slotEnd = addMinutes(daySlotTime, SLOT_DURATION_MINUTES);
                    const cluster = dayClusters.find(c => 
                      c.earliestStart >= daySlotTime && c.earliestStart < slotEnd
                    );
                    
                    let cellContent = null;
                    let rowSpan = 1;

                    if (cluster) {
                      rowSpan = getRowSpan(cluster.earliestStart, cluster.latestEnd);
                      
                      if (cluster.type === 'group') {
                        cellContent = <MultiAppointmentCard 
                          appointments={cluster.appointments}
                          earliestStart={cluster.earliestStart}
                          latestEnd={cluster.latestEnd}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(cluster.appointments, cluster.earliestStart, cluster.latestEnd, null, null, null); }}
                        />;
                      } else {
                        const event = cluster.appointments[0];
                        cellContent = <SingleAppointmentCard event={event} colorClass={getBayColorClass(event.bayId)} />;
                      }

                      // Mark all covered cells from cluster start to cluster end
                      const clusterStartTime = format(cluster.earliestStart, 'HH:mm');
                      let markingIndex = rowMap.findIndex(r => r.time === clusterStartTime);
                      
                      // If exact match not found, find the slot that contains the start time
                      if (markingIndex === -1) {
                        const startMins = cluster.earliestStart.getHours() * 60 + cluster.earliestStart.getMinutes();
                        markingIndex = rowMap.findIndex(r => {
                          if (r.type === 'lunch') return false;
                          const [h, m] = r.time.split(':').map(Number);
                          const slotMins = h * 60 + m;
                          return startMins >= slotMins && startMins < slotMins + 30;
                        });
                      }
                      
                      if (markingIndex !== -1) {
                        for (let i = 0; i < rowSpan; i++) {
                          if (markingIndex + i < rowMap.length) {
                            const r = rowMap[markingIndex + i];
                            if (r.time === 'LUNCH') {
                              coveredCells[dayKey]['LUNCH'] = true;
                            } else {
                              coveredCells[dayKey][r.time] = true;
                            }
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={dayKey} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => handleCellClick([], daySlotTime, addMinutes(daySlotTime, SLOT_DURATION_MINUTES), null, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={dayKey} rowSpan={rowSpan} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => {}}>
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>{cellContent}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Lunch Row */}
            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-white bg-black align-middle text-center">LUNCH</td>
              {days.map(day => {
                const dayKey = day.toISOString();
                if (coveredCells[dayKey]['LUNCH']) return null;
                return <td key={day.toISOString()} className="border border-slate-300 dark:border-slate-800 bg-black"></td>;
              })}
            </tr>

            {/* Afternoon Block */}
            {timeSlots.filter(t => parseInt(t.split(':')[0]) >= 13).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, currentDate);
              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 dark:border-slate-800 p-2 text-sm font-semibold text-slate-600 dark:text-slate-400 align-top bg-slate-50 dark:bg-slate-800/40">{format(slotTime, 'h:mm a')}</td>
                  {days.map(day => {
                    const dayKey = day.toISOString();
                    if (coveredCells[dayKey][timeString]) return null;

                    const dayClusters = groupedWeekAppointments[dayKey] || [];
                    // Find cluster that starts at or overlaps this slot
                    const daySlotTime = parseTimeString(timeString, day);
                    const slotEnd = addMinutes(daySlotTime, SLOT_DURATION_MINUTES);
                    const cluster = dayClusters.find(c => 
                      c.earliestStart >= daySlotTime && c.earliestStart < slotEnd
                    );
                    
                    let cellContent = null;
                    let rowSpan = 1;

                    if (cluster) {
                      rowSpan = getRowSpan(cluster.earliestStart, cluster.latestEnd);
                      
                      if (cluster.type === 'group') {
                        cellContent = <MultiAppointmentCard 
                          appointments={cluster.appointments}
                          earliestStart={cluster.earliestStart}
                          latestEnd={cluster.latestEnd}
                          onClick={(e) => { e.stopPropagation(); handleCellClick(cluster.appointments, cluster.earliestStart, cluster.latestEnd, null, null, null); }}
                        />;
                      } else {
                        const event = cluster.appointments[0];
                        cellContent = <SingleAppointmentCard event={event} colorClass={getBayColorClass(event.bayId)} />;
                      }

                      // Mark all covered cells from cluster start to cluster end
                      const clusterStartTime = format(cluster.earliestStart, 'HH:mm');
                      let markingIndex = rowMap.findIndex(r => r.time === clusterStartTime);
                      
                      // If exact match not found, find the slot that contains the start time
                      if (markingIndex === -1) {
                        const startMins = cluster.earliestStart.getHours() * 60 + cluster.earliestStart.getMinutes();
                        markingIndex = rowMap.findIndex(r => {
                          if (r.type === 'lunch') return false;
                          const [h, m] = r.time.split(':').map(Number);
                          const slotMins = h * 60 + m;
                          return startMins >= slotMins && startMins < slotMins + 30;
                        });
                      }
                      
                      if (markingIndex !== -1) {
                        for (let i = 0; i < rowSpan; i++) {
                          if (markingIndex + i < rowMap.length) {
                            const r = rowMap[markingIndex + i];
                            if (r.time === 'LUNCH') {
                              coveredCells[dayKey]['LUNCH'] = true;
                            } else {
                              coveredCells[dayKey][r.time] = true;
                            }
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={dayKey} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => handleCellClick([], daySlotTime, addMinutes(daySlotTime, SLOT_DURATION_MINUTES), null, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={dayKey} rowSpan={rowSpan} className={`border border-slate-300 dark:border-slate-800 p-1 relative bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 dark:bg-blue-900/20 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => {}}>
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>{cellContent}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };



  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    
    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <div className="grid grid-cols-7 bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-700">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, new Date());
            const dayEvents = formattedEvents.filter(event => isSameDay(event.start, day));

            return (
              <div
                key={day.toString()}
                className={`min-h-[120px] border-r border-b border-slate-200 dark:border-slate-800 p-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  !isCurrentMonth ? 'bg-slate-50 dark:bg-slate-900/40' : 'bg-white dark:bg-slate-900'
                } ${idx % 7 === 6 ? 'border-r-0' : ''} ${moveMode ? 'cursor-crosshair bg-blue-50 dark:bg-blue-900/20' : ''}`}
                onClick={() => {
                  if (moveMode && appointmentToMove) {
                    const newStart = new Date(day);
                    newStart.setHours(appointmentToMove.start.getHours(), appointmentToMove.start.getMinutes(), 0, 0);
                    handleMoveToCell(format(newStart, 'HH:mm'), newStart, appointmentToMove.employee_id);
                  } else {
                    handleDateClick(day);
                  }
                }}
              >
                <div className={`text-sm font-semibold mb-2 ${
                  isToday ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : 
                  !isCurrentMonth ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                }`}>
                  {format(day, 'd')}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(event => {
                    const customerName = event.customer 
                      ? (event.customer.org_name || `${event.customer.first_name} ${event.customer.last_name}`.trim())
                      : event.displayTitle || 'Appointment';
                    
                    const isCancelledOrNoShow = event.status === 'Cancelled' || event.status === 'No Show';
                    
                    const hoverText = [
                      event.bayId ? `Bay: ${event.bayId}` : null,
                      event.tech ? `Tech: ${event.tech.first_name} ${event.tech.last_name}` : null,
                      event.status ? `Status: ${event.status}` : null
                    ].filter(Boolean).join(' | ') || 'No additional info';

                    return (
                      <div
                        key={event.id}
                        className={`text-xs px-2 py-1 rounded border truncate hover:opacity-90 transition-colors cursor-pointer ${getBayColorClass(event.bayId)} ${
                          isCancelledOrNoShow ? 'opacity-50' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!moveMode) {
                            handleAppointmentClick(e, event);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!moveMode) {
                            handleAppointmentClick(e, event);
                          }
                        }}
                        title={hoverText}
                      >
                        <div className={`font-medium text-slate-900 dark:text-inherit truncate ${
                          isCancelledOrNoShow ? 'line-through' : ''
                        }`}>
                          {customerName}
                        </div>
                        <div className={`text-[10px] text-slate-600 dark:text-inherit/80 ${
                          isCancelledOrNoShow ? 'line-through' : ''
                        }`}>
                          {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
                        </div>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-slate-600 font-medium pl-1">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {moveMode && (
        <div className="bg-blue-100 border-2 border-blue-500 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Move className="w-6 h-6 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-900">Move Mode Active</p>
              <p className="text-sm text-blue-700">Click on a time slot to move the appointment "{appointmentToMove?.displayTitle}"</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setMoveMode(false);
              setAppointmentToMove(null);
            }}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => handleNavigate('PREV')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNavigate('TODAY')}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNavigate('NEXT')}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 ml-2">
            {view === 'month' 
              ? format(currentDate, 'MMMM yyyy')
              : (view === 'day')
              ? format(currentDate, 'EEEE, MMM d, yyyy')
              : (view === 'week')
              ? `${format(displayDays[0], 'MMM d')} - ${format(displayDays[displayDays.length - 1], 'MMM d, yyyy')}`
              : format(currentDate, 'EEEE, MMMM d, yyyy')
            }
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {(view === 'week' || view === 'day') && (
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Bays:</span>
              <div className="flex items-center gap-3 flex-wrap">
                {bayOptions.map(bay => (
                  <div key={bay} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded border-2 ${getBayColorClass(bay)}`}></div>
                    <span className="text-xs text-slate-700 dark:text-slate-300">{bay}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'month'
                  ? 'bg-black dark:bg-slate-700 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'week'
                  ? 'bg-black dark:bg-slate-700 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'day'
                  ? 'bg-black dark:bg-slate-700 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Day
            </button>

          </div>
        </div>
      </div>

      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-slate-800 shadow-lg rounded-lg border border-slate-200 dark:border-slate-700 py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-800 dark:text-slate-200"
            onClick={handleContextEdit}
          >
            <Edit2 className="w-4 h-4" />
            Edit Details
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-800 dark:text-slate-200"
            onClick={handleContextMove}
          >
            <Move className="w-4 h-4" />
            Move Appointment
          </button>
          {contextMenu.event.workOrder && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                onClick={handleContextOpenWorkOrder}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M19.5 6.75A3 3 0 0016.5 3H7.5A3 3 0 004.5 6.75v10.5A3 3 0 007.5 20.25h9A3 3 0 0019.5 17.25V6.75zM17.25 9a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V6.75a.75.75 0 01.75-.75H16.5a.75.75 0 01.75.75V9z" />
                  <path fillRule="evenodd" d="M12 11.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V12a.75.75 0 01.75-.75z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M13.253 11.854a.75.75 0 00-1.06 0l-.75.75a.75.75 0 101.06 1.06l.75-.75a.75.75 0 000-1.06z" clipRule="evenodd" />
                </svg>
                Open Work Order
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-800 dark:text-slate-200"
                onClick={handleContextOpenWorkPRO}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
                </svg>
                WorkPRO Project
              </button>
            </>
          )}
          <button 
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
            onClick={handleContextDelete}
          >
            <Trash2 className="w-4 h-4" />
            Delete Appointment
          </button>
        </div>
      )}

      <CellAppointmentsModal
        open={showCellAppointmentsModal}
        onClose={() => setShowCellAppointmentsModal(false)}
        appointments={selectedCellAppointments}
        slotInfo={selectedCellSlotInfo}
        onSelectAppointment={handleSelectEvent}
        onOpenWorkOrder={onOpenWorkOrder}
        onDeleteAppointment={onDeleteAppointment}
        bayColors={bayColors}
        techColors={techColors}
        employees={employees}
        getEventStyle={getEventStyle}
        handleAppointmentClick={handleAppointmentClick}
      />

      <WorkPROModal
        open={showWorkPROModal}
        onClose={() => {
          setShowWorkPROModal(false);
          setSelectedWorkOrder(null);
        }}
        workOrder={selectedWorkOrder}
      />
    </div>
  );
}