import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, DollarSign, Building2, CreditCard, PiggyBank, Calendar, Printer, AlertTriangle, CheckCircle, Mail } from 'lucide-react';
import { format, endOfMonth, endOfYear, subMonths, subYears } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function BalanceSheetPage() {
  const [reportData, setReportData] = useState(null);
  const [warnings, setWarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // As-of date state (default to end of current month)
  const [asOfDate, setAsOfDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const handleEmailReport = async () => {
    setSendingEmail(true);
    try {
      const response = await base44.functions.invoke('findGLImbalances', {});
      if (response.data?.success) {
        alert('Imbalance report emailed successfully!');
      } else {
        alert('Failed to send report: ' + (response.data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error sending report:', error);
      alert('Failed to send report: ' + error.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      console.log('Loading Balance Sheet as of:', asOfDate);
      
      const response = await base44.functions.invoke('getBalanceSheetData', {
        asOfDate: asOfDate
      });

      console.log('Backend response:', response);

      if (response.data?.success) {
        setReportData(response.data.data);
        setWarnings(response.data.warnings || null);
        if (response.data.warnings) {
          alert("CRITICAL WARNING: " + response.data.warnings);
        }
        console.log('Balance Sheet loaded successfully');
      } else {
        console.error('Backend error:', response.data?.error);
        alert('Failed to load Balance Sheet: ' + (response.data?.error || 'Unknown error'));
        setReportData(null);
        setWarnings(null);
      }
    } catch (error) {
      console.error('Error loading Balance Sheet:', error);
      alert('Failed to load Balance Sheet: ' + error.message);
      setReportData(null);
      setWarnings(null);
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  // Load report on mount and when date changes
  useEffect(() => {
    if (asOfDate) {
      loadReport();
    }
  }, [asOfDate, loadReport]);

  // Quick date buttons
  const setQuickDate = (preset) => {
    const today = new Date();
    switch (preset) {
      case 'today':
        setAsOfDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'endOfMonth':
        setAsOfDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'endOfLastMonth':
        setAsOfDate(format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'));
        break;
      case 'endOfYear':
        setAsOfDate(format(endOfYear(today), 'yyyy-MM-dd'));
        break;
      case 'endOfLastYear':
        setAsOfDate(format(endOfYear(subYears(today, 1)), 'yyyy-MM-dd'));
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

  const AccountRow = ({ account, level = 0, colorClass = 'text-slate-900' }) => (
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
        <div className={`text-right ${level === 0 ? 'font-bold' : 'font-semibold'} ${colorClass}`}>
          {formatMoney(account.balance)}
        </div>
      </div>
      {account.children && account.children.map((child) => (
        <AccountRow 
          key={child.is_synthetic ? `${child.account_number}-synthetic` : child.account_number} 
          account={child} 
          level={level + 1}
          colorClass={colorClass}
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
          
          .print-line-item.grand-total {
            background-color: white !important;
            border-top: 1px solid #000 !important;
            border-bottom: 3px double #000 !important;
            margin-top: 16px !important;
            padding: 12px 0 !important;
            font-size: 14px !important;
            color: #000 !important;
          }
          
          .print-balance-check {
            display: block !important;
            margin-top: 30px;
            padding: 10px;
            text-align: center;
            border: 1px solid #333;
            font-size: 12px;
            background: white !important;
          }
          
          .print-balance-check.balanced {
            border-color: #333 !important;
          }
          
          .print-balance-check.unbalanced {
            border-color: red !important;
            color: red !important;
          }
          
          /* Remove colored backgrounds on print */
          .bg-green-50, .bg-red-50, .bg-purple-50, .bg-blue-50, .bg-slate-50 {
             background-color: white !important;
          }
          
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
        
        .print-balance-check {
          display: none;
        }
      `}</style>

      <div className="p-6 min-h-screen">
        <div className="max-w-5xl mx-auto space-y-6 print-container">
          {/* Print Header - Only visible when printing */}
          <div className="print-header">
            <div className="company-name">Ken's Auto & Diesel Repair</div>
            <h1>Balance Sheet</h1>
            <div className="info-line">
              <strong>As of:</strong> {formatDisplayDate(asOfDate)}
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
                <h1 className="text-3xl font-bold text-slate-900">Balance Sheet</h1>
                <p className="text-slate-600 mt-1">Assets, liabilities, and equity snapshot</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleEmailReport} 
                variant="outline"
                disabled={sendingEmail}
              >
                <Mail className="w-4 h-4 mr-2" />
                {sendingEmail ? 'Sending...' : 'Email Daily Imbalance Report'}
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Print Report
              </Button>
            </div>
          </div>

          {/* Date Selector - Hidden when printing */}
          <Card className="no-print">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1 flex-1 min-w-[160px]">
                  <Label htmlFor="as-of-date" className="text-xs text-slate-600">As of Date</Label>
                  <Input
                    id="as-of-date"
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setQuickDate('today')} variant="outline" size="sm">
                    Today
                  </Button>
                  <Button onClick={() => setQuickDate('endOfMonth')} variant="outline" size="sm">
                    End of Month
                  </Button>
                  <Button onClick={() => setQuickDate('endOfLastMonth')} variant="outline" size="sm">
                    End of Last Month
                  </Button>
                  <Button onClick={() => setQuickDate('endOfYear')} variant="outline" size="sm">
                    End of Year
                  </Button>
                  <Button onClick={() => setQuickDate('endOfLastYear')} variant="outline" size="sm">
                    End of Last Year
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
                <p className="text-slate-600">Loading Balance Sheet...</p>
              </CardContent>
            </Card>
          ) : reportData ? (
            <>
              {/* Assets Section */}
              <Card className="print-card">
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <Building2 className="w-5 h-5" />
                    Assets
                  </CardTitle>
                </CardHeader>
                <div className="print-section-title" style={{ display: 'none' }}>Assets</div>
                <CardContent className="p-0">
                  {reportData.assets.length > 0 ? (
                    <div>
                      {reportData.assets.map((account) => (
                        <AccountRow key={account.account_number} account={account} colorClass="text-blue-700" />
                      ))}
                      <div className="flex justify-between items-center p-4 bg-blue-50 border-t-2 border-blue-600 print-line-item total">
                        <span className="font-bold text-slate-900">Total Assets</span>
                        <span className="font-bold text-blue-700 text-lg">
                          {formatMoney(reportData.summary.totalAssets)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      No asset accounts with balances
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Liabilities Section */}
              <Card className="print-card">
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <CreditCard className="w-5 h-5" />
                    Liabilities
                  </CardTitle>
                </CardHeader>
                <div className="print-section-title" style={{ display: 'none' }}>Liabilities</div>
                <CardContent className="p-0">
                  {reportData.liabilities.length > 0 ? (
                    <div>
                      {reportData.liabilities.map((account) => (
                        <AccountRow key={account.account_number} account={account} colorClass="text-red-700" />
                      ))}
                      <div className="flex justify-between items-center p-4 bg-red-50 border-t-2 border-red-600 print-line-item total">
                        <span className="font-bold text-slate-900">Total Liabilities</span>
                        <span className="font-bold text-red-700 text-lg">
                          {formatMoney(reportData.summary.totalLiabilities)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      No liability accounts with balances
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Equity Section */}
              <Card className="print-card">
                <CardHeader className="no-print">
                  <CardTitle className="flex items-center gap-2 text-purple-700">
                    <PiggyBank className="w-5 h-5" />
                    Equity
                  </CardTitle>
                </CardHeader>
                <div className="print-section-title" style={{ display: 'none' }}>Equity</div>
                <CardContent className="p-0">
                  {reportData.equity.length > 0 ? (
                    <div>
                      {reportData.equity.map((account) => (
                        <AccountRow key={account.account_number} account={account} colorClass="text-purple-700" />
                      ))}
                      <div className="flex justify-between items-center p-4 bg-purple-50 border-t-2 border-purple-600 print-line-item total">
                        <span className="font-bold text-slate-900">Total Equity</span>
                        <span className="font-bold text-purple-700 text-lg">
                          {formatMoney(reportData.summary.totalEquity)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      No equity accounts with balances
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Total Liabilities & Equity */}
              <Card className="print-card border-2 border-slate-400">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center print-line-item grand-total">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-8 h-8 text-slate-700" />
                      <span className="text-2xl font-bold text-slate-900">
                        Total Liabilities & Equity
                      </span>
                    </div>
                    <span className="text-3xl font-bold text-slate-900">
                      ${reportData.summary.totalLiabilitiesAndEquity.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Balance Check */}
              <Card className={`print-card no-print ${reportData.summary.isBalanced ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'} border-2`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    {reportData.summary.isBalanced ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-green-700" />
                        <div>
                          <h3 className="text-lg font-bold text-green-900">Balance Sheet is Balanced</h3>
                          <p className="text-sm text-green-700">
                            Assets (${reportData.summary.totalAssets.toFixed(2)}) = Liabilities + Equity (${reportData.summary.totalLiabilitiesAndEquity.toFixed(2)})
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-8 h-8 text-red-700" />
                        <div>
                          <h3 className="text-lg font-bold text-red-900">Balance Sheet is Unbalanced</h3>
                          <p className="text-sm text-red-700">
                            Assets (${reportData.summary.totalAssets.toFixed(2)}) ≠ Liabilities + Equity (${reportData.summary.totalLiabilitiesAndEquity.toFixed(2)})
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            Difference: ${Math.abs(reportData.summary.totalAssets - reportData.summary.totalLiabilitiesAndEquity).toFixed(2)}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Print-only Balance Check */}
              <div className={`print-balance-check ${reportData.summary.isBalanced ? 'balanced' : 'unbalanced'}`}>
                {reportData.summary.isBalanced ? (
                  <div>✓ Balance Sheet is Balanced - Assets: ${reportData.summary.totalAssets.toFixed(2)} = Liabilities + Equity: ${reportData.summary.totalLiabilitiesAndEquity.toFixed(2)}</div>
                ) : (
                  <div>⚠ Balance Sheet is Unbalanced - Assets: ${reportData.summary.totalAssets.toFixed(2)} ≠ Liabilities + Equity: ${reportData.summary.totalLiabilitiesAndEquity.toFixed(2)}</div>
                )}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Data Available</h3>
                <p className="text-slate-600">Select an as-of date to generate the Balance Sheet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}