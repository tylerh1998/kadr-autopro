import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PLReportPage() {
  const [reportData, setReportData] = useState(null);
  const [warnings, setWarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Date range state
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      console.log('Loading P&L report for:', startDate, 'to', endDate);
      
      const response = await base44.functions.invoke('getPLReportData', {
        startDate: startDate,
        endDate: endDate
      });

      console.log('Backend response:', response);

      if (response.data?.success) {
        setReportData(response.data.data);
        setWarnings(response.data.warnings || null);
        if (response.data.warnings) {
          alert("CRITICAL WARNING: " + response.data.warnings);
        }
        console.log('P&L report loaded successfully');
      } else {
        console.error('Backend error:', response.data?.error);
        alert('Failed to load P&L report: ' + (response.data?.error || 'Unknown error'));
        setReportData(null);
        setWarnings(null);
      }
    } catch (error) {
      console.error('Error loading P&L report:', error);
      alert('Failed to load P&L report: ' + error.message);
      setReportData(null);
      setWarnings(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Load report on mount and when dates change
  useEffect(() => {
    if (startDate && endDate) {
      loadReport();
    }
  }, [startDate, endDate, loadReport]);

  // Quick date range buttons
  const setDateRange = (range) => {
    const today = new Date();
    switch (range) {
      case 'thisMonth':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'thisYear':
        setStartDate(format(startOfYear(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfYear(today), 'yyyy-MM-dd'));
        break;
      case 'lastYear':
        const lastYear = new Date(today.getFullYear() - 1, 0, 1);
        setStartDate(format(startOfYear(lastYear), 'yyyy-MM-dd'));
        setEndDate(format(endOfYear(lastYear), 'yyyy-MM-dd'));
        break;
      default:
        break;
    }
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  // Helper to format date for display
  const formatDisplayDate = (dateString) => {
    try {
      const parts = dateString.split('-');
      if (parts.length !== 3) return dateString;
      
      const [year, month, day] = parts;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (isNaN(date.getTime())) return dateString;
      
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  const formatMoney = (amount) => {
    if (amount < 0) {
      return `($${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const AccountRow = ({ account, level = 0 }) => (
    <>
      <div className="flex justify-between items-center p-4 border-b hover:bg-slate-50 print-line-item">
        <div style={{ paddingLeft: `${level * 24}px` }}>
          <span className={`text-slate-900 ${level === 0 ? 'font-semibold' : 'font-medium'}`}>
            {account.account_number}
          </span>
          <span className={`text-slate-600 ml-2 ${account.is_synthetic ? 'italic' : ''}`}>
            {account.account_name}
          </span>
          {!account.is_synthetic && (
            <span className="text-xs text-slate-400 ml-2">
              ({account.transactionCount} txs{account.children && account.children.length > 0 ? ` + ${account.children.length} sub` : ''})
            </span>
          )}
        </div>
        <div className={`text-right ${level === 0 ? 'font-bold' : 'font-semibold'} ${account.amount >= 0 ? (account.account_type === 'Revenue' ? 'text-green-700' : 'text-red-700') : 'text-slate-600'}`}>
          {formatMoney(account.amount)}
        </div>
      </div>
      {account.children && account.children.map((child) => (
        <AccountRow 
          key={child.is_synthetic ? `${child.account_number}-synthetic` : child.account_number} 
          account={child} 
          level={level + 1} 
        />
      ))}
    </>
  );

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.75in;
          }

          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #111;
          }

          /* Hide UI elements */
          .no-print, header, nav, button, .btn, .fixed, .sticky {
            display: none !important;
          }
          
          /* Main Layout Resets */
          .min-h-screen {
            min-height: 0 !important;
            height: auto !important;
            background-color: white !important;
          }
          
          div[class*="bg-slate-"] {
             background-color: white !important;
          }
          
          /* Container Overrides */
          .print-container {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Header */
          .print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }

          .print-header .company-name {
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            color: #1a1a1a;
          }

          .print-header h1 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 5px 0;
            color: #333;
          }

          .print-header .info-line {
            font-size: 12px;
            color: #555;
            margin-top: 4px;
          }

          /* Cards */
          .print-card {
            border: none !important;
            box-shadow: none !important;
            margin-bottom: 20px !important;
            background: white !important;
          }
          
          .card {
            border: none !important;
            box-shadow: none !important;
          }

          /* Section Titles */
          .print-section-title {
            display: block !important;
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            border-bottom: 1px solid #000;
            margin: 20px 0 10px 0;
            padding-bottom: 4px;
            color: #000 !important;
            background: transparent !important;
            border-left: none !important;
          }

          /* Rows */
          .print-line-item {
            border-bottom: 1px dotted #e5e5e5 !important;
            padding: 4px 0 !important;
            font-size: 11px !important;
            background-color: white !important;
            break-inside: avoid;
          }

          .print-line-item.total {
            background-color: white !important;
            border-top: 1px solid #000 !important;
            border-bottom: none !important;
            font-weight: bold !important;
            margin-top: 8px !important;
            padding-top: 8px !important;
            font-size: 12px !important;
          }
          
          .print-line-item.net-income, 
          .print-line-item.net-loss {
            background-color: white !important;
            border-top: 1px solid #000 !important;
            border-bottom: 3px double #000 !important;
            margin-top: 16px !important;
            padding: 12px 0 !important;
            font-size: 14px !important;
            color: #000 !important;
          }
          
          /* Remove colored backgrounds on print */
          .bg-green-50, .bg-red-50, .bg-purple-50, .bg-blue-50 {
             background-color: white !important;
          }
          
          /* Footer */
          @page {
            @bottom-center {
              content: "Page " counter(page) " of " counter(pages);
              font-size: 9pt;
              color: #666;
            }
          }
        }

        .print-header {
          display: none;
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-5xl mx-auto space-y-6 print-container">
          {/* Print Header - Only visible when printing */}
          <div className="print-header">
            <div className="company-name">Ken's Auto & Diesel Repair</div>
            <h1>Profit & Loss Report</h1>
            <div className="info-line">
              <strong>Period:</strong> {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}
            </div>
            <div className="info-line">
              <strong>Generated:</strong> {format(new Date(), 'MMMM d, yyyy h:mm a')}
            </div>
          </div>

          {/* Header - Hidden when printing */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 no-print">
            <div className="flex items-center gap-4">
              <Link to={createPageUrl('ChartOfAccounts')}>
                <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Profit & Loss Report</h1>
                <p className="text-slate-600 mt-1">Income and expense summary</p>
              </div>
            </div>
            <Button onClick={handlePrint} variant="outline">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>

          {/* Date Range Filters - Hidden when printing */}
          <Card className="no-print">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label htmlFor="start-date" className="text-xs text-slate-600">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label htmlFor="end-date" className="text-xs text-slate-600">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setDateRange('thisMonth')} variant="outline" size="sm">
                    This Month
                  </Button>
                  <Button onClick={() => setDateRange('lastMonth')} variant="outline" size="sm">
                    Last Month
                  </Button>
                  <Button onClick={() => setDateRange('thisYear')} variant="outline" size="sm">
                    This Year
                  </Button>
                  <Button onClick={() => setDateRange('lastYear')} variant="outline" size="sm">
                    Last Year
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {warnings && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 no-print">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-red-700 font-bold">Data Integrity Warning</p>
              </div>
              <p className="text-red-600 mt-1 ml-7">{warnings}</p>
            </div>
          )}

          {loading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-600">Loading report...</p>
              </CardContent>
            </Card>
          ) : reportData ? (
            <>
              {/* Revenue Section */}
              <Card className="print-card">
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <TrendingUp className="w-5 h-5" />
                    Revenue
                  </CardTitle>
                </CardHeader>
                <div className="print-section-title" style={{ display: 'none' }}>Revenue</div>
                <CardContent className="p-0">
                  {reportData.revenue.length > 0 ? (
                    <div>
                      {reportData.revenue.map((account) => (
                        <AccountRow key={account.account_number} account={account} />
                      ))}
                      <div className="flex justify-between items-center p-4 bg-green-50 border-t-2 border-green-600 print-line-item total">
                        <span className="font-bold text-slate-900">Total Revenue</span>
                        <span className="font-bold text-green-700 text-lg">
                          ${reportData.summary.totalRevenue.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      No revenue transactions in this period
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Expenses Section */}
              <Card className="print-card">
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <TrendingDown className="w-5 h-5" />
                    Expenses
                  </CardTitle>
                </CardHeader>
                <div className="print-section-title" style={{ display: 'none' }}>Expenses</div>
                <CardContent className="p-0">
                  {reportData.expenses.length > 0 ? (
                    <div>
                      {reportData.expenses.map((account) => (
                        <AccountRow key={account.account_number} account={account} />
                      ))}
                      <div className="flex justify-between items-center p-4 bg-red-50 border-t-2 border-red-600 print-line-item total">
                        <span className="font-bold text-slate-900">Total Expenses</span>
                        <span className="font-bold text-red-700 text-lg">
                          ${reportData.summary.totalExpenses.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      No expense transactions in this period
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Net Income/Loss Summary */}
              <Card className={`print-card ${reportData.summary.netIncome >= 0 ? 'border-green-500' : 'border-red-500'} border-2`}>
                <CardContent className="p-6">
                  <div className={`flex justify-between items-center print-line-item ${reportData.summary.netIncome >= 0 ? 'net-income' : 'net-loss'}`}>
                    <div className="flex items-center gap-3">
                      <DollarSign className={`w-8 h-8 ${reportData.summary.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`} />
                      <span className="text-2xl font-bold text-slate-900">
                        {reportData.summary.netIncome >= 0 ? 'Net Income' : 'Net Loss'}
                      </span>
                    </div>
                    <span className={`text-3xl font-bold ${reportData.summary.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      ${Math.abs(reportData.summary.netIncome).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Data Available</h3>
                <p className="text-slate-600">Select a date range to generate the report.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}