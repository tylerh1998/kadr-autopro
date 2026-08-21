import React, { useState, useEffect } from "react";
import { PayStub, Employee, TaxYearConstant } from "@/components/paypro/lib/payrollEntities";
import { Loader2 } from "lucide-react";

/**
 * TrendsDataProcessor Component
 * Fetches and aggregates payroll data for trend analysis
 * Provides structured data for visualization components
 */
export default function TrendsDataProcessor({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aggregatedData, setAggregatedData] = useState(null);

  useEffect(() => {
    fetchAndProcessData();
  }, []);

  const fetchAndProcessData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("📊 Fetching payroll data for trends analysis...");

      // Fetch all necessary data
      const [payStubs, employees, taxYearConstants] = await Promise.all([
        PayStub.list('-pay_date'),
        Employee.list(),
        TaxYearConstant.list()
      ]);

      console.log(`✅ Fetched ${payStubs.length} pay stubs and ${employees.length} employees`);

      // Filter out cancelled pay stubs
      const validPayStubs = payStubs.filter(stub => !stub.is_cancelled);
      console.log(`✅ ${validPayStubs.length} valid (non-cancelled) pay stubs`);

      // Process the data
      const processedData = processPayrollData(validPayStubs, employees, taxYearConstants, payStubs.length);

      setAggregatedData(processedData);

      // Log the aggregated data structure for testing
      console.log("📈 Aggregated Data Structure:", processedData);
      console.log("📅 Monthly Trends Sample:", processedData.monthlyTrends.slice(0, 3));
      console.log("👥 Employee Type Breakdown:", processedData.laborCostByEmployeeType);
      console.log("📊 Year-over-Year Comparison:", processedData.yearOverYearComparison);

    } catch (err) {
      console.error("❌ Error fetching/processing payroll data:", err);
      setError(err.message || "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  // D2: no stored employer-EI field exists on PayPro_PayStub - derive it from
  // PayPro_TaxYearConstant.ei_rate_employer_multiplier for the stub's own year, instead of
  // a hardcoded 1.4. Every chart on this page derives from this one computation.
  const getEmployerMultiplier = (taxYearConstants, year) => {
    const row = taxYearConstants.find((c) => c.year === year);
    return row?.ei_rate_employer_multiplier ?? 1.4;
  };

  /**
   * Process payroll data into structured aggregations
   */
  const processPayrollData = (payStubs, employees, taxYearConstants, rawPayStubCount) => {
    // Create employee lookup map
    const employeeMap = new Map();
    employees.forEach(emp => {
      employeeMap.set(emp.employee_id, emp);
    });

    // Group pay stubs by month and year
    const monthlyData = {};
    const yearlyData = {};
    const employeeTypeData = {};
    const positionData = {};

    payStubs.forEach(stub => {
      const employee = employeeMap.get(stub.employee_id);
      if (!employee) return; // Skip if employee not found

      const payDate = new Date(stub.pay_date || stub.pay_period_end);
      const year = payDate.getFullYear();
      const month = payDate.getMonth(); // 0-11
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`; // YYYY-MM format

      // Calculate employer contributions
      const employerCPP = stub.cpp_deduction || 0;
      const employerCPP2 = stub.cpp2_deduction || 0;
      const employerEI = (stub.ei_deduction || 0) * getEmployerMultiplier(taxYearConstants, stub.year);
      const totalEmployerContributions = employerCPP + employerCPP2 + employerEI;

      // Calculate total employee deductions
      const totalEmployeeDeductions =
        (stub.federal_tax || 0) +
        (stub.provincial_tax || 0) +
        (stub.cpp_deduction || 0) +
        (stub.cpp2_deduction || 0) +
        (stub.ei_deduction || 0);

      // Calculate total payroll cost (gross + employer contributions)
      const totalPayrollCost = (stub.gross_pay || 0) + totalEmployerContributions;

      // Aggregate by month
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          year: year,
          monthName: payDate.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          grossPay: 0,
          federalTax: 0,
          provincialTax: 0,
          cpp: 0,
          cpp2: 0,
          ei: 0,
          totalEmployeeDeductions: 0,
          employerCPP: 0,
          employerCPP2: 0,
          employerEI: 0,
          totalEmployerContributions: 0,
          netPay: 0,
          totalPayrollCost: 0,
          paychequeCount: 0
        };
      }

      monthlyData[monthKey].grossPay += stub.gross_pay || 0;
      monthlyData[monthKey].federalTax += stub.federal_tax || 0;
      monthlyData[monthKey].provincialTax += stub.provincial_tax || 0;
      monthlyData[monthKey].cpp += stub.cpp_deduction || 0;
      monthlyData[monthKey].cpp2 += stub.cpp2_deduction || 0;
      monthlyData[monthKey].ei += stub.ei_deduction || 0;
      monthlyData[monthKey].totalEmployeeDeductions += totalEmployeeDeductions;
      monthlyData[monthKey].employerCPP += employerCPP;
      monthlyData[monthKey].employerCPP2 += employerCPP2;
      monthlyData[monthKey].employerEI += employerEI;
      monthlyData[monthKey].totalEmployerContributions += totalEmployerContributions;
      monthlyData[monthKey].netPay += stub.net_pay || 0;
      monthlyData[monthKey].totalPayrollCost += totalPayrollCost;
      monthlyData[monthKey].paychequeCount += 1;

      // Aggregate by year (for YTD comparisons)
      if (!yearlyData[year]) {
        yearlyData[year] = {
          year: year,
          grossPay: 0,
          federalTax: 0,
          provincialTax: 0,
          cpp: 0,
          cpp2: 0,
          ei: 0,
          totalEmployeeDeductions: 0,
          employerCPP: 0,
          employerCPP2: 0,
          employerEI: 0,
          totalEmployerContributions: 0,
          netPay: 0,
          totalPayrollCost: 0,
          paychequeCount: 0
        };
      }

      yearlyData[year].grossPay += stub.gross_pay || 0;
      yearlyData[year].federalTax += stub.federal_tax || 0;
      yearlyData[year].provincialTax += stub.provincial_tax || 0;
      yearlyData[year].cpp += stub.cpp_deduction || 0;
      yearlyData[year].cpp2 += stub.cpp2_deduction || 0;
      yearlyData[year].ei += stub.ei_deduction || 0;
      yearlyData[year].totalEmployeeDeductions += totalEmployeeDeductions;
      yearlyData[year].employerCPP += employerCPP;
      yearlyData[year].employerCPP2 += employerCPP2;
      yearlyData[year].employerEI += employerEI;
      yearlyData[year].totalEmployerContributions += totalEmployerContributions;
      yearlyData[year].netPay += stub.net_pay || 0;
      yearlyData[year].totalPayrollCost += totalPayrollCost;
      yearlyData[year].paychequeCount += 1;

      // Aggregate by employee type
      const employeeType = employee.employee_type || 'Unknown';
      if (!employeeTypeData[employeeType]) {
        employeeTypeData[employeeType] = {
          type: employeeType,
          grossPay: 0,
          totalPayrollCost: 0,
          paychequeCount: 0,
          employeeCount: new Set()
        };
      }

      employeeTypeData[employeeType].grossPay += stub.gross_pay || 0;
      employeeTypeData[employeeType].totalPayrollCost += totalPayrollCost;
      employeeTypeData[employeeType].paychequeCount += 1;
      employeeTypeData[employeeType].employeeCount.add(stub.employee_id);

      // Aggregate by position
      const position = employee.position || 'No Position';
      if (!positionData[position]) {
        positionData[position] = {
          position: position,
          grossPay: 0,
          totalPayrollCost: 0,
          paychequeCount: 0,
          employeeCount: new Set()
        };
      }

      positionData[position].grossPay += stub.gross_pay || 0;
      positionData[position].totalPayrollCost += totalPayrollCost;
      positionData[position].paychequeCount += 1;
      positionData[position].employeeCount.add(stub.employee_id);
    });

    // Convert to arrays and sort
    const monthlyTrends = Object.values(monthlyData).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    const yearlyTrends = Object.values(yearlyData).sort((a, b) =>
      a.year - b.year
    );

    // Convert employee type data (convert Set to count)
    const laborCostByEmployeeType = Object.values(employeeTypeData).map(data => ({
      ...data,
      employeeCount: data.employeeCount.size
    })).sort((a, b) => b.totalPayrollCost - a.totalPayrollCost);

    // Convert position data (convert Set to count)
    const laborCostByPosition = Object.values(positionData).map(data => ({
      ...data,
      employeeCount: data.employeeCount.size
    })).sort((a, b) => b.totalPayrollCost - a.totalPayrollCost);

    // Calculate year-over-year comparison
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    // D4: source's percentageChange field here is dead code - YearOverYearComparison.jsx
    // recomputes its own per-metric percentage changes from currentYear/previousYear directly
    // and never reads this pre-computed field. Not ported.
    const yearOverYearComparison = {
      currentYear: yearlyData[currentYear] || null,
      previousYear: yearlyData[previousYear] || null,
    };

    return {
      monthlyTrends,
      yearlyTrends,
      laborCostByEmployeeType,
      laborCostByPosition,
      yearOverYearComparison,
      summary: {
        // D3: totalPayStubs reports the true pre-filter count; validPayStubs keeps the
        // post-filter (non-cancelled) count - source set both from the same filtered array.
        totalPayStubs: rawPayStubCount,
        validPayStubs: payStubs.length,
        totalEmployees: employees.length,
        dateRange: {
          earliest: monthlyTrends[0]?.month || 'N/A',
          latest: monthlyTrends[monthlyTrends.length - 1]?.month || 'N/A'
        }
      }
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400">Loading payroll trends data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
        <h3 className="font-semibold text-red-800 dark:text-red-400 mb-2">Error Loading Data</h3>
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // Pass aggregated data to children components
  return children({ data: aggregatedData, refresh: fetchAndProcessData });
}
