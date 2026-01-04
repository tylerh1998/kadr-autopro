import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, DollarSign, Building2, CreditCard, PiggyBank, Calendar, Printer, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, endOfMonth, endOfYear, subMonths, subYears } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function BalanceSheetPage() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // As-of date state (default to end of current month)
  const [asOfDate, setAsOfDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

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
        console.log('Balance Sheet loaded successfully');
      } else {
        console.error('Backend error:', response.data?.error);
        alert('Failed to load Balance Sheet: ' + (response.data?.error || 'Unknown error'));
        setReportData(null);
      }
    } catch (error) {
      console.error('Error loading Balance Sheet:', error);
      alert('Failed to load Balance Sheet: ' + error.message);
      setReportData(null);
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
          ${account.balance.toFixed(2)}
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
          .no-print {
            display: none !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          body > div > div > header,
          body > div > header,
          body header,
          header {
            display: none !important;
            visibility: hidden !important;
          }
          
          .print-container {
            max-width: 100% !important;
            padding: 10mm 0 !important;
            margin: 0 auto !important;
          }
          
          .print-header {
            display: block !important;
            visibility: visible !important;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #000;
            text-align: center;
          }
          
          .print-header .company-name {
            font-size: 16pt;
            font-weight: bold;
            margin: 0 0 5px 0;
            color: #000;
          }
          
          .print-header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin: 0 0 10px 0;
            color: #000;
          }
          
          .print-header .info-line {
            font-size: 11pt;
            margin: 5px 0;
            color: #333;
          }
          
          .print-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          
          .print-section-title {
            font-size: 14pt;
            font-weight: bold;
            color: #000;
            margin: 15px 0 10px 0;
            padding: 5px 10px;
            background-color: #f5f5f5;
            border-left: 4px solid #333;
          }
          
          .print-line-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 10px;
            border-bottom: 1px solid #ddd;
            font-size: 10pt;
          }
          
          .print-line-item.total {
            font-weight: bold;
            background-color: #f9f9f9;
            border-top: 2px solid #333;
            font-size: 11pt;
          }
          
          .print-line-item.grand-total {
            font-weight: bold;
            background-color: #e3f2fd;
            border-top: 3px double #333;
            font-size: 12pt;
            margin-top: 10px;
          }
          
          .print-balance-check {
            display: block !important;
            margin-top: 20px;
            padding: 15px;
            text-align: center;
            border: 2px solid #333;
            font-size: 11pt;
            font-weight: bold;
          }
          
          .print-balance-check.balanced {
            background-color: #e8f5e9 !important;
            border-color: #4caf50 !important;
          }
          
          .print-balance-check.unbalanced {
            background-color: #ffebee !important;
            border-color: #f44336 !important;
          }
          
          @page {
            margin: 15mm;
            size: portrait;
            
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
            <Button onClick={handlePrint} variant="outline">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
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
                          ${reportData.summary.totalAssets.toFixed(2)}
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
                          ${reportData.summary.totalLiabilities.toFixed(2)}
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
                          ${reportData.summary.totalEquity.toFixed(2)}
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