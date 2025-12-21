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
        return <Badge className="bg-green-100 text-green-800 border-green-200"><Clock className="w-3 h-3 mr-1" /> In Progress</Badge>;
      case 'clocked_out':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'locked':
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200"><Lock className="w-3 h-3 mr-1" /> Locked</Badge>;
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
      <Table>
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="font-semibold">Date</TableHead>
            <TableHead className="font-semibold">Employee</TableHead>
            <TableHead className="font-semibold">Clock In</TableHead>
            <TableHead className="font-semibold">Clock Out</TableHead>
            <TableHead className="font-semibold text-right">Regular</TableHead>
            <TableHead className="font-semibold text-right">Overtime</TableHead>
            <TableHead className="font-semibold text-right">PTO</TableHead>
            <TableHead className="font-semibold text-right">Stat</TableHead>
            <TableHead className="font-semibold text-right">Total</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id} className="hover:bg-gray-50">
              <TableCell className="font-medium">{formatDate(record.clock_in_time)}</TableCell>
              <TableCell>{record.employee_name}</TableCell>
              <TableCell>{formatTime(record.clock_in_time)}</TableCell>
              <TableCell>{formatTime(record.clock_out_time)}</TableCell>
              <TableCell className="text-right">{record.regularHours ? record.regularHours.toFixed(2) : '-'}</TableCell>
              <TableCell className="text-right text-red-600">{record.overtimeHours ? record.overtimeHours.toFixed(2) : '-'}</TableCell>
              <TableCell className="text-right text-purple-600">{record.pto_hours ? Number(record.pto_hours).toFixed(2) : '-'}</TableCell>
              <TableCell className="text-right text-orange-600">{record.stat_hours ? Number(record.stat_hours).toFixed(2) : '-'}</TableCell>
              <TableCell className="text-right font-bold">
                {((record.total_hours || 0) + (record.pto_hours || 0) + (record.stat_hours || 0)).toFixed(2)}
              </TableCell>
              <TableCell>{getStatusBadge(record.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}