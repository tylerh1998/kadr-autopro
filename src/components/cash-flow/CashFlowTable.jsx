import React from 'react';
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import moment from "moment";

export default function CashFlowTable({ rows, onRowChange }) {
  const headers = [
    { id: 'due', label: 'Due', width: 'w-24' },
    { id: 'supplier', label: 'Supplier', width: 'w-64' },
    { id: 'amount', label: 'Amount', width: 'w-32' },
    { id: 'dueDate', label: 'Due Date', width: 'w-40' },
    { id: 'datePaid', label: 'Date Paid', width: 'w-40' },
    { id: 'chqNumber', label: 'Chq #', width: 'w-32' },
    { id: 'method', label: 'Method', width: 'w-40' },
  ];

  const handleChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    onRowChange(newRows);
  };

  const getDueInfo = (dateStr) => {
    if (!dateStr || !dateStr.trim()) return { text: "Empty", className: "bg-white text-slate-300" };
    
    const date = moment(dateStr, ["YYYY-MM-DD", "MMM D", "MMM DD", "MM/DD/YYYY", "M/D/YYYY", "YYYY-M-D"], false);
    // Fallback to loose parsing if specific formats fail, but usually explicit is safer. 
    // Let's rely on moment's default hook which is decent for "Feb 8"
    const mDate = moment(dateStr);
    
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
                <th key={header.id} className={cn("p-2 text-left text-slate-700 font-semibold border-r last:border-r-0", header.width)}>
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b last:border-b-0 hover:bg-slate-50">
                <td className="p-2 text-center text-slate-400 text-xs">{index + 1}</td>
                
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
                <td className="p-1 border-r">
                  <Input 
                    value={row.supplier || ''} 
                    onChange={(e) => handleChange(index, 'supplier', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                    placeholder="Supplier Name"
                  />
                </td>

                {/* Amount */}
                <td className="p-1 border-r">
                  <Input 
                    type="number"
                    value={row.amount || ''} 
                    onChange={(e) => handleChange(index, 'amount', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent text-right font-mono"
                    placeholder="0.00"
                  />
                </td>

                {/* Due Date */}
                <td className="p-1 border-r">
                  <Input 
                    type="text"
                    value={row.dueDate || ''} 
                    onChange={(e) => handleChange(index, 'dueDate', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                    placeholder="Feb 8"
                  />
                </td>

                {/* Date Paid */}
                <td className="p-1 border-r">
                  <Input 
                    type="text"
                    value={row.datePaid || ''} 
                    onChange={(e) => handleChange(index, 'datePaid', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                    placeholder="Paid Date"
                  />
                </td>

                {/* Chq # */}
                <td className="p-1 border-r">
                  <Input 
                    value={row.chqNumber || ''} 
                    onChange={(e) => handleChange(index, 'chqNumber', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                  />
                </td>

                {/* Method */}
                <td className="p-1">
                  <Select 
                    value={row.method || ''} 
                    onValueChange={(value) => handleChange(index, 'method', value)}
                  >
                    <SelectTrigger className="border-0 h-8 focus:ring-1 bg-transparent">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="E-Transfer">E-Transfer</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Pre-Authorized">Pre-Authorized</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}