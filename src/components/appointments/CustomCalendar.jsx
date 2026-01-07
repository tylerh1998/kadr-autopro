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

      return {
        ...event,
        start: startDate,
        end: endDate,
        resourceId: event.employee_id,
        bayId: event.bay,
        tech: tech,
      };
    });
  }, [events, employees]);

  const getBayColorClass = useCallback((bay) => {
    const bayColorMap = {
      'Floor': 'bg-blue-100 border-blue-300',
      'Main Hoist': 'bg-green-100 border-green-300',
      'North Hoist': 'bg-amber-100 border-amber-300',
      'Outside': 'bg-purple-100 border-purple-300',
      'Other': 'bg-red-100 border-red-300',
    };
    return bayColorMap[bay] || 'bg-slate-100 border-slate-300';
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

  const bayOptions = ['Floor', 'Main Hoist', 'North Hoist', 'Outside', 'Other'];

  const displayDays = useMemo(() => {
    if (view === 'day' || view === 'tech') {
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

    if (view === 'tech' && targetResourceId) {
      updatedSlot.employee_id = targetResourceId;
      updatedSlot.bay = appointmentToMove.bayId;
    } else if (view === 'day' && targetBay) {
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

    if (view === 'tech' && targetResourceId) {
      updatedSlot.employee_id = targetResourceId;
      updatedSlot.bay = draggedEvent.bayId;
    } else if (view === 'day' && targetBay) {
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
      cardClasses = `text-xs px-2 py-1 bg-slate-100 rounded border border-slate-200 truncate hover:bg-slate-200 transition-colors cursor-pointer flex flex-col justify-center ${
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
        <div className={`text-sm font-medium text-slate-900 truncate ${
          isCancelledOrNoShow ? 'line-through' : ''
        }`}>
          {customerName}
        </div>
        <div className={`text-[10px] text-slate-600 ${
          isCancelledOrNoShow ? 'line-through' : ''
        }`}>
          {format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}
        </div>
      </div>
    );
  };

  // MultiAppointmentCard component - shows duration and individual times
  const MultiAppointmentCard = ({ appointments, earliestStart, latestEnd, onClick }) => {
    const totalCount = appointments.length;
    
    return (
      <div
        className="bg-blue-50 border-2 border-blue-300 rounded p-1 cursor-pointer hover:bg-blue-100 transition-colors h-full flex flex-col justify-start overflow-hidden"
        onClick={onClick}
      >
        <div className="flex items-center gap-1 mb-1 px-1 flex-shrink-0">
          <Users className="w-3 h-3 text-blue-600" />
          <span className="font-semibold text-xs text-blue-800">
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
              <div key={event.id} className={`flex flex-col border-b border-blue-200 last:border-0 pb-1 ${isCancelledOrNoShow ? 'opacity-50 line-through' : ''}`}>
                <span className="truncate text-[10px] font-medium text-slate-800">{customerName}</span>
                <span className="text-[9px] text-slate-600">{format(event.start, 'h:mm a')} - {format(event.end, 'h:mm a')}</span>
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

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="border border-slate-300 bg-slate-100 p-2 w-20 text-left font-semibold text-sm text-slate-700">Time</th>
              {bayOptions.map(bay => (
                <th key={bay} className="border border-slate-300 bg-slate-100 p-2 text-center font-semibold text-sm text-slate-700">{bay}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, day);
              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">{format(slotTime, 'h:mm a')}</td>
                  {bayOptions.map(bay => {
                    if (coveredCells[bay][timeString]) return null;

                    const cellEvents = getEventsForCellSlot(day, timeString, null, bay);
                    let rowSpan = 1;
                    let cellContent = null;

                    if (cellEvents.length > 1) {
                      cellContent = <OverlapSummaryCard cellEvents={cellEvents} onClick={(e) => { e.stopPropagation(); handleCellClick(cellEvents, slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null); }} />;
                    } else if (cellEvents.length === 1) {
                      const event = cellEvents[0];
                      for (let i = 1; ; i++) {
                        const nextIndex = timeSlots.indexOf(timeString) + i;
                        if (nextIndex >= timeSlots.length) break;
                        const nextTimeString = timeSlots[nextIndex];
                        if (parseInt(timeString.split(':')[0]) < 12 && parseInt(nextTimeString.split(':')[0]) >= 13) break;
                        
                        const nextSlotTime = parseTimeString(nextTimeString, day);
                        if (nextSlotTime >= event.end) break;
                        
                        const nextEvents = getEventsForCellSlot(day, nextTimeString, null, bay);
                        if (nextEvents.length > 1 || (nextEvents.length === 1 && nextEvents[0].id !== event.id)) break;
                        
                        rowSpan++;
                      }
                      for (let i = 1; i < rowSpan; i++) {
                        const nextIndex = timeSlots.indexOf(timeString) + i;
                        if (nextIndex < timeSlots.length) coveredCells[bay][timeSlots[nextIndex]] = true;
                      }
                      cellContent = <SingleAppointmentCard event={event} useTechColors={true} />;
                    }

                    return (
                      <td key={bay} rowSpan={rowSpan} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => handleCellClick(cellEvents, slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null)}>
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>{cellContent}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Lunch Row */}
            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 p-2 text-sm font-semibold text-white bg-black align-middle text-center">LUNCH</td>
              {bayOptions.map(bay => <td key={bay} className="border border-slate-300 bg-black"></td>)}
            </tr>

            {/* Afternoon Block */}
            {timeSlots.filter(t => parseInt(t.split(':')[0]) >= 13).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, day);
              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">{format(slotTime, 'h:mm a')}</td>
                  {bayOptions.map(bay => {
                    if (coveredCells[bay][timeString]) return null;

                    const cellEvents = getEventsForCellSlot(day, timeString, null, bay);
                    let rowSpan = 1;
                    let cellContent = null;

                    if (cellEvents.length > 1) {
                      cellContent = <OverlapSummaryCard cellEvents={cellEvents} onClick={(e) => { e.stopPropagation(); handleCellClick(cellEvents, slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null); }} />;
                    } else if (cellEvents.length === 1) {
                      const event = cellEvents[0];
                      for (let i = 1; ; i++) {
                        const nextIndex = timeSlots.indexOf(timeString) + i;
                        if (nextIndex >= timeSlots.length) break;
                        const nextTimeString = timeSlots[nextIndex];
                        const nextSlotTime = parseTimeString(nextTimeString, day);
                        if (nextSlotTime >= event.end) break;
                        const nextEvents = getEventsForCellSlot(day, nextTimeString, null, bay);
                        if (nextEvents.length > 1 || (nextEvents.length === 1 && nextEvents[0].id !== event.id)) break;
                        rowSpan++;
                      }
                      for (let i = 1; i < rowSpan; i++) {
                        const nextIndex = timeSlots.indexOf(timeString) + i;
                        if (nextIndex < timeSlots.length) coveredCells[bay][timeSlots[nextIndex]] = true;
                      }
                      cellContent = <SingleAppointmentCard event={event} useTechColors={true} />;
                    }

                    return (
                      <td key={bay} rowSpan={rowSpan} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day, null, bay)} onClick={() => handleCellClick(cellEvents, slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), bay, null, null)}>
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

    // Group appointments by day and identify overlapping clusters
    const groupedWeekAppointments = useMemo(() => {
      const grouped = {};
      days.forEach(day => {
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
    }, [days, formattedEvents]);

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
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '80px' }} />
            {days.map((day, index) => <col key={index} style={{ width: columnWidthPercent + '%' }} />)}
          </colgroup>
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="border border-slate-300 bg-slate-100 p-2 text-left font-semibold text-sm text-slate-700">Time</th>
              {days.map(day => (
                <th key={day.toISOString()} onClick={() => { setCurrentDate(day); setView('day'); }} className={`border border-slate-300 bg-slate-100 p-2 text-center font-semibold text-sm cursor-pointer hover:bg-slate-200 transition-colors ${isSameDay(day, new Date()) ? 'bg-blue-100 text-blue-900' : 'text-slate-700'}`}>
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
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">{format(slotTime, 'h:mm a')}</td>
                  {days.map(day => {
                    const dayKey = day.toISOString();
                    if (coveredCells[dayKey][timeString]) return null;

                    const dayClusters = groupedWeekAppointments[dayKey] || [];
                    const cluster = dayClusters.find(c => eventStartsAtSlot({ start: c.earliestStart }, slotTime));
                    
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

                      let currentRowIndex = rowMap.findIndex(r => r.time === timeString);
                      for (let i = 0; i < rowSpan; i++) {
                        if (currentRowIndex + i < rowMap.length) {
                          const r = rowMap[currentRowIndex + i];
                          if (r.time === 'LUNCH') {
                            coveredCells[dayKey]['LUNCH'] = true;
                          } else {
                            coveredCells[dayKey][r.time] = true;
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={dayKey} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => handleCellClick([], slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), null, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={dayKey} rowSpan={rowSpan} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
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
              <td className="border border-slate-300 p-2 text-sm font-semibold text-white bg-black align-middle text-center">LUNCH</td>
              {days.map(day => {
                const dayKey = day.toISOString();
                if (coveredCells[dayKey]['LUNCH']) return null;
                return <td key={day.toISOString()} className="border border-slate-300 bg-black"></td>;
              })}
            </tr>

            {/* Afternoon Block */}
            {timeSlots.filter(t => parseInt(t.split(':')[0]) >= 13).map((timeString, _idx) => {
              const slotTime = parseTimeString(timeString, currentDate);
              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">{format(slotTime, 'h:mm a')}</td>
                  {days.map(day => {
                    const dayKey = day.toISOString();
                    if (coveredCells[dayKey][timeString]) return null;

                    const dayClusters = groupedWeekAppointments[dayKey] || [];
                    const cluster = dayClusters.find(c => eventStartsAtSlot({ start: c.earliestStart }, slotTime));
                    
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

                      let currentRowIndex = rowMap.findIndex(r => r.time === timeString);
                      for (let i = 0; i < rowSpan; i++) {
                        if (currentRowIndex + i < rowMap.length) {
                          const r = rowMap[currentRowIndex + i];
                          if (r.time === 'LUNCH') {
                            coveredCells[dayKey]['LUNCH'] = true;
                          } else {
                            coveredCells[dayKey][r.time] = true;
                          }
                        }
                      }
                    } else {
                      return (
                        <td key={dayKey} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, timeString, day)} onClick={() => handleCellClick([], slotTime, addMinutes(slotTime, SLOT_DURATION_MINUTES), null, null, null)}>
                        </td>
                      );
                    }

                    return (
                      <td key={dayKey} rowSpan={rowSpan} className={`border border-slate-300 p-1 relative bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
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