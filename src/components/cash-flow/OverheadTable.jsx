import React from 'react';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from 'lucide-react';

export default function OverheadTable({ rows, onRowChange, sortConfig, onSort }) {
  const headers = [
    { id: 'description', label: 'Description', width: 'w-64', sortable: true },
    { id: 'amount', label: 'Amount', width: 'w-32', sortable: true },
    { id: 'dateOption', label: 'Date', width: 'w-40', sortable: true },
    { id: 'method', label: 'Method', width: 'w-40', sortable: true },
  ];

  const methodColors = {
    "SCU MC": "text-blue-600",
    "ATB MC": "text-red-600",
    "SCU Bank": "text-green-600",
    "Payroll": "text-yellow-600"
  };

  const formatCurrencyInput = (value) => {
    if (!value) return '';
    const numericVal = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
    if (isNaN(numericVal)) return value;
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(numericVal);
  };

  const handleChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    onRowChange(newRows);
  };

  const handleBlur = (index, field, value) => {
    const formatted = formatCurrencyInput(value);
    if (formatted !== value) {
        handleChange(index, field, formatted);
    }
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
            {rows.map((row, index) => (
              <tr key={index} className="border-b last:border-b-0 hover:bg-slate-50 transition-colors">
                <td className="p-2 text-center text-xs text-slate-400 select-none">
                  {index + 1}
                </td>

                {/* Description */}
                <td className="p-1 border-r">
                  <Input 
                    value={row.description || ''} 
                    onChange={(e) => handleChange(index, 'description', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent"
                    placeholder="Description"
                  />
                </td>

                {/* Amount */}
                <td className="p-1 border-r">
                  <Input 
                    type="text"
                    value={row.amount || ''} 
                    onChange={(e) => handleChange(index, 'amount', e.target.value)}
                    onBlur={(e) => handleBlur(index, 'amount', e.target.value)}
                    className="border-0 h-8 focus-visible:ring-1 bg-transparent text-right font-mono"
                    placeholder="$0.00"
                  />
                </td>

                {/* Date Option */}
                <td className="p-1 border-r">
                  <Select 
                    value={row.dateOption || ''} 
                    onValueChange={(value) => handleChange(index, 'dateOption', value)}
                  >
                    <SelectTrigger className="border-0 h-8 focus:ring-1 bg-transparent">
                      <SelectValue placeholder="Select Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Month Start">Month Start</SelectItem>
                      <SelectItem value="Month End">Month End</SelectItem>
                      <SelectItem value="8th">8th</SelectItem>
                      <SelectItem value="12th to 15th">12th to 15th</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <SelectItem value="SCU MC" className="text-blue-600 font-medium">SCU MC</SelectItem>
                      <SelectItem value="ATB MC" className="text-red-600 font-medium">ATB MC</SelectItem>
                      <SelectItem value="SCU Bank" className="text-green-600 font-medium">SCU Bank</SelectItem>
                      <SelectItem value="Payroll" className="text-yellow-600 font-medium">Payroll</SelectItem>
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