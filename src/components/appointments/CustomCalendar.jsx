import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Trash2, Edit2, Move, Users } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, differenceInMinutes, addMinutes } from 'date-fns';
import CellAppointmentsModal from './CellAppointmentsModal';

// Constants for layout
const SLOT_DURATION_MINUTES = 30;
const MIN_SLOT_HEIGHT_PX = 60;
const EVENT_CARD_STACK_HEIGHT_PX = 50;

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
  const calendarRef = useRef(null);
  const updateTimeoutRef = useRef(null);

  const [contextMenu, setContextMenu] = useState(null);
  const [moveMode, setMoveMode] = useState(false);
  const [appointmentToMove, setAppointmentToMove] = useState(null);

  // State variables for CellAppointmentsModal
  const [showCellAppointmentsModal, setShowCellAppointmentsModal] = useState(false);
  const [selectedCellAppointments, setSelectedCellAppointments] = useState([]);
  const [selectedCellSlotInfo, setSelectedCellSlotInfo] = useState(null);

  // Color palette for week view appointments
  const weekViewColors = [
    'bg-blue-100 border-blue-300',
    'bg-green-100 border-green-300',
    'bg-yellow-100 border-yellow-300',
    'bg-orange-100 border-orange-300',
    'bg-indigo-100 border-indigo-300',
    'bg-purple-100 border-purple-300',
    'bg-pink-100 border-pink-300',
    'bg-teal-100 border-teal-300',
    'bg-cyan-100 border-cyan-300',
    'bg-rose-100 border-rose-300',
  ];

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
      if (view === 'tech' && resourceId) {
        matchesResource = event.employee_id === resourceId;
      }
      
      let matchesBay = true;
      if (view === 'day' && bay) {
        matchesBay = event.bayId === bay;
      }
      
      return matchesDay && overlapsSlot && matchesResource && matchesBay;
    }).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [formattedEvents, view, parseTimeString]);

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

  // New component for rendering the overlap summary card
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

  // Component for rendering a single appointment (spanning or not)
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
            handleSelectEvent(event);
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

  const renderDayView = () => {
    const day = currentDate;
    
    // Create a map to track which cells are covered by rowSpan for each bay
    const coveredCells = {};
    bayOptions.forEach(bay => {
      coveredCells[bay] = {};
    });

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="border border-slate-300 bg-slate-100 p-2 w-20 text-left font-semibold text-sm text-slate-700">Time</th>
              {bayOptions.map(bay => (
                <th key={bay} className="border border-slate-300 bg-slate-100 p-2 text-center font-semibold text-sm text-slate-700">
                  {bay}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.filter(t => {
              const hour = parseInt(t.split(':')[0]);
              return hour < 12;
            }).map((timeString, slotIndex) => {
              const slotTime = parseTimeString(timeString, day);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                    {format(slotTime, 'h:mm a')}
                  </td>
                  {bayOptions.map(bay => {
                    // Check if this cell is covered by a previous rowSpan
                    if (coveredCells[bay][timeString]) {
                      return null; // Skip rendering this cell
                    }

                    const cellSlotTime = parseTimeString(timeString, day);
                    const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                    const cellEvents = getEventsForCellSlot(day, timeString, null, bay);
                    
                    // Filter to only events that START in this slot
                    const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));
                    
                    let rowSpan = 1;
                    let cellContent = null;

                    if (eventsStartingHere.length > 1) {
                      // Multiple events starting here - show summary card (no spanning)
                      cellContent = (
                        <OverlapSummaryCard 
                          cellEvents={cellEvents} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, bay, null, null);
                          }}
                        />
                      );
                    } else if (eventsStartingHere.length === 1) {
                      // Single event starting here - calculate rowSpan
                      const event = eventsStartingHere[0];
                      rowSpan = calculateEventSlotSpan(event);
                      
                      // Mark covered cells
                      for (let i = 1; i < rowSpan; i++) {
                        const nextSlotIndex = slotIndex + i;
                        if (nextSlotIndex < timeSlots.length) {
                          const nextTimeString = timeSlots[nextSlotIndex];
                          coveredCells[bay][nextTimeString] = true;
                        }
                      }
                      
                      cellContent = (
                        <SingleAppointmentCard 
                          event={event}
                          useTechColors={true}
                        />
                      );
                    }

                    return (
                      <td
                        key={bay}
                        rowSpan={rowSpan}
                        className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, timeString, day, null, bay)}
                        onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, bay, null, null)}
                      >
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                          {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            
            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 p-2 text-sm font-semibold text-white bg-black align-middle text-center">
                LUNCH
              </td>
              {bayOptions.map(bay => (
                <td key={bay} className="border border-slate-300 bg-black"></td>
              ))}
            </tr>

            {timeSlots.filter(t => {
              const hour = parseInt(t.split(':')[0]);
              return hour >= 13;
            }).map((timeString, slotIndex) => {
              const actualSlotIndex = timeSlots.findIndex(t => t === timeString);
              const slotTime = parseTimeString(timeString, day);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                    {format(slotTime, 'h:mm a')}
                  </td>
                  {bayOptions.map(bay => {
                    // Check if this cell is covered by a previous rowSpan
                    if (coveredCells[bay][timeString]) {
                      return null;
                    }

                    const cellSlotTime = parseTimeString(timeString, day);
                    const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                    const cellEvents = getEventsForCellSlot(day, timeString, null, bay);
                    const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));
                    
                    let rowSpan = 1;
                    let cellContent = null;

                    if (eventsStartingHere.length > 1) {
                      cellContent = (
                        <OverlapSummaryCard 
                          cellEvents={cellEvents} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, bay, null, null);
                          }}
                        />
                      );
                    } else if (eventsStartingHere.length === 1) {
                      const event = eventsStartingHere[0];
                      rowSpan = calculateEventSlotSpan(event);
                      
                      for (let i = 1; i < rowSpan; i++) {
                        const nextSlotIndex = actualSlotIndex + i;
                        if (nextSlotIndex < timeSlots.length) {
                          const nextTimeString = timeSlots[nextSlotIndex];
                          coveredCells[bay][nextTimeString] = true;
                        }
                      }
                      
                      cellContent = (
                        <SingleAppointmentCard 
                          event={event}
                          useTechColors={true}
                        />
                      );
                    }

                    return (
                      <td
                        key={bay}
                        rowSpan={rowSpan}
                        className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, timeString, day, null, bay)}
                        onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, bay, null, null)}
                      >
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                          {cellContent}
                        </div>
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
    const columnWidthPercent = (100 - 5) / 7;

    // Create a map to track which cells are covered by rowSpan for each day
    const coveredCells = {};
    days.forEach(day => {
      coveredCells[day.toISOString()] = {};
    });

    return (
      <div className="space-y-4">
        {/* Bay Legend */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-xs font-semibold text-slate-600">Bays:</span>
          <div className="flex items-center gap-3 flex-wrap">
            {bayOptions.map(bay => (
              <div key={bay} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded border-2 ${getBayColorClass(bay)}`}></div>
                <span className="text-xs text-slate-700">{bay}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '80px' }} />
              {days.map((day, index) => (
                <col key={index} style={{ width: columnWidthPercent + '%' }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="border border-slate-300 bg-slate-100 p-2 text-left font-semibold text-sm text-slate-700">Time</th>
                {days.map(day => (
                  <th
                    key={day.toISOString()}
                    onClick={() => {
                      setCurrentDate(day);
                      setView('day');
                    }}
                    className={`border border-slate-300 bg-slate-100 p-2 text-center font-semibold text-sm cursor-pointer hover:bg-slate-200 transition-colors ${
                      isSameDay(day, new Date()) ? 'bg-blue-100 text-blue-900 hover:bg-blue-200' : 'text-slate-700'
                    }`}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div className="text-lg">{format(day, 'd')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.filter(t => {
                const hour = parseInt(t.split(':')[0]);
                return hour < 12;
              }).map((timeString, slotIndex) => {
                const slotTime = parseTimeString(timeString, currentDate);

                return (
                  <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                    <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                      {format(slotTime, 'h:mm a')}
                    </td>
                    {days.map(day => {
                      const dayKey = day.toISOString();
                      
                      // Check if this cell is covered by a previous rowSpan
                      if (coveredCells[dayKey][timeString]) {
                        return null;
                      }

                      const cellSlotTime = parseTimeString(timeString, day);
                      const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                      const cellEvents = getEventsForCellSlot(day, timeString);
                      const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));

                      let rowSpan = 1;
                      let cellContent = null;

                      if (eventsStartingHere.length > 1) {
                        cellContent = (
                          <OverlapSummaryCard 
                            cellEvents={cellEvents} 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, null, null);
                            }}
                          />
                        );
                      } else if (eventsStartingHere.length === 1) {
                        const event = eventsStartingHere[0];
                        rowSpan = calculateEventSlotSpan(event);
                        
                        for (let i = 1; i < rowSpan; i++) {
                          const nextSlotIndex = slotIndex + i;
                          if (nextSlotIndex < timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).length) {
                            const nextTimeString = timeSlots[nextSlotIndex];
                            coveredCells[dayKey][nextTimeString] = true;
                          }
                        }
                        
                        cellContent = (
                          <SingleAppointmentCard 
                            event={event}
                            colorClass={getBayColorClass(event.bayId)}
                          />
                        );
                      }

                      return (
                        <td
                          key={day.toISOString()}
                          rowSpan={rowSpan}
                          className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, timeString, day)}
                          onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, null, null)}
                        >
                          <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                            {cellContent}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 p-2 text-sm font-semibold text-white bg-black align-middle text-center">
                LUNCH
              </td>
              {days.map(day => (
                <td key={day.toISOString()} className="border border-slate-300 bg-black"></td>
              ))}
            </tr>

            {timeSlots.filter(t => {
              const hour = parseInt(t.split(':')[0]);
              return hour >= 13;
            }).map((timeString, slotIndex) => {
              const actualSlotIndex = timeSlots.findIndex(t => t === timeString);
              const slotTime = parseTimeString(timeString, currentDate);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                    {format(slotTime, 'h:mm a')}
                  </td>
                  {days.map(day => {
                    const dayKey = day.toISOString();
                    
                    if (coveredCells[dayKey][timeString]) {
                      return null;
                    }

                    const cellSlotTime = parseTimeString(timeString, day);
                    const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                    const cellEvents = getEventsForCellSlot(day, timeString);
                    const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));
                    
                    let rowSpan = 1;
                    let cellContent = null;

                    if (eventsStartingHere.length > 1) {
                      cellContent = (
                        <OverlapSummaryCard 
                          cellEvents={cellEvents} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, null, null);
                          }}
                        />
                      );
                    } else if (eventsStartingHere.length === 1) {
                      const event = eventsStartingHere[0];
                      rowSpan = calculateEventSlotSpan(event);
                      
                      for (let i = 1; i < rowSpan; i++) {
                        const nextSlotIndex = actualSlotIndex + i;
                        if (nextSlotIndex < timeSlots.length) {
                          const nextTimeString = timeSlots[nextSlotIndex];
                          coveredCells[dayKey][nextTimeString] = true;
                        }
                      }
                      
                      cellContent = (
                        <SingleAppointmentCard 
                          event={event}
                          colorClass={getBayColorClass(event.bayId)}
                        />
                      );
                    }

                    return (
                      <td
                        key={day.toISOString()}
                        rowSpan={rowSpan}
                        className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, timeString, day)}
                        onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, null, null)}
                      >
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                          {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTechView = () => {
    const day = currentDate;
    const resources = techResources;

    // Create a map to track which cells are covered by rowSpan for each resource
    const coveredCells = {};
    resources.forEach(resource => {
      coveredCells[resource.id] = {};
    });

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="border border-slate-300 bg-slate-100 p-2 w-20 text-left font-semibold text-sm text-slate-700">Time</th>
              {resources.map(resource => (
                <th key={resource.id} className="border border-slate-300 bg-slate-100 p-2 text-center font-semibold text-sm text-slate-700">
                  {resource.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.filter(t => {
              const hour = parseInt(t.split(':')[0]);
              return hour < 12;
            }).map((timeString, slotIndex) => {
              const slotTime = parseTimeString(timeString, day);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                    {format(slotTime, 'h:mm a')}
                  </td>
                  {resources.map(resource => {
                    // Check if this cell is covered by a previous rowSpan
                    if (coveredCells[resource.id][timeString]) {
                      return null;
                    }

                    const cellDay = day;
                    const cellSlotTime = parseTimeString(timeString, cellDay);
                    const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                    const cellEvents = getEventsForCellSlot(cellDay, timeString, resource.id);
                    const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));

                    let rowSpan = 1;
                    let cellContent = null;

                    if (eventsStartingHere.length > 1) {
                      cellContent = (
                        <OverlapSummaryCard 
                          cellEvents={cellEvents} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, resource.id, resource.title);
                          }}
                        />
                      );
                    } else if (eventsStartingHere.length === 1) {
                      const event = eventsStartingHere[0];
                      rowSpan = calculateEventSlotSpan(event);
                      
                      for (let i = 1; i < rowSpan; i++) {
                        const nextSlotIndex = slotIndex + i;
                        if (nextSlotIndex < timeSlots.filter(t => parseInt(t.split(':')[0]) < 12).length) {
                          const nextTimeString = timeSlots[nextSlotIndex];
                          coveredCells[resource.id][nextTimeString] = true;
                        }
                      }
                      
                      cellContent = (
                        <SingleAppointmentCard 
                          event={event}
                        />
                      );
                    }

                    return (
                      <td
                        key={resource.id}
                        rowSpan={rowSpan}
                        className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, timeString, cellDay, resource.id)}
                        onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, resource.id, resource.title)}
                      >
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                          {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr style={{ height: '60px' }}>
              <td className="border border-slate-300 p-2 text-sm font-semibold text-white bg-black align-middle text-center">
                LUNCH
              </td>
              {resources.map(resource => (
                <td key={resource.id} className="border border-slate-300 bg-black"></td>
              ))}
            </tr>

            {timeSlots.filter(t => {
              const hour = parseInt(t.split(':')[0]);
              return hour >= 13;
            }).map((timeString, slotIndex) => {
              const actualSlotIndex = timeSlots.findIndex(t => t === timeString);
              const slotTime = parseTimeString(timeString, day);

              return (
                <tr key={timeString} style={{ height: `${MIN_SLOT_HEIGHT_PX}px` }}>
                  <td className="border border-slate-300 p-2 text-sm font-semibold text-slate-600 align-top bg-slate-50">
                    {format(slotTime, 'h:mm a')}
                  </td>
                  {resources.map(resource => {
                    if (coveredCells[resource.id][timeString]) {
                      return null;
                    }

                    const cellDay = day;
                    const cellSlotTime = parseTimeString(timeString, cellDay);
                    const cellSlotEnd = addMinutes(cellSlotTime, SLOT_DURATION_MINUTES);
                    const cellEvents = getEventsForCellSlot(cellDay, timeString, resource.id);
                    const eventsStartingHere = cellEvents.filter(event => eventStartsAtSlot(event, cellSlotTime));
                    
                    let rowSpan = 1;
                    let cellContent = null;

                    if (eventsStartingHere.length > 1) {
                      cellContent = (
                        <OverlapSummaryCard 
                          cellEvents={cellEvents} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, resource.id, resource.title);
                          }}
                        />
                      );
                    } else if (eventsStartingHere.length === 1) {
                      const event = eventsStartingHere[0];
                      rowSpan = calculateEventSlotSpan(event);
                      
                      for (let i = 1; i < rowSpan; i++) {
                        const nextSlotIndex = actualSlotIndex + i;
                        if (nextSlotIndex < timeSlots.length) {
                          const nextTimeString = timeSlots[nextSlotIndex];
                          coveredCells[resource.id][nextTimeString] = true;
                        }
                      }
                      
                      cellContent = (
                        <SingleAppointmentCard 
                          event={event}
                        />
                      );
                    }

                    return (
                      <td
                        key={resource.id}
                        rowSpan={rowSpan}
                        className={`border border-slate-300 p-1 relative transition-colors bg-white hover:bg-slate-50 cursor-pointer align-top ${moveMode ? 'bg-blue-50 cursor-crosshair' : ''}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, timeString, cellDay, resource.id)}
                        onClick={() => handleCellClick(cellEvents, cellSlotTime, cellSlotEnd, null, resource.id, resource.title)}
                      >
                        <div className="w-full flex items-stretch" style={{ height: `${rowSpan * MIN_SLOT_HEIGHT_PX}px` }}>
                          {cellContent}
                        </div>
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
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-7 bg-slate-100 border-b-2 border-slate-300">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center py-3 text-sm font-semibold text-slate-700 border-r border-slate-200 last:border-r-0">
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
                className={`min-h-[120px] border-r border-b border-slate-200 p-2 cursor-pointer hover:bg-slate-50 transition-colors ${
                  !isCurrentMonth ? 'bg-slate-50' : 'bg-white'
                } ${idx % 7 === 6 ? 'border-r-0' : ''} ${moveMode ? 'cursor-crosshair bg-blue-50' : ''}`}
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
                  !isCurrentMonth ? 'text-slate-400' : 'text-slate-900'
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
                        className={`text-xs px-2 py-1 bg-slate-100 rounded border border-slate-200 truncate hover:bg-slate-200 transition-colors cursor-pointer ${
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
                        <div className={`font-medium text-slate-900 truncate ${
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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
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
          <h2 className="text-xl font-semibold text-slate-900 ml-2">
            {view === 'month' 
              ? format(currentDate, 'MMMM yyyy')
              : (view === 'week' || view === 'day' || view === 'tech')
              ? `${format(displayDays[0], 'MMM d')} - ${format(displayDays[displayDays.length - 1], 'MMM d, yyyy')}`
              : format(currentDate, 'EEEE, MMMM d, yyyy')
            }
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {view === 'day' && employees.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Techs:</span>
              <div className="flex items-center gap-3 flex-wrap">
                {employees.map(tech => (
                  <div key={tech.id} className="flex items-center gap-1.5">
                    <div 
                      className="w-3 h-3 rounded-full border-2"
                      style={{ 
                        backgroundColor: techColors[tech.id] + '40',
                        borderColor: techColors[tech.id]
                      }}
                    ></div>
                    <span className="text-xs text-slate-700">
                      {tech.first_name} {tech.last_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'month'
                  ? 'bg-black text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'week'
                  ? 'bg-black text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'day'
                  ? 'bg-black text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setView('tech')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'tech'
                  ? 'bg-black text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tech
            </button>
          </div>
        </div>
      </div>

      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}
      {view === 'tech' && renderTechView()}

      {contextMenu && (
        <div
          className="fixed bg-white shadow-lg rounded-lg border border-slate-200 py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
            onClick={handleContextEdit}
          >
            <Edit2 className="w-4 h-4" />
            Edit Details
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
            onClick={handleContextMove}
          >
            <Move className="w-4 h-4" />
            Move Appointment
          </button>
          {contextMenu.event.workOrder && (
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2"
              onClick={handleContextOpenWorkOrder}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M19.5 6.75A3 3 0 0016.5 3H7.5A3 3 0 004.5 6.75v10.5A3 3 0 007.5 20.25h9A3 3 0 0019.5 17.25V6.75zM17.25 9a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V6.75a.75.75 0 01.75-.75H16.5a.75.75 0 01.75.75V9z" />
                <path fillRule="evenodd" d="M12 11.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V12a.75.75 0 01.75-.75z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M13.253 11.854a.75.75 0 00-1.06 0l-.75.75a.75.75 0 101.06 1.06l.75-.75a.75.75 0 000-1.06z" clipRule="evenodd" />
              </svg>
              Open Work Order
            </button>
          )}
          <button 
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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
    </div>
  );
}