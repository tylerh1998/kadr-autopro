import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import GLAccountCombobox from './GLAccountCombobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { ArrowUp, ArrowDown, Calendar as CalendarIcon, Trash2, Lock, Calculator, Edit, Check } from 'lucide-react';

const truncateText = (value, max = 25) => {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export default function SupplierTxInvoiceLinesTab({
  filteredInvoiceLines,
  sortConfig,
  requestSort,
  isLockedByOtherUser,
  lockAcquired,
  setSelectedLineId,
  handleLineChange,
  handleDateBlur,
  formatDateForInput,
  safeParseDateForCalendar,
  handleCalendarDateSelect,
  handleValueBlur,
  chartOfAccounts,
  handleGlAccountChange,
  handleDeleteLine,
  handleToggleGstOverride,
  handleEditLineClick,
  handleAddLineAbove,
  handleAddLineBelow,
  isLineLocked,
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="lines-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px] cursor-pointer hover:bg-slate-100" onClick={() => requestSort('invoice_number')}>
              <div className="flex items-center gap-1">Invoice #{sortConfig.key === 'invoice_number' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[180px] cursor-pointer hover:bg-slate-100" onClick={() => requestSort('invoice_date')}>
              <div className="flex items-center gap-1">Date{sortConfig.key === 'invoice_date' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => requestSort('description')}>
              <div className="flex items-center gap-1">Description{sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[120px] text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('charge')}>
              <div className="flex items-center justify-end gap-1">Charge{sortConfig.key === 'charge' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[120px] text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('gst')}>
              <div className="flex items-center justify-end gap-1">GST{sortConfig.key === 'gst' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[120px] text-right cursor-pointer hover:bg-slate-100" onClick={() => requestSort('line_total')}>
              <div className="flex items-center justify-end gap-1">Line Total{sortConfig.key === 'line_total' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[200px] cursor-pointer hover:bg-slate-100" onClick={() => requestSort('gl_account')}>
              <div className="flex items-center gap-1">GL Account *{sortConfig.key === 'gl_account' && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
            </TableHead>
            <TableHead className="w-[80px] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <tfoot className="print:table-footer-group hidden font-bold bg-gray-100">
          <tr>
            <td colSpan={3} className="text-right p-1 border border-gray-300">Totals:</td>
            <td className="text-right p-1 border border-gray-300">${filteredInvoiceLines.reduce((sum, line) => sum + (parseFloat(line.charge) || 0), 0).toFixed(2)}</td>
            <td className="text-right p-1 border border-gray-300">${filteredInvoiceLines.reduce((sum, line) => sum + (parseFloat(line.gst) || 0), 0).toFixed(2)}</td>
            <td className="text-right p-1 border border-gray-300">${filteredInvoiceLines.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0).toFixed(2)}</td>
            <td colSpan={2} className="border border-gray-300"></td>
          </tr>
        </tfoot>
        <TableBody>
          {filteredInvoiceLines.map((line, index) => {
            const locked = isLineLocked(line);
            const isDisabled = isLockedByOtherUser || !lockAcquired || locked;
            const isEditDisabled = isLockedByOtherUser || !lockAcquired || locked;
            return (
              <ContextMenu key={line.id}>
                <ContextMenuTrigger asChild>
                  <TableRow className={`${line.isNew || line.id.startsWith('temp_') ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`} onClick={() => setSelectedLineId(line.id)}>
                    <TableCell>
                      <Input value={line.invoice_number || ''} onChange={(e) => !isDisabled && handleLineChange(line.id, 'invoice_number', e.target.value)} onFocus={() => setSelectedLineId(line.id)} readOnly={isDisabled || line.inventory} className={`bg-white ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input type="text" value={line.invoice_date && line.invoice_date.length === 10 && line.invoice_date.includes('-') ? formatDateForInput(line.invoice_date) : line.invoice_date || ''} onChange={(e) => !isDisabled && handleLineChange(line.id, 'invoice_date', e.target.value)} onBlur={(e) => !isDisabled && handleDateBlur(line.id, e.target.value)} onFocus={() => setSelectedLineId(line.id)} placeholder="MM/DD/YYYY" className={`w-[6.25rem] bg-white ${line.dateError ? 'text-red-600 border-red-500' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`} readOnly={isDisabled || line.inventory} title={line.dateError || ''} />
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" disabled={isDisabled || line.inventory} className="h-10 w-10"><CalendarIcon className="h-4 w-4" /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={safeParseDateForCalendar(line.invoice_date)} onSelect={(date) => handleCalendarDateSelect(line, date)} disabled={isDisabled} />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Textarea value={line.description || ''} onChange={(e) => !isDisabled && handleLineChange(line.id, 'description', e.target.value)} onFocus={() => setSelectedLineId(line.id)} rows={2} className={`resize-none bg-white ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`} readOnly={isDisabled || line.inventory} />
                    </TableCell>
                    <TableCell className={(typeof line.charge === 'number' && line.charge < 0) || (typeof line.charge === 'string' && line.charge !== '' && isNaN(parseFloat(line.charge))) ? 'text-red-600' : ''}>
                      <Input type="text" value={typeof line.charge === 'number' ? line.charge.toFixed(2) : line.charge || ''} onChange={(e) => !isDisabled && handleLineChange(line.id, 'charge', e.target.value)} onBlur={(e) => !isDisabled && handleValueBlur(line.id, 'charge', e.target.value)} onFocus={() => setSelectedLineId(line.id)} className={`text-right bg-white ${typeof line.charge === 'string' && line.charge !== '' && isNaN(parseFloat(line.charge)) ? 'text-red-600 border-red-300' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`} readOnly={isDisabled || line.inventory} />
                    </TableCell>
                    <TableCell className={(typeof line.gst === 'number' && line.gst < 0) || (typeof line.gst === 'string' && line.gst !== '' && isNaN(parseFloat(line.gst))) ? 'text-red-600' : ''}>
                      <Input type="text" value={typeof line.gst === 'number' ? line.gst.toFixed(2) : line.gst || ''} onChange={(e) => !isLockedByOtherUser && lockAcquired && !locked && line.gst_override && handleLineChange(line.id, 'gst', e.target.value)} onBlur={(e) => !isLockedByOtherUser && lockAcquired && !locked && line.gst_override && handleValueBlur(line.id, 'gst', e.target.value)} onFocus={() => setSelectedLineId(line.id)} className={`text-right bg-white ${typeof line.gst === 'string' && line.gst !== '' && isNaN(parseFloat(line.gst)) ? 'text-red-600 border-red-300' : ''} ${isLockedByOtherUser || !lockAcquired || locked || !line.gst_override ? 'cursor-not-allowed' : ''}`} readOnly={isLockedByOtherUser || !lockAcquired || locked || !line.gst_override} />
                    </TableCell>
                    <TableCell className={(typeof line.line_total === 'number' && line.line_total < 0) || line.line_total === 'Error' ? 'text-red-600' : ''}>
                      <Input type="text" value={typeof line.line_total === 'number' ? line.line_total.toFixed(2) : line.line_total || ''} onChange={(e) => !isDisabled && handleLineChange(line.id, 'line_total', e.target.value)} onBlur={(e) => !isDisabled && handleValueBlur(line.id, 'line_total', e.target.value)} onFocus={() => setSelectedLineId(line.id)} className={`text-right bg-white ${line.line_total === 'Error' ? 'text-red-600 border-red-300' : ''} ${isDisabled || line.inventory ? 'cursor-not-allowed' : ''}`} readOnly={isDisabled || line.inventory} />
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const account = line.gl_account
                          ? chartOfAccounts.find(acc => String(acc.account_number) === String(line.gl_account))
                          : null;
                        const fullGlLabel = account ? `${account.account_number} - ${account.account_name}` : (line.gl_account || '');
                        const truncatedGlLabel = truncateText(fullGlLabel, 25);

                        return (
                          <>
                            <div className="gl-print-text">{fullGlLabel}</div>
                            <div className="gl-select-trigger">
                              <GLAccountCombobox
                                chartOfAccounts={chartOfAccounts}
                                currentValue={line.gl_account ? String(line.gl_account) : ''}
                                selectedLabel={truncatedGlLabel}
                                onChange={(value) => {
                                  if (isLockedByOtherUser || !lockAcquired) return;
                                  handleGlAccountChange(line, value);
                                }}
                                disabled={isLockedByOtherUser || !lockAcquired}
                                className={`${!line.gl_account && (line.invoice_number || line.description || (typeof line.charge === 'number' && line.charge !== 0) || (typeof line.gst === 'number' && line.gst !== 0)) ? 'border-red-300' : ''} ${isLockedByOtherUser || !lockAcquired ? 'cursor-not-allowed' : ''}`}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {locked || line.inventory ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center justify-center w-8 h-8 bg-orange-100 rounded-md"><Lock className="w-4 h-4 text-orange-600" /></div>
                              </TooltipTrigger>
                              <TooltipContent><span>This line is locked because it has a payment applied or is an inventory line.</span></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteLine(line.id)} disabled={isLockedByOtherUser || !lockAcquired} className="h-8 w-8"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleToggleGstOverride(line.id)} disabled={isDisabled} className="h-8 w-8" title={line.gst_override ? 'Switch to automatic GST calculation' : 'Switch to manual GST entry'}>
                          {line.gst_override ? <Calculator className="w-4 h-4 text-blue-600" /> : <Edit className="w-4 h-4 text-slate-400" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleEditLineClick(line)} disabled={isEditDisabled}>Edit Line</ContextMenuItem>
                  <ContextMenuItem onClick={() => handleToggleGstOverride(line.id)} disabled={isLockedByOtherUser || !lockAcquired || locked}>
                    <div className="flex items-center justify-between w-full"><span>Adjust GST</span>{line.gst_override && <Check className="w-4 h-4 ml-2" />}</div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddLineAbove(line.id)} disabled={isLockedByOtherUser || !lockAcquired}>Add Line Above</ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddLineBelow(line.id)} disabled={isLockedByOtherUser || !lockAcquired}>Add Line Below</ContextMenuItem>
                  {!locked && !line.inventory && <ContextMenuItem onClick={() => handleDeleteLine(line.id)} disabled={isLockedByOtherUser || !lockAcquired} className="text-red-600">Delete Line</ContextMenuItem>}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}