import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "npm:jspdf@2.5.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // In-function auth + paypro_user check - mirrors the live pattern already used by
    // autopro-getSalesAnalysisReport (Authorization header -> auth.getUser()), since a
    // service-role client bypasses RLS entirely and this check has to be written into
    // the function body itself, not assumed from the caller having reached this far.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const { data: caller } = await supabase.from('Employee').select('paypro_user').eq('mykadr_user_id', user.id).maybeSingle();
    if (!caller?.paypro_user) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 200, headers: jsonHeaders });
    }

    const { employeeIds, startDate, endDate } = await req.json();

    if (!employeeIds || !startDate || !endDate || employeeIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 200, headers: jsonHeaders });
    }

    // employeeIds are PayPro_Employee.id values (source used its own Employee.id the same way)
    const { data: selectedEmployees, error: employeesError } = await supabase
      .from('PayPro_Employee')
      .select('*')
      .in('id', employeeIds);
    if (employeesError) throw employeesError;

    if (!selectedEmployees || selectedEmployees.length === 0) {
      return new Response(JSON.stringify({ error: 'No employees found' }), { status: 200, headers: jsonHeaders });
    }

    const { data: allTimeRecords, error: timeRecordsError } = await supabase.from('TimeRecord').select('*');
    if (timeRecordsError) throw timeRecordsError;

    // Process each employee and collect those with data
    const employeesWithData = [];

    for (const employee of selectedEmployees) {
      const fullName = `${employee.first_name} ${employee.last_name}`;

      // Filter records for this employee and date range.
      // Same name-match gap as TimeRecords.jsx (phase_4_implementation_plan.md Q3) -
      // inherited, not fixed here either.
      const records = (allTimeRecords || []).filter((record) => {
        if (record.employee_name !== fullName) return false;
        if (!record.clock_in_time) return false;
        const recordDate = new Date(record.clock_in_time).toISOString().split('T')[0];
        return recordDate >= startDate && recordDate <= endDate;
      });

      if (records.length === 0) {
        continue; // Skip employees with no records
      }

      // Sort by date
      records.sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time));

      // Calculate summary data with daily aggregation
      const recordsByDate = {};
      records.forEach((record) => {
        const date = new Date(record.clock_in_time).toISOString().split('T')[0];
        if (!recordsByDate[date]) recordsByDate[date] = [];
        recordsByDate[date].push(record);
      });

      let regularHours = 0;
      let overtimeHours = 0;
      let ptoHours = 0;
      let statHours = 0;

      Object.keys(recordsByDate).forEach((date) => {
        const dayRecords = recordsByDate[date];
        let dayWorkHours = 0;

        dayRecords.forEach((r) => {
          dayWorkHours += Number(r.total_hours) || 0;
          ptoHours += Number(r.pto_hours) || 0;
          statHours += Number(r.stat_hours) || 0;
        });

        regularHours += Math.min(dayWorkHours, 8);
        overtimeHours += Math.max(0, dayWorkHours - 8);
      });

      employeesWithData.push({ employee, records, recordsByDate, regularHours, overtimeHours, ptoHours, statHours });
    }

    if (employeesWithData.length === 0) {
      return new Response(JSON.stringify({ error: 'No matching employees with time records found' }), { status: 200, headers: jsonHeaders });
    }

    // Create PDF - Landscape orientation
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const rowHeight = 5;
    const maxRowsPerPage = 30;

    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Mountain Time (Alberta) formatting
    const formatTime = (dateTimeStr) => {
      if (!dateTimeStr) return '-';
      const d = new Date(dateTimeStr);
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Edmonton',
      });
    };

    let isFirstEmployee = true;

    // Generate pages for each employee
    for (const empData of employeesWithData) {
      const { employee, records, recordsByDate, regularHours, overtimeHours, ptoHours, statHours } = empData;

      const tableData = [];
      const shownDayTotals = new Set();

      records.forEach((record) => {
        const date = new Date(record.clock_in_time).toISOString().split('T')[0];
        const dayKey = date;
        const showDayTotals = !shownDayTotals.has(dayKey);
        if (showDayTotals) shownDayTotals.add(dayKey);

        const dayRecords = recordsByDate[date];
        let dayTotalWork = 0;
        let dayPto = 0;
        let dayStat = 0;

        dayRecords.forEach((r) => {
          dayTotalWork += Number(r.total_hours) || 0;
          dayPto += Number(r.pto_hours) || 0;
          dayStat += Number(r.stat_hours) || 0;
        });

        const dayTotal = dayTotalWork + dayPto + dayStat;
        const regular = Math.min(dayTotalWork, 8);
        const ot = Math.max(0, dayTotalWork - 8);

        tableData.push({
          date: formatDate(record.clock_in_time),
          timeIn: formatTime(record.clock_in_time),
          timeOut: formatTime(record.clock_out_time),
          hours: Number(record.total_hours || 0).toFixed(2),
          dayTotal: showDayTotals && dayTotal > 0 ? dayTotal.toFixed(2) : '-',
          regular: showDayTotals && regular > 0 ? regular.toFixed(2) : '-',
          ot: showDayTotals && ot > 0 ? ot.toFixed(2) : '-',
          pto: Number(record.pto_hours || 0) > 0 ? Number(record.pto_hours || 0).toFixed(2) : '-',
          stat: Number(record.stat_hours || 0) > 0 ? Number(record.stat_hours || 0).toFixed(2) : '-',
          status: record.status === 'locked' ? 'Locked' : record.status === 'clocked_in' ? 'Clocked In' : 'Clocked Out',
        });
      });

      const totalPagesForEmployee = Math.ceil(tableData.length / maxRowsPerPage) || 1;

      for (let page = 0; page < totalPagesForEmployee; page++) {
        if (!isFirstEmployee || page > 0) doc.addPage();
        isFirstEmployee = false;

        let y = margin;

        // Header
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Time Record Report', margin, y);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const generatedDateTime = new Date().toLocaleString('en-US', {
          timeZone: 'America/Edmonton',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        doc.text(`Generated: ${generatedDateTime}`, pageWidth - margin - 60, y);
        y += 8;

        // Employee info
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${employee.first_name} ${employee.last_name}`, margin, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text(`Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, margin + 80, y);
        doc.text(`Page ${page + 1} of ${totalPagesForEmployee}`, pageWidth - margin - 30, y);
        y += 10;

        // Summary boxes (only on first page of each employee)
        if (page === 0) {
          const boxWidth = 50;
          const boxHeight = 15;
          const boxGap = 10;
          const boxStartX = margin;

          // Regular (green)
          doc.setFillColor(220, 252, 231);
          doc.rect(boxStartX, y, boxWidth, boxHeight, 'F');
          doc.setTextColor(22, 163, 74);
          doc.setFontSize(8);
          doc.text('Regular', boxStartX + 3, y + 5);
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(regularHours.toFixed(2), boxStartX + 3, y + 12);

          // Overtime (red)
          doc.setFillColor(254, 226, 226);
          doc.rect(boxStartX + boxWidth + boxGap, y, boxWidth, boxHeight, 'F');
          doc.setTextColor(220, 38, 38);
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.text('Overtime', boxStartX + boxWidth + boxGap + 3, y + 5);
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(overtimeHours.toFixed(2), boxStartX + boxWidth + boxGap + 3, y + 12);

          // PTO (blue)
          doc.setFillColor(219, 234, 254);
          doc.rect(boxStartX + (boxWidth + boxGap) * 2, y, boxWidth, boxHeight, 'F');
          doc.setTextColor(37, 99, 235);
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.text('PTO', boxStartX + (boxWidth + boxGap) * 2 + 3, y + 5);
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(ptoHours.toFixed(2), boxStartX + (boxWidth + boxGap) * 2 + 3, y + 12);

          // STAT (amber/yellow)
          doc.setFillColor(254, 243, 199);
          doc.rect(boxStartX + (boxWidth + boxGap) * 3, y, boxWidth, boxHeight, 'F');
          doc.setTextColor(217, 119, 6);
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.text('STAT', boxStartX + (boxWidth + boxGap) * 3 + 3, y + 5);
          doc.setFontSize(14);
          doc.setFont(undefined, 'bold');
          doc.text(statHours.toFixed(2), boxStartX + (boxWidth + boxGap) * 3 + 3, y + 12);

          doc.setTextColor(0, 0, 0);
          y += boxHeight + 8;
        }

        // Table header
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');

        const cols = [
          { label: 'Date', x: margin + 2, width: 30 },
          { label: 'Time In', x: margin + 35, width: 20 },
          { label: 'Time Out', x: margin + 58, width: 20 },
          { label: 'Hours', x: margin + 81, width: 18 },
          { label: 'Day Total', x: margin + 102, width: 20 },
          { label: 'Regular', x: margin + 125, width: 18 },
          { label: 'OT', x: margin + 146, width: 15 },
          { label: 'PTO', x: margin + 164, width: 15 },
          { label: 'STAT', x: margin + 182, width: 15 },
          { label: 'Status', x: margin + 200, width: 30 },
        ];

        cols.forEach((col) => {
          doc.text(col.label, col.x, y + 5);
        });

        y += 8;
        doc.setFont(undefined, 'normal');

        // Table rows
        const startRow = page * maxRowsPerPage;
        const endRow = Math.min(startRow + maxRowsPerPage, tableData.length);

        for (let i = startRow; i < endRow; i++) {
          const row = tableData[i];

          if (i % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y - 1, pageWidth - margin * 2, rowHeight, 'F');
          }

          doc.setFontSize(7);
          doc.text(row.date, cols[0].x, y + 3);
          doc.text(row.timeIn, cols[1].x, y + 3);
          doc.text(row.timeOut, cols[2].x, y + 3);
          doc.text(row.hours, cols[3].x, y + 3);
          doc.text(row.dayTotal, cols[4].x, y + 3);
          doc.text(row.regular, cols[5].x, y + 3);
          doc.text(row.ot, cols[6].x, y + 3);
          doc.text(row.pto, cols[7].x, y + 3);
          doc.text(row.stat, cols[8].x, y + 3);
          doc.text(row.status, cols[9].x, y + 3);

          y += rowHeight;
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('KADR PayPRO - Time Record Report', margin, pageHeight - 10);
        doc.setTextColor(0, 0, 0);
      }
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=TimeReport_${startDate}_to_${endDate}.pdf`,
      },
    });
  } catch (error) {
    console.error('Error generating time report:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
