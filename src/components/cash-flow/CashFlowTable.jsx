import React from 'react';
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import moment from "moment";

import { useState } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function CashFlowTable({ rows, onRowChange, sortConfig, onSort }) {
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [currentCommentRowIndex, setCurrentCommentRowIndex] = useState(null);
  const [currentCommentText, setCurrentCommentText] = useState('');
  const headers = [
    { id: 'dueDate', label: 'Due', width: 'w-24', sortable: true }, // Logic uses dueDate
    { id: 'supplier', label: 'Supplier', width: 'w-64', sortable: true },
    { id: 'amount', label: 'Amount', width: 'w-32', sortable: true },
    { id: 'dueDate', label: 'Due Date', width: 'w-24', sortable: true },
    { id: 'amountPaid', label: 'Amount Paid', width: 'w-32', sortable: true },
    { id: 'datePaid', label: 'Date Paid', width: 'w-24', sortable: true },
    { id: 'chqNumber', label: 'Chq #', width: 'w-20', sortable: true },
    { id: 'method', label: 'Method', width: 'w-40', sortable: true },
  ];

  const formatCurrencyInput = (value) => {
    if (!value) return '';
    // Strip non-numeric chars except dot
    const numericVal = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
    if (isNaN(numericVal)) return value;
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(numericVal);
  };

  const handleBlur = (index, field, value) => {
    const formatted = formatCurrencyInput(value);
    if (formatted !== value) {
        handleChange(index, field, formatted);
    }
  };

  const handleAutoFillAmountPaid = (index) => {
    const row = rows[index];
    // Copy amount to amountPaid
    if (row.amount) {
        handleChange(index, 'amountPaid', row.amount);
    }
  };

  const methodColors = {
    "Cheque": "text-green-600",
    "O/L Banking": "text-yellow-600",
    "Credit Card": "text-slate-500",
    "Etransfer": "text-red-600",
    "Pre-auth": "text-blue-600"
  };

  const handleChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    onRowChange(newRows);
  };

  const handleRowAction = (index, action) => {
    const newRows = [...rows];
    if (action === 'mark_paid') {
        newRows[index] = { ...newRows[index], rowStatus: 'paid' };
        onRowChange(newRows);
    } else if (action === 'mark_follow_up') {
        newRows[index] = { ...newRows[index], rowStatus: 'follow_up' };
        onRowChange(newRows);
    } else if (action === 'delete') {
        newRows[index] = {
            due: false,
            supplier: '',
            amount: '',
            amountPaid: '',
            dueDate: '',
            datePaid: '',
            chqNumber: '',
            method: '',
            rowStatus: '',
            comment: ''
        };
        onRowChange(newRows);
    } else if (action === 'comment') {
        setCurrentCommentRowIndex(index);
        setCurrentCommentText(rows[index].comment || '');
        setIsCommentModalOpen(true);
    }
  };

  const handleSaveComment = () => {
    if (currentCommentRowIndex !== null) {
      const newRows = [...rows];
      newRows[currentCommentRowIndex] = { ...newRows[currentCommentRowIndex], comment: currentCommentText };
      onRowChange(newRows);
    }
    setIsCommentModalOpen(false);
  };

  const getRowBgColor = (row) => {
    if (row.chqNumber) return 'bg-green-100';
    if (row.rowStatus === 'paid') return 'bg-purple-100';
    if (row.rowStatus === 'follow_up') return 'bg-orange-100';
    return ''; // Default transparent/white handled by input/td
  };

  const getDueInfo = (dateStr) => {
    if (!dateStr || !dateStr.trim()) return { text: "Empty", className: "bg-white text-slate-300" };
    
    // Explicit formats including those without year (defaults to current year)
    // Adding M/D and MM/DD specifically to catch simple inputs like "2/8"
    const formats = [
      "YYYY-MM-DD", 
      "MMM D", "MMM DD", "MMM D, YYYY", "MMM DD, YYYY",
      "M/D/YYYY", "MM/DD/YYYY", "M-D-YYYY", "MM-DD-YYYY",
      "M/D", "MM/DD" 
    ];
    
    // Use strict parsing with our expanded formats list, or fallback to non-strict if needed
    // moment(..., false) enables non-strict parsing which is usually good for user input
    let mDate = moment(dateStr, formats, true);
    
    if (!mDate.isValid()) {
      // Fallback to loose parsing
      mDate = moment(dateStr);
    }
    
    if (!mDate.isValid()) return { text: "Empty", className: "bg-white text-slate-300" };

    // Compare start of days
    const today = moment().startOf('day');
    const target = mDate.startOf('day');
    const diff = target.diff(today, 'days');

    let className = "bg-white";
    if (diff <= 0) {
      className = "bg-red-100 text-red-700 font-bold";
    } else if (diff <= 10) {
      className = "bg-yellow-100 text-yellow-800 font-medium";
    } else {
      className = "bg-blue-100 text-blue-700 font-medium";
    }

    return { text: `${diff} Days`, className };
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="p-2 w-10 text-center text-slate-500 font-medium">#</th>
              {headers.map(header => (
                <th 
                  key={header.id} 
                  className={cn(
                    "p-2 text-left text-slate-700 font-semibold border-r last:border-r-0 select-none", 
                    header.width,
                    header.sortable && "cursor-pointer hover:bg-slate-200 transition-colors"
                  )}
                  onClick={() => header.sortable && onSort && onSort(header.id)}
                >
                  <div className="flex items-center gap-1">
                    {header.label}
                    {header.sortable && <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const bgClass = getRowBgColor(row);
              const hasComment = row.comment && row.comment.trim().length > 0;
              
              return (
              <ContextMenu key={index}>
                <ContextMenuTrigger asChild>
                  <tr className="border-b last:border-b-0 hover:bg-slate-50 transition-colors">
                    <td 
                      className={cn(
                        "p-2 text-center text-xs cursor-pointer select-none transition-colors",
                        hasComment ? "bg-slate-900 text-white font-bold" : "text-slate-400"
                      )}
                      onClick={() => handleRowAction(index, 'comment')}
                      title={hasComment ? row.comment : undefined}
                    >
                      {index + 1}
                    </td>
                    
                    {/* Due (Calculated) */}
                    {(() => {
                        const { text, className } = getDueInfo(row.dueDate);
                        return (
                            <td className={cn("p-2 border-r text-center text-xs", className)}>
                                {text}
                            </td>
                        );
                    })()}

                    {/* Supplier */}
                    <td className={cn("p-1 border-r", bgClass)}>
                      <Input 
                        value={row.supplier || ''} 
                        onChange={(e) => handleChange(index, 'supplier', e.target.value)}
                        className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                        placeholder="Supplier Name"
                      />
                    </td>

                    {/* Amount */}
                    <td className={cn("p-1 border-r", bgClass)}>
                      <Input 
                        type="text"
                        value={row.amount || ''} 
                        onChange={(e) => handleChange(index, 'amount', e.target.value)}
                        onBlur={(e) => handleBlur(index, 'amount', e.target.value)}
                        className="border-0 h-8 focus-visible:ring-1 bg-transparent text-right font-mono"
                        placeholder="$0.00"
                      />
                    </td>

                    {/* Due Date */}
                    <td className={cn("p-1 border-r relative group", bgClass)}>
                      <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 mr-1 text-slate-300 hover:text-green-600 hover:bg-green-50"
                            onClick={() => handleChange(index, 'dueDate', moment().endOf('month').format('MMM D'))}
                            title="Set to Month End"
                            tabIndex={-1}
                        >
                            <Check className="h-3 w-3" />
                        </Button>
                        <Input 
                            type="text"
                            value={row.dueDate || ''} 
                            onChange={(e) => handleChange(index, 'dueDate', e.target.value)}
                            className="border-0 h-8 focus-visible:ring-1 bg-transparent px-1 text-center flex-1"
                            placeholder=""
                        />
                      </div>
                    </td>

                    {/* Amount Paid */}
                    <td className={cn("p-1 border-r relative group", bgClass)}>
                      <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 mr-1 text-slate-300 hover:text-green-600 hover:bg-green-50"
                            onClick={() => handleAutoFillAmountPaid(index)}
                            title="Auto-fill Full Amount"
                            tabIndex={-1}
                        >
                            <Check className="h-3 w-3" />
                        </Button>
                        <Input 
                            type="text"
                            value={row.amountPaid || ''} 
                            onChange={(e) => handleChange(index, 'amountPaid', e.target.value)}
                            onBlur={(e) => handleBlur(index, 'amountPaid', e.target.value)}
                            className="border-0 h-8 focus-visible:ring-1 bg-transparent text-right font-mono flex-1"
                            placeholder="$0.00"
                        />
                      </div>
                    </td>

                    {/* Date Paid */}
                    <td className={cn("p-1 border-r relative group", bgClass)}>
                      <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 mr-1 text-slate-300 hover:text-green-600 hover:bg-green-50"
                            onClick={() => handleChange(index, 'datePaid', moment().format('MMM D'))}
                            title="Set to Today"
                            tabIndex={-1}
                        >
                            <Check className="h-3 w-3" />
                        </Button>
                        <Input 
                            type="text"
                            value={row.datePaid || ''} 
                            onChange={(e) => handleChange(index, 'datePaid', e.target.value)}
                            className="border-0 h-8 focus-visible:ring-1 bg-transparent px-1 text-center flex-1"
                            placeholder=""
                        />
                      </div>
                    </td>

                    {/* Chq # */}
                    <td className={cn("p-1 border-r", bgClass)}>
                      <Input 
                        value={row.chqNumber || ''} 
                        onChange={(e) => handleChange(index, 'chqNumber', e.target.value)}
                        className="border-0 h-8 focus-visible:ring-1 bg-transparent px-1 text-center"
                      />
                    </td>

                    {/* Method */}
                    <td className="p-1">
                      <Select 
                        value={row.method || ''} 
                        onValueChange={(value) => handleChange(index, 'method', value)}
                      >
                        <SelectTrigger className={cn("border-0 h-8 focus:ring-1 bg-transparent font-medium", methodColors[row.method])}>
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cheque" className="text-green-600 font-medium">Cheque</SelectItem>
                          <SelectItem value="O/L Banking" className="text-yellow-600 font-medium">O/L Banking</SelectItem>
                          <SelectItem value="Credit Card" className="text-slate-500 font-medium">Credit Card</SelectItem>
                          <SelectItem value="Etransfer" className="text-red-600 font-medium">Etransfer</SelectItem>
                          <SelectItem value="Pre-auth" className="text-blue-600 font-medium">Pre-auth</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleRowAction(index, 'mark_paid')}>
                    <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
                    Mark as Paid
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleRowAction(index, 'mark_follow_up')}>
                    <span className="w-2 h-2 rounded-full bg-orange-500 mr-2"></span>
                    Mark for Follow Up
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => handleRowAction(index, 'comment')}>
                    Make Comment
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => handleRowAction(index, 'delete')} className="text-red-600 focus:text-red-600">
                    Delete Row
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              value={currentCommentText} 
              onChange={(e) => setCurrentCommentText(e.target.value)}
              placeholder="Enter your comment here..."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommentModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveComment}>Save Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}