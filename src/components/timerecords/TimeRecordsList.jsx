import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, Clock, Lock } from "lucide-react";

export default function TimeRecordsList({ records, isLoading }) {
  const formatTime = (dateString) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "h:mm a");
    } catch (e) {
      return "-";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch (e) {
      return "-";
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'clocked_in':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><Clock className="w-3 h-3 mr-1" /> Clocked In</Badge>;
      case 'clocked_out':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Clocked Out</Badge>;
      case 'locked':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Lock className="w-3 h-3 mr-1" /> Locked</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-48 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-gray-50 text-gray-500">
        No records found for the selected period.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm text-left print-table">
        <thead className="bg-gray-50">
          <tr className="border-b">
            <th className="h-12 px-4 align-middle font-semibold text-gray-500">Employee</th>
            <th className="h-12 px-4 align-middle font-semibold text-gray-500">Date</th>
            <th className="h-12 px-4 align-middle font-semibold text-gray-500">Time In</th>
            <th className="h-12 px-4 align-middle font-semibold text-gray-500">Time Out</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">Hours</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">Day Total</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">Regular</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">OT</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">PTO</th>
            <th className="h-12 px-4 align-middle font-semibold text-right text-gray-500">STAT</th>
            <th className="h-12 px-4 align-middle font-semibold text-gray-500 no-print">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b hover:bg-gray-50">
              <td className="p-4 align-middle">{record.employee_name}</td>
              <td className="p-4 align-middle font-medium">{formatDate(record.clock_in_time)}</td>
              <td className="p-4 align-middle">{formatTime(record.clock_in_time)}</td>
              <td className="p-4 align-middle">{formatTime(record.clock_out_time)}</td>
              <td className="p-4 align-middle text-right text-gray-600">
                {record.total_hours ? record.total_hours.toFixed(2) + 'h' : '-'}
              </td>
              <td className="p-4 align-middle text-right font-bold">
                {record.dayTotal ? record.dayTotal.toFixed(2) + 'h' : ''}
              </td>
              <td className="p-4 align-middle text-right">{record.regularHours ? record.regularHours.toFixed(2) + 'h' : ''}</td>
              <td className="p-4 align-middle text-right text-red-600">{record.overtimeHours ? record.overtimeHours.toFixed(2) + 'h' : ''}</td>
              <td className="p-4 align-middle text-right text-purple-600">{record.pto_hours ? Number(record.pto_hours).toFixed(2) + 'h' : '-'}</td>
              <td className="p-4 align-middle text-right text-orange-600">{record.stat_hours ? Number(record.stat_hours).toFixed(2) + 'h' : '-'}</td>
              <td className="p-4 align-middle no-print">{getStatusBadge(record.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}