import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

/**
 * YearOverYearComparison Component
 * Displays year-over-year comparison of key payroll metrics
 */
export default function YearOverYearComparison({ yearlyTrends, yearOverYearData }) {
  // Prepare comparison data for the selected years
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const currentYearData = yearOverYearData.currentYear;
  const previousYearData = yearOverYearData.previousYear;

  // Calculate percentage changes for key metrics
  const calculateChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const metrics = [
    {
      label: "Gross Pay",
      currentKey: "grossPay",
      icon: "💰"
    },
    {
      label: "Total Payroll Cost",
      currentKey: "totalPayrollCost",
      icon: "💵"
    },
    {
      label: "Income Tax",
      currentKey: null,
      calculate: (data) => (data.federalTax || 0) + (data.provincialTax || 0),
      icon: "📊"
    },
    {
      label: "CPP Contributions",
      currentKey: "cpp",
      icon: "🏦"
    },
    {
      label: "EI Contributions",
      currentKey: "ei",
      icon: "🛡️"
    },
    {
      label: "Paycheques Issued",
      currentKey: "paychequeCount",
      icon: "📄"
    }
  ];

  // Render percentage change indicator
  const PercentageChange = ({ change }) => {
    if (change === null || change === undefined) {
      return <span className="text-slate-400 dark:text-slate-500 text-sm">N/A</span>;
    }

    const absChange = Math.abs(change);
    const isPositive = change > 0;
    const isNeutral = Math.abs(change) < 0.1;

    if (isNeutral) {
      return (
        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
          <Minus className="w-4 h-4" />
          <span className="text-sm font-semibold">{absChange.toFixed(1)}%</span>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        <span className="text-sm font-semibold">{absChange.toFixed(1)}%</span>
      </div>
    );
  };

  // Prepare data for bar chart comparing multiple years
  const barChartData = yearlyTrends.slice(-3).map(year => ({
    year: year.year.toString(),
    "Gross Pay": year.grossPay,
    "Employee Deductions": year.totalEmployeeDeductions,
    "Employer Contributions": year.totalEmployerContributions,
    "Total Payroll Cost": year.totalPayrollCost
  }));

  // Custom tooltip for bar chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold text-slate-900 mb-2">Year {label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-600">{entry.name}:</span>
              <span className="font-semibold text-slate-900">
                ${entry.value.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Format Y-axis
  const formatYAxis = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  return (
    <div className="space-y-6">
      {/* Comparison Cards */}
      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="dark:text-slate-100">Year-to-Date Comparison: {currentYear} vs {previousYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {!currentYearData || !previousYearData ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <p>Insufficient data for year-over-year comparison.</p>
              <p className="text-sm mt-2">Need data from at least two different years.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric, index) => {
                const currentValue = metric.calculate
                  ? metric.calculate(currentYearData)
                  : currentYearData[metric.currentKey];

                const previousValue = metric.calculate
                  ? metric.calculate(previousYearData)
                  : previousYearData[metric.currentKey];

                const change = calculateChange(currentValue, previousValue);
                const isMonetary = metric.currentKey !== 'paychequeCount';

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{metric.icon}</span>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{metric.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Year-to-Date Comparison</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{previousYear}</p>
                        <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                          {isMonetary
                            ? `$${previousValue.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : previousValue.toLocaleString('en-CA')
                          }
                        </p>
                      </div>

                      <ArrowRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />

                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{currentYear}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {isMonetary
                            ? `$${currentValue.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : currentValue.toLocaleString('en-CA')
                          }
                        </p>
                      </div>

                      <div className="w-24 text-right">
                        <PercentageChange change={change} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multi-Year Bar Chart */}
      {barChartData.length > 1 && (
        <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="dark:text-slate-100">Multi-Year Payroll Cost Comparison (Last {barChartData.length} Years)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={barChartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="year"
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                  tickFormatter={formatYAxis}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                />
                <Bar dataKey="Gross Pay" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Employee Deductions" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Employer Contributions" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Total Payroll Cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Insight:</strong> This chart shows how payroll costs have evolved over the years,
                helping identify long-term trends and growth patterns.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
