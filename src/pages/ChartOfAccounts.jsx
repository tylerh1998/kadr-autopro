import React, { useState, useEffect } from 'react';
import { ChartOfAccount } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Plus, Search, BookOpen, Edit3, Eye, ArrowUp, ArrowDown } from 'lucide-react';
import { createPageUrl } from '@/utils';
import AccountForm from '../components/accounts/AccountForm';
import { Link } from 'react-router-dom';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollButtons(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const accountsData = await ChartOfAccount.list('account_number');
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (accountData) => {
    try {
      if (editingAccount) {
        await ChartOfAccount.update(editingAccount.id, accountData);
      } else {
        await ChartOfAccount.create(accountData);
      }
      setShowForm(false);
      setEditingAccount(null);
      loadAccounts();
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account.');
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setShowForm(true);
  };

  const handleViewDetails = (account) => {
    const width = 1200;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
    
    window.open(`${createPageUrl('GLAcct')}?account=${account.account_number}`, '_blank', features);
  };



  const filteredAccounts = accounts.filter(account => {
    const searchLower = searchTerm.toLowerCase();
    return !searchTerm || 
      account.account_number?.toLowerCase().includes(searchLower) ||
      account.account_name?.toLowerCase().includes(searchLower) ||
      account.account_type?.toLowerCase().includes(searchLower);
  });

  // Group accounts by type
  const accountsByType = {
    'Asset': filteredAccounts.filter(a => a.account_type === 'Asset'),
    'Liability': filteredAccounts.filter(a => a.account_type === 'Liability'),
    'Equity': filteredAccounts.filter(a => a.account_type === 'Equity'),
    'Revenue': filteredAccounts.filter(a => a.account_type === 'Revenue'),
    'Expense': filteredAccounts.filter(a => a.account_type === 'Expense')
  };

  const accountTypeColors = {
    'Asset': 'bg-blue-100 text-blue-800',
    'Liability': 'bg-red-100 text-red-800',
    'Equity': 'bg-purple-100 text-purple-800',
    'Revenue': 'bg-green-100 text-green-800',
    'Expense': 'bg-orange-100 text-orange-800'
  };

  const accountTypeLabels = {
    'Asset': 'Assets',
    'Liability': 'Liabilities',
    'Equity': 'Equity',
    'Revenue': 'Revenue',
    'Expense': 'Expenses'
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Floating Scroll Buttons */}
      {showScrollButtons && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
          <Button
            onClick={scrollToTop}
            size="icon"
            className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
          >
            <ArrowUp className="w-5 h-5" />
          </Button>
          <Button
            onClick={scrollToBottom}
            size="icon"
            className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
          >
            <ArrowDown className="w-5 h-5" />
          </Button>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Chart of Accounts</h1>
            <p className="text-slate-600 mt-1">Manage your accounting structure</p>
          </div>
          <div className="flex gap-2">
            <Link to={createPageUrl('PLReport')}>
              <Button variant="outline" className="bg-white">
                <BookOpen className="w-4 h-4 mr-2" />
                P&L Report
              </Button>
            </Link>
            <Link to={createPageUrl('BalanceSheet')}>
              <Button variant="outline" className="bg-white">
                <BookOpen className="w-4 h-4 mr-2" />
                Balance Sheet
              </Button>
            </Link>
            <Button 
              onClick={() => {
                setEditingAccount(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add GL Account
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by account number, name, or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {showForm ? (
          <AccountForm
            account={editingAccount}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingAccount(null);
            }}
          />
        ) : (
          /* Accounts Table */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Chart of Accounts ({filteredAccounts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-semibold text-slate-700">Acct #</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Account Name</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Account Type</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array(10).fill(0).map((_, i) => (
                        <tr key={i} className="border-b animate-pulse">
                          <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                          <td className="p-3"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                          <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                          <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                        </tr>
                      ))
                    ) : filteredAccounts.length > 0 ? (
                      <>
                        {['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map((type) => (
                          accountsByType[type].length > 0 && (
                            <React.Fragment key={type}>
                              <tr className="bg-slate-100">
                                <td colSpan="4" className="p-3">
                                  <h3 className="font-bold text-slate-900 text-lg">{accountTypeLabels[type]}</h3>
                                </td>
                              </tr>
                              {accountsByType[type].map((account) => (
                                <ContextMenu key={account.id}>
                                  <ContextMenuTrigger asChild>
                                    <tr className="border-b hover:bg-slate-50 cursor-pointer transition-colors">
                                      <td className="p-3" style={{ paddingLeft: account.parent_account ? '2rem' : '0.75rem' }}>
                                        <span className="font-mono font-bold text-slate-900">{account.account_number}</span>
                                      </td>
                                      <td className="p-3" style={{ paddingLeft: account.parent_account ? '2rem' : '0.75rem' }}>
                                        <span className="font-medium text-slate-900">{account.account_name}</span>
                                        {account.description && (
                                          <p className="text-xs text-slate-500 mt-1">{account.description}</p>
                                        )}
                                      </td>
                                      <td className="p-3">
                                        <Badge className={accountTypeColors[account.account_type]}>
                                          {account.account_type}
                                        </Badge>
                                      </td>
                                      <td className="p-3">
                                        <Badge variant={account.is_active ? "default" : "secondary"}>
                                          {account.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                      </td>
                                    </tr>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent>
                                    <ContextMenuItem onClick={() => handleViewDetails(account)}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      View Account Details
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleEdit(account)}>
                                      <Edit3 className="w-4 h-4 mr-2" />
                                      Edit Account
                                    </ContextMenuItem>

                                  </ContextMenuContent>
                                </ContextMenu>
                              ))}
                            </React.Fragment>
                          )
                        ))}
                      </>
                    ) : (
                      <tr>
                        <td colSpan="4" className="p-12 text-center">
                          <div className="text-slate-400 mb-4">
                            <BookOpen className="w-12 h-12 mx-auto" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Accounts Found</h3>
                          <p className="text-slate-600 mb-4">
                            {searchTerm ? 'No accounts match your search.' : 'Create your first account to get started.'}
                          </p>
                          <Button onClick={() => setShowForm(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Account
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}