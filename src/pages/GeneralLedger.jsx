import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, Loader2, FileText, ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format, subDays } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';

export default function GeneralLedgerPage({ isEmbedded = false }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 365), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('autopro-getGeneralLedgerData', {
        body: { startDate, endDate }
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to fetch GL data');
      }

      const activeAccounts = response.data.accounts;

      // --- Build Hierarchy & Calculate Totals (Client-Side) ---

      // 1. Initialize Nodes
      const accountMap = {};
      activeAccounts.forEach(account => {
        accountMap[account.account_number] = {
          ...account,
          children: [],
          total_balance: 0 // Will be calculated
        };
      });

      // 2. Build Tree
      const roots = [];
      Object.values(accountMap).forEach(node => {
        if (node.parent_account && accountMap[node.parent_account]) {
          accountMap[node.parent_account].children.push(node);
        } else {
          roots.push(node);
        }
      });

      // 3. Recursive Totals
      const calculateTotals = (node) => {
        let childTotal = 0;
        node.children.forEach(child => {
          childTotal += calculateTotals(child);
        });
        node.total_balance = node.own_balance + childTotal;
        return node.total_balance;
      };
      roots.forEach(root => calculateTotals(root));

      // 4. Transform (Synthetic nodes & Sorting)
      const transformNode = (node) => {
        node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
        node.children.forEach(transformNode);

        if (node.children.length > 0 && Math.abs(node.own_balance) > 0.001) {
           const syntheticChild = {
             ...node,
             account_name: `${node.account_name} (Direct)`,
             total_balance: node.own_balance, // For display, this child holds the own balance
             transactionCount: node.transactionCount,
             children: [],
             is_synthetic: true,
             id: `${node.id}-synthetic` // Ensure unique ID
           };
           node.children.unshift(syntheticChild);
        }
      };
      roots.forEach(transformNode);

      // 5. Update State
      // We replace the flat 'accounts' state with 'roots' so the grouping logic works on top-level accounts
      setAccounts(roots);

    } catch (error) {
      console.error('Error loading general ledger data:', error);
    } finally {
      setLoading(false);
    }
  };

  const accountTypeColors = {
    'Asset': 'bg-blue-100 text-blue-800',
    'Liability': 'bg-red-100 text-red-800',
    'Equity': 'bg-purple-100 text-purple-800',
    'Revenue': 'bg-green-100 text-green-800',
    'Expense': 'bg-orange-100 text-orange-800'
  };

  const filteredAccounts = accounts.filter(account => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      account.account_number?.toLowerCase().includes(search) ||
      account.account_name?.toLowerCase().includes(search) ||
      account.account_type?.toLowerCase().includes(search)
    );
  });

  const handleAccountClick = (accountNumber) => {
    const url = createPageUrl(`GLAcct?account=${accountNumber}&startDate=${startDate}&endDate=${endDate}`);
    window.open(url, '_blank', 'width=1400,height=900');
  };

  // Group accounts by type
  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const type = account.account_type || 'Other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(account);
    return groups;
  }, {});

  // Sort groups by accounting order
  const accountTypeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'Other'];
  const sortedGroups = Object.keys(groupedAccounts).sort((a, b) => {
    return accountTypeOrder.indexOf(a) - accountTypeOrder.indexOf(b);
  });

  // Recursive component for account row
  const AccountRow = ({ account, level = 0, onAccountClick }) => {
    const balance = account.total_balance || 0;
    const transactionCount = account.transactionCount || 0;
    const hasChildren = account.children && account.children.length > 0;
    const isDebitNormal = ['Asset', 'Expense'].includes(account.account_type);
    
    let isDr = false;
    let isCr = false;
    if (balance > 0.001) {
      if (isDebitNormal) isDr = true;
      else isCr = true;
    } else if (balance < -0.001) {
      if (isDebitNormal) isCr = true;
      else isDr = true;
    }
    
    return (
      <React.Fragment>
        <tr 
          className="border-b hover:bg-slate-50 cursor-pointer"
          onClick={() => onAccountClick(account.account_number)}
        >
          <td className="p-3 font-mono text-sm" style={{ paddingLeft: `${12 + level * 24}px` }}>
            {account.account_number}
          </td>
          <td className="p-3">
            <div>
              <span className={`text-slate-900 ${level === 0 ? 'font-medium' : ''} ${account.is_synthetic ? 'italic' : ''}`}>
                {account.account_name}
              </span>
              {!account.is_synthetic && account.description && (
                <p className="text-xs text-slate-500">{account.description}</p>
              )}
            </div>
          </td>
          <td className="p-3 text-right font-semibold">
            <span className={Math.abs(balance) > 0.001 ? (balance < -0.001 ? 'text-red-600' : 'text-slate-900') : 'text-slate-400'}>
              ${Math.abs(balance).toFixed(2)}
              {isCr && <span className="ml-1">CR</span>}
              {isDr && <span className="ml-1">DR</span>}
            </span>
          </td>
          <td className="p-3 text-center">
             {!account.is_synthetic && (
                <Badge variant="outline">{transactionCount}</Badge>
             )}
          </td>
          <td className="p-3 text-center">
            {!account.is_synthetic && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccountClick(account.account_number);
                }}
              >
                <FileText className="w-4 h-4 mr-1" />
                View
              </Button>
            )}
          </td>
        </tr>
        {hasChildren && account.children.map(child => (
          <AccountRow 
            key={child.is_synthetic ? `${child.account_number}-synthetic` : child.id} 
            account={child} 
            level={level + 1} 
            onAccountClick={onAccountClick}
          />
        ))}
      </React.Fragment>
    );
  };

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          {!isEmbedded && (
            <Link to={createPageUrl('ChartOfAccounts')}>
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
          )}
          <div>
            <h1 className="text-3xl font-bold text-foreground">General Ledger</h1>
            <p className="text-muted-foreground mt-1">View all account balances and transactions</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Search Accounts</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Account number, name, or type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Quick Date Filters & Account Type Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
                    setEndDate(format(now, 'yyyy-MM-dd'));
                  }}
                >
                This Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
                  setStartDate(format(lastMonth, 'yyyy-MM-dd'));
                  setEndDate(format(lastDay, 'yyyy-MM-dd'));
                }}
              >
                Last Month
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setStartDate(`${year}-01-01`);
                  setEndDate(`${year}-03-31`);
                }}
              >
                Q1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setStartDate(`${year}-04-01`);
                  setEndDate(`${year}-06-30`);
                }}
              >
                Q2
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setStartDate(`${year}-07-01`);
                  setEndDate(`${year}-09-30`);
                }}
              >
                Q3
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear() - 1;
                  setStartDate(`${year}-10-01`);
                  setEndDate(`${year}-12-31`);
                }}
              >
                Q4
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear();
                  setStartDate(`${year}-01-01`);
                  setEndDate(format(new Date(), 'yyyy-MM-dd'));
                }}
              >
                This Year
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const year = new Date().getFullYear() - 1;
                  setStartDate(`${year}-01-01`);
                  setEndDate(`${year}-12-31`);
                }}
              >
                Last Year
              </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200" onClick={() => setSearchTerm('Asset')}>Assets</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs bg-red-100 text-red-800 hover:bg-red-200 border-red-200" onClick={() => setSearchTerm('Liability')}>Liabilities</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200" onClick={() => setSearchTerm('Equity')}>Equity</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs bg-green-100 text-green-800 hover:bg-green-200 border-green-200" onClick={() => setSearchTerm('Revenue')}>Revenue</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200" onClick={() => setSearchTerm('Expense')}>Expense</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Loading accounts...</p>
            </CardContent>
          </Card>
        ) : sortedGroups.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Accounts Found</h3>
              <p className="text-slate-600">No accounts match your search criteria</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {sortedGroups.map(accountType => (
              <Card key={accountType}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge className={accountTypeColors[accountType]}>
                      {accountType}
                    </Badge>
                    <span className="text-sm font-normal text-slate-600">
                      ({groupedAccounts[accountType].length} accounts)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Account #</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Account Name</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Balance</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Transactions</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedAccounts[accountType]
                          .sort((a, b) => a.account_number.localeCompare(b.account_number))
                          .map(account => (
                            <AccountRow 
                              key={account.id} 
                              account={account} 
                              onAccountClick={handleAccountClick}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}