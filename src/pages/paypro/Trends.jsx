import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import TrendsDataProcessor from "@/components/paypro/trends/TrendsDataProcessor";
import PayrollTrendChart from "@/components/paypro/trends/PayrollTrendChart";
import LaborCostBarChart from "@/components/paypro/trends/LaborCostBarChart";
import YearOverYearComparison from "@/components/paypro/trends/YearOverYearComparison";

export default function Trends() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Payroll Trends</h1>
        </div>
      </div>

      <TrendsDataProcessor>
        {({ data, refresh }) => (
          <>
            {/* Data Summary Card */}
            {data && (
              <Card className="border-0 shadow-sm mb-6 dark:bg-slate-900 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="dark:text-slate-100">Data Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.summary.validPayStubs}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Total Pay Stubs</p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.summary.totalEmployees}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Total Employees</p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.monthlyTrends.length}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Months of Data</p>
                    </div>
                    <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.yearlyTrends.length}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Years of Data</p>
                    </div>
                  </div>

                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>Data Range:</strong> {data.summary.dateRange.earliest} to {data.summary.dateRange.latest}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Year-over-Year Comparison */}
            {data && data.yearlyTrends.length > 0 && (
              <div className="mb-6">
                <YearOverYearComparison
                  yearlyTrends={data.yearlyTrends}
                  yearOverYearData={data.yearOverYearComparison}
                />
              </div>
            )}

            {/* Monthly Gross Pay Trend Chart */}
            {data && data.monthlyTrends.length > 0 && (
              <div className="mb-6">
                <PayrollTrendChart
                  data={data.monthlyTrends}
                  title="Monthly Gross Pay Trend"
                  dataKeys={[
                    { key: 'grossPay', name: 'Gross Pay' }
                  ]}
                  height={400}
                />
              </div>
            )}

            {/* Comprehensive Payroll Cost Breakdown Chart */}
            {data && data.monthlyTrends.length > 0 && (
              <div className="mb-6">
                <PayrollTrendChart
                  data={data.monthlyTrends}
                  title="Comprehensive Payroll Cost Breakdown"
                  dataKeys={[
                    { key: 'grossPay', name: 'Gross Pay' },
                    { key: 'totalEmployeeDeductions', name: 'Employee Deductions' },
                    { key: 'totalEmployerContributions', name: 'Employer Contributions' },
                    { key: 'totalPayrollCost', name: 'Total Payroll Cost' }
                  ]}
                  height={450}
                />
              </div>
            )}

            {/* Deductions & Contributions Detail Chart */}
            {data && data.monthlyTrends.length > 0 && (
              <div className="mb-6">
                <PayrollTrendChart
                  data={data.monthlyTrends}
                  title="Monthly Deductions & Contributions Breakdown"
                  dataKeys={[
                    { key: 'federalTax', name: 'Federal Tax' },
                    { key: 'provincialTax', name: 'Provincial Tax' },
                    { key: 'cpp', name: 'CPP (Employee)' },
                    { key: 'ei', name: 'EI (Employee)' },
                    { key: 'employerCPP', name: 'CPP (Employer)' },
                    { key: 'employerEI', name: 'EI (Employer)' }
                  ]}
                  height={450}
                />
              </div>
            )}

            {/* Labor Cost by Employee Type */}
            {data && data.laborCostByEmployeeType.length > 0 && (
              <div className="mb-6">
                <LaborCostBarChart
                  data={data.laborCostByEmployeeType}
                  title="Labor Cost Distribution by Employee Type"
                  categoryKey="type"
                  valueKey="totalPayrollCost"
                  height={400}
                />
              </div>
            )}

            {/* Labor Cost by Position */}
            {data && data.laborCostByPosition.length > 0 && (
              <div className="mb-6">
                <LaborCostBarChart
                  data={data.laborCostByPosition}
                  title="Labor Cost Distribution by Position"
                  categoryKey="position"
                  valueKey="totalPayrollCost"
                  height={400}
                />
              </div>
            )}

            {/* Completion Message */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-slate-800">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full mb-4">
                  <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Payroll Trends Analysis Complete! ✅</h3>
                <p className="text-slate-600 dark:text-slate-400">
                  All trend visualizations have been successfully implemented. You can now analyze your payroll data
                  across multiple dimensions including monthly trends, labor cost distribution, and year-over-year comparisons.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </TrendsDataProcessor>
    </div>
  );
}
