import React, { useState, useEffect } from 'react';
import { ChartOfAccount, GLTransaction } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, Loader2, FileText } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format, subDays } from 'date-fns';

export default function GeneralLedgerPage() {
  const [accounts, setAccounts] = useState([]);
  const [accountBalances, setAccountBalances] = useState({});
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
      // Load all accounts
      const accountsData = await ChartOfAccount.list();
      const activeAccounts = accountsData.filter(acc => acc.is_active);
      setAccounts(activeAccounts);

      // Load all transactions in date range
      const allTransactions = await GLTransaction.list();
      const filteredTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.transaction_date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return txDate >= start && txDate <= end;
      });

      // --- Build Hierarchy & Calculate Totals (Client-Side) ---

      // 1. Initialize Nodes
      const accountMap = {};
      activeAccounts.forEach(account => {
        // Find own transactions
        const accountTxs = filteredTransactions.filter(
          tx => tx.account_number === account.account_number
        );
        
        // Calculate basic Dr-Cr
        const drMinusCr = accountTxs.reduce((sum, tx) => sum + (tx.debit_amount || 0) - (tx.credit_amount || 0), 0);

        // Determine Sign based on Type
        let ownBalance = 0;
        if (['Asset', 'Expense'].includes(account.account_type)) {
           ownBalance = drMinusCr;
        } else {
           ownBalance = -drMinusCr; // Cr - Dr
        }

        accountMap[account.account_number] = {
          ...account,
          children: [],
          own_balance: ownBalance,
          total_balance: 0, // Will be calculated
          transactionCount: accountTxs.length
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

      // 5. Update State (No Filtering!)
      // We need to pass the hierarchical 'roots' to the view, but the current view expects a flat list to group.
      // Actually, we should probably group the ROOTS by type, and then render hierarchically.
      
      // Update accountBalances map for easy lookup in the view (mapped to total_balance now)
      const newBalances = {};
      
      // Helper to populate balances map from tree
      const populateBalances = (nodes) => {
        nodes.forEach(node => {
          newBalances[node.account_number] = {
            balance: node.total_balance,
            transactionCount: node.transactionCount
          };
          if (node.children) populateBalances(node.children);
        });
      };
      populateBalances(roots);
      
      setAccountBalances(newBalances);

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
  const AccountRow = ({ account, level = 0, accountBalances, onAccountClick }) => {
    const accountData = accountBalances[account.account_number] || { balance: 0, transactionCount: 0 };
    const hasChildren = account.children && account.children.length > 0;
    
    // If calculating totals recursively, use the 'total_balance' property from the hierarchy build
    // But since accountBalances is passed separately, we should use that if available. 
    // Wait, accountBalances comes from the hierarchy calculation below now.
    
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
            <span className={accountData.balance !== 0 ? 'text-slate-900' : 'text-slate-400'}>
              ${Math.abs(accountData.balance).toFixed(2)}
              {accountData.balance < 0 && <span className="text-red-600 ml-1">CR</span>}
              {accountData.balance > 0 && <span className="text-blue-600 ml-1">DR</span>}
            </span>
          </td>
          <td className="p-3 text-center">
             {!account.is_synthetic && (
                <Badge variant="outline">{accountData.transactionCount}</Badge>
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
            accountBalances={accountBalances}
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
        <div>
          <h1 className="text-3xl font-bold text-slate-900">General Ledger</h1>
          <p className="text-slate-600 mt-1">View all account balances and transactions</p>
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

            {/* Quick Date Filters */}
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
                              accountBalances={accountBalances}
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