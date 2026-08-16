import React from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Lock,
  LockOpen,
  DollarSign,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Car as CarIcon,
  Ban
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const StatusBadge = ({ status, workOrderStatuses }) => {
  const colorMap = {
    slate: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600",
    gray: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:border-gray-600",
    zinc: "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-700/60 dark:text-zinc-300 dark:border-zinc-600",
    neutral: "bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-700/60 dark:text-neutral-300 dark:border-neutral-600",
    stone: "bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-700/60 dark:text-stone-300 dark:border-stone-600",
    red: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
    orange: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
    amber: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800",
    lime: "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-800",
    green: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
    teal: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800",
    cyan: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800",
    sky: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800",
    blue: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
    indigo: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800",
    violet: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800",
    purple: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
    fuchsia: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-800",
    pink: "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800",
    rose: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800",
  };

  const statusObj = workOrderStatuses?.find(s => s.name === status);
  const colorKey = statusObj?.color || 'slate';
  const badgeClass = colorMap[colorKey] || colorMap['slate'];
  
  return (
    <Badge className={`${badgeClass} border font-medium h-5 px-2 text-[10px] whitespace-nowrap`}>
      {status}
    </Badge>
  );
};

export default function WorkOrderTable({
  workOrders,
  customers,
  vehicles,
  onSelect,
  currentUser,
  workOrderStatuses,
  currentSort,
  onSortChange,
  onVoid,
  onClearLock
}) {
  const getCustomerName = (workOrder) => {
    const customer = workOrder.Customer || customers.find(c => c.id === workOrder.customer_id);
    if (!customer) return 'Customer Not Found';
    
    if (customer.org_name && customer.org_name.trim() !== '') {
      return customer.org_name;
    }
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed Customer';
  };

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const getStageDate = (workOrder) => {
    if (workOrder.stage === 'estimate' && workOrder.est_date) {
      return { label: 'Est', date: workOrder.est_date };
    } else if (workOrder.stage === 'work_order' && workOrder.wo_date) {
      return { label: 'WO', date: workOrder.wo_date };
    } else if (workOrder.stage === 'invoice' && workOrder.invoice_date) {
      return { label: 'Inv', date: workOrder.invoice_date };
    } else if (workOrder.stage === 'credit_invoice' && workOrder.invoice_date) {
      return { label: 'CrInv', date: workOrder.invoice_date };
    } else if (workOrder.completed_date) {
      return { label: 'Completed', date: workOrder.completed_date };
    }
    return null;
  };

  const handleRowClick = (workOrder) => {
    const url = `/WorkOrderEdit?id=${workOrder.ro_number}`;
    
    if (currentUser?.OpenNewWindow === false) {
      window.location.href = url;
    } else {
      const windowFeatures = 'width=1600,height=1000,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
      window.open(url, '_blank', windowFeatures);
    }
  };

  const handleHeaderClick = (column) => {
    if (!onSortChange) return;

    let newSort = '';
    switch (column) {
      case 'wo_number':
        newSort = currentSort === 'number_desc' ? 'number_asc' : 'number_desc';
        break;
      case 'customer':
        newSort = currentSort === 'customer_az' ? 'customer_za' : 'customer_az';
        break;
      case 'date':
        newSort = currentSort === 'date_newest' ? 'date_oldest' : 'date_newest';
        break;
      case 'amount':
        newSort = currentSort === 'amount_highest' ? 'amount_lowest' : 'amount_highest';
        break;
      default:
        return;
    }
    onSortChange(newSort);
  };

  const getSortIcon = (column) => {
    if (!currentSort) return <ArrowUpDown className="ml-2 h-3 w-3" />;

    let isActive = false;
    let isAsc = false;

    switch (column) {
      case 'wo_number':
        isActive = currentSort.includes('number');
        isAsc = currentSort === 'number_asc';
        break;
      case 'customer':
        isActive = currentSort.includes('customer');
        isAsc = currentSort === 'customer_az'; // A-Z is "ascending"
        break;
      case 'date':
        isActive = currentSort.includes('date');
        isAsc = currentSort === 'date_oldest'; // Oldest first is ascending date
        break;
      case 'amount':
        isActive = currentSort.includes('amount');
        isAsc = currentSort === 'amount_lowest'; // Lowest first is ascending
        break;
    }

    if (!isActive) return <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return isAsc ? <ArrowUp className="ml-2 h-3 w-3 text-slate-900 dark:text-slate-100" /> : <ArrowDown className="ml-2 h-3 w-3 text-slate-900 dark:text-slate-100" />;
  };

  return (
    <TooltipProvider>
      <div className="bg-card rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
              <tr>
                <th className="px-4 py-3 w-[120px]">Status</th>
                <th 
                  className="px-4 py-3 w-[140px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleHeaderClick('wo_number')}
                >
                  <div className="flex items-center">
                    WO #
                    {getSortIcon('wo_number')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 w-[200px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleHeaderClick('customer')}
                >
                  <div className="flex items-center">
                    Customer
                    {getSortIcon('customer')}
                  </div>
                </th>
                <th className="px-4 py-3 w-[250px]">Vehicle</th>
                <th className="px-4 py-3">Description</th>
                <th 
                  className="px-4 py-3 w-[140px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleHeaderClick('date')}
                >
                  <div className="flex items-center">
                    Date
                    {getSortIcon('date')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 w-[120px] text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => handleHeaderClick('amount')}
                >
                  <div className="flex items-center justify-end">
                    Amount
                    {getSortIcon('amount')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workOrders.map((workOrder) => {
                const customer = workOrder.Customer || customers.find(c => c.id === workOrder.customer_id);
                const vehicle = workOrder.Vehicle || vehicles.find(v => v.id === workOrder.vehicle_id);
                
                const contactPerson = (customer && customer.org_name && (customer.first_name || customer.last_name)) 
                  ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() 
                  : null;

                const displayNumber = workOrder.stage === 'estimate' ? workOrder.est_number :
                                    workOrder.stage === 'invoice' ? workOrder.inv_number :
                                    workOrder.stage === 'credit_invoice' ? workOrder.crinv_number :
                                    workOrder.wo_number;
                
                const isLocked = workOrder.LockedByUser && workOrder.LockedByUser.trim() !== '';
                const stageDate = getStageDate(workOrder);
                
                return (
                  <ContextMenu key={workOrder.id}>
                    <ContextMenuTrigger asChild>
                      <tr 
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                        onClick={() => handleRowClick(workOrder)}
                      >
                        <td className="px-4 py-2">
                          {['invoice', 'credit_invoice'].includes(workOrder.stage) ? (
                            <Badge className={`${workOrder.stage === 'credit_invoice' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60' : 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/60'} border font-medium h-5 px-2 text-[10px] whitespace-nowrap`}>
                              {workOrder.stage === 'credit_invoice' ? 'Credit Inv' : 'Invoice'}
                            </Badge>
                          ) : (
                            <StatusBadge status={workOrder.status} workOrderStatuses={workOrderStatuses} />
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                          {isLocked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60 flex items-center gap-1.5 h-6 px-2 w-fit cursor-help">
                                    <Lock className="w-3 h-3" />
                                    <span>{displayNumber || workOrder.ro_number}</span>
                                  </Badge>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-slate-900 text-white">
                                <p className="text-xs">Locked by: <span className="font-bold">{workOrder.LockedByUser}</span></p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span>{displayNumber || workOrder.ro_number}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]" title={contactPerson ? `Contact: ${contactPerson}` : getCustomerName(workOrder)}>
                          {getCustomerName(workOrder)}
                        </td>
                        <td className="px-4 py-2 text-black dark:text-slate-200 truncate max-w-[250px]" title={vehicle?.unit_number ? `Unit #: ${vehicle.unit_number}` : ''}>
                          {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-black dark:text-slate-200 truncate max-w-[300px]">
                          {workOrder.description}
                        </td>
                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {stageDate && stageDate.date && (() => {
                            const parsedDate = parseLocalDate(stageDate.date);
                            return parsedDate && !isNaN(parsedDate.getTime()) ? (
                              <span>{format(parsedDate, 'MMM d, yyyy')}</span>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-0.5 font-bold text-slate-900 dark:text-slate-100">
                            <DollarSign className="w-3 h-3" />
                            {(workOrder.total_amount || 0).toFixed(2)}
                          </div>
                          {workOrder.estimated_hours && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {workOrder.estimated_hours}h est
                            </div>
                          )}
                        </td>
                      </tr>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          const woNum = workOrder.ro_number ? workOrder.ro_number.replace(/^RO/i, '') : '';
                          navigator.clipboard.writeText(woNum);
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy WO#
                      </ContextMenuItem>
                      <ContextMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (vehicle?.vin) {
                            navigator.clipboard.writeText(vehicle.vin);
                          }
                        }}
                        disabled={!vehicle?.vin}
                      >
                        <CarIcon className="mr-2 h-4 w-4" />
                        Copy VIN
                      </ContextMenuItem>
                      {workOrder.stage === 'estimate' && onVoid && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onVoid(workOrder);
                            }}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Expired/Void
                          </ContextMenuItem>
                        </>
                      )}
                      {isLocked && onClearLock && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearLock(workOrder);
                            }}
                            className="bg-red-600 text-white focus:bg-red-700 focus:text-white dark:bg-red-600 dark:text-white dark:focus:bg-red-700"
                          >
                            <LockOpen className="mr-2 h-4 w-4" />
                            Clear Lock
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}