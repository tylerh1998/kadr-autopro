import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * LaborCostBarChart Component
 * Displays a bar chart showing labor cost distribution by category
 */
export default function LaborCostBarChart({ data, title, categoryKey, valueKey, height = 400 }) {
  // Color palette for bars
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#14b8a6', // teal
  ];

  // Custom tooltip to format currency values
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold text-slate-900 mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Total Cost:</span>
              <span className="font-semibold text-slate-900">
                ${payload[0].value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Employees:</span>
              <span className="font-semibold text-slate-900">{data.employeeCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Paycheques:</span>
              <span className="font-semibold text-slate-900">{data.paychequeCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Avg per Employee:</span>
              <span className="font-semibold text-slate-900">
                ${(payload[0].value / data.employeeCount).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format Y-axis values as currency
  const formatYAxis = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  // Format label for X-axis (truncate if too long)
  const formatXAxisLabel = (value) => {
    if (value.length > 15) {
      return value.substring(0, 12) + '...';
    }
    return value;
  };

  return (
    <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="dark:text-slate-100">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={categoryKey}
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              angle={-45}
              textAnchor="end"
              height={80}
              tickFormatter={formatXAxisLabel}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={formatYAxis}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={valueKey} name="Total Payroll Cost" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary Statistics */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              ${data.reduce((sum, item) => sum + item[valueKey], 0).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Total Cost</p>
          </div>
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.length}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Categories</p>
          </div>
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {data.reduce((sum, item) => sum + item.employeeCount, 0)}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Total Employees</p>
          </div>
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {data.reduce((sum, item) => sum + item.paychequeCount, 0)}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Total Paycheques</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
