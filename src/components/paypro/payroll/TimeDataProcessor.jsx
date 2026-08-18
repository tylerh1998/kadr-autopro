import { supabase } from "@/lib/supabase";

/**
 * Time Data Processor Module
 * Handles fetching and processing time entries from Supabase for payroll calculations
 */

export const calculateOvertimeHours = (totalHours) => {
  const DAILY_REGULAR_LIMIT = 8;
  if (totalHours <= DAILY_REGULAR_LIMIT) {
    return { regularHours: totalHours, overtimeHours: 0 };
  }
  return { regularHours: DAILY_REGULAR_LIMIT, overtimeHours: totalHours - DAILY_REGULAR_LIMIT };
};

export const processTimeRecords = (timeRecords, payproEmployees) => {
  const processedData = {};
  const recordsByEmployee = {};

  timeRecords.forEach(record => {
    if (!record.employee_name) return;

    // Find matching employee by name
    const employee = payproEmployees.find(emp =>
        `${emp.first_name} ${emp.last_name}` === record.employee_name
    );

    if (!employee) {
      console.warn(`No employee found for name: ${record.employee_name}`);
      return;
    }

    if (!recordsByEmployee[employee.id]) {
      recordsByEmployee[employee.id] = [];
    }
    recordsByEmployee[employee.id].push(record);
  });

  Object.keys(recordsByEmployee).forEach(employeeId => {
    const records = recordsByEmployee[employeeId];
    const payTypes = {};
    const recordsByDate = {};
    const employee = payproEmployees.find(emp => emp.id === employeeId);

    records.forEach(record => {
      const recordDate = record.clock_in_time ?
        new Date(record.clock_in_time).toISOString().split('T')[0] : null;

      if (!recordDate) return;
      if (!recordsByDate[recordDate]) recordsByDate[recordDate] = [];
      recordsByDate[recordDate].push(record);
    });

    Object.keys(recordsByDate).forEach(date => {
      const dayRecords = recordsByDate[date];
      const dailyTotalHours = dayRecords.reduce((sum, record) => sum + (Number(record.total_hours) || 0), 0);

      if (dailyTotalHours > 0) {
        const { regularHours, overtimeHours } = calculateOvertimeHours(dailyTotalHours);
        if (regularHours > 0) {
          payTypes['Regular'] = (payTypes['Regular'] || 0) + Number(regularHours);
        }
        if (overtimeHours > 0) {
          payTypes['Overtime'] = (payTypes['Overtime'] || 0) + Number(overtimeHours);
        }
      }
    });

    records.forEach(record => {
      if (record.pto_hours && Number(record.pto_hours) > 0) {
        payTypes['PTO'] = (payTypes['PTO'] || 0) + Number(record.pto_hours);
      }
      if (record.stat_hours && Number(record.stat_hours) > 0) {
        payTypes['Stat Holiday'] = (payTypes['Stat Holiday'] || 0) + Number(record.stat_hours);
      }
    });

    processedData[employeeId] = {
      employee: employee,
      payTypes: payTypes,
      recordCount: records.length
    };
  });

  return processedData;
};

export const importTimeData = async (startDate, endDate, payproEmployees) => {
  try {
    // Direct native query, replacing the deleted getSupabaseTimeRecords base44
    // function - same pattern already established in Phase 4's TimeRecords.jsx.
    // -06:00 fixed offset preserved exactly (master_context.md §4's DST-unaware
    // convention, matching the Appointment Reminder cron jobs).
    const { data, error } = await supabase
      .from('TimeRecord')
      .select('*')
      .gte('clock_in_time', `${startDate}T00:00:00-06:00`)
      .lte('clock_in_time', `${endDate}T23:59:59-06:00`);

    if (error) throw error;

    const timeRecords = data || [];

    // Check for error records
    const errorRecords = timeRecords.filter(record => record.status === 'error');
    if (errorRecords.length > 0) {
      const errorDetails = errorRecords.map(r =>
        `• ${r.employee_name} on ${new Date(r.clock_in_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${r.notes || 'No details'}`
      ).join('\n');

      return {
        success: false,
        error: `❌ Cannot import time entries - Error status records found\n\nFound ${errorRecords.length} time ${errorRecords.length === 1 ? 'record' : 'records'} with error status in this pay period:\n\n${errorDetails}\n\nPlease go to Time Records page and fix these records before importing.`
      };
    }

    const processedData = processTimeRecords(timeRecords, payproEmployees);

    // D3: surface a visible warning when a selected employee produced zero
    // matched time records (e.g. a WorkPRO/PayPRO name mismatch, like the
    // known "Sam"/"Samantha" EMP007 gap - phase_5_implementation_plan.md D3)
    // instead of relying solely on processTimeRecords' console.warn, so a
    // real batch run doesn't silently skip someone's hours.
    const unmatchedEmployees = payproEmployees.filter(
      (emp) => !Object.prototype.hasOwnProperty.call(processedData, emp.id)
    );

    return {
      success: true,
      data: processedData,
      summary: {
        timeRecordsFound: timeRecords.length,
        employeesMatched: Object.keys(processedData).length,
        employeesWithHours: Object.keys(processedData).length,
        unmatchedEmployees
      }
    };
  } catch (error) {
    console.error("Error in time import:", error);
    return {
      success: false,
      error: `Error importing time data: ${error.message}\n\nPlease check the console for details.`,
      data: {}
    };
  }
};
