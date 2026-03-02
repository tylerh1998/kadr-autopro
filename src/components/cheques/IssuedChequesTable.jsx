import React, { useState, useEffect } from 'react';
import { SupplierPayment, Supplier, BankAccount } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Printer, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function NoteCell({ cheque, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(cheque.notes || "");

  useEffect(() => {
      setValue(cheque.notes || "");
  }, [cheque.notes]);

  const handleSave = () => {
    setIsEditing(false);
    if (value !== (cheque.notes || "")) {
        onUpdate(cheque.id, value);
    }
  };

  if (isEditing) {
    return (
        <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') {
                    setIsEditing(false);
                    setValue(cheque.notes || "");
                }
            }}
            autoFocus
            className="h-7 text-xs bg-white"
            onClick={(e) => e.stopPropagation()}
        />
    );
  }

  return (
    <div 
        className="cursor-pointer hover:bg-slate-200 p-1 rounded min-h-[20px] transition-colors border border-transparent hover:border-slate-300"
        onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
        }}
        title="Click to edit note"
    >
        {cheque.notes || <span className="text-slate-400 italic text-[10px]">Add note...</span>}
    </div>
  );
}

export default function IssuedChequesTable() {
  const [cheques, setCheques] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentsData, suppliersData, bankAccountsData] = await Promise.all([
        SupplierPayment.filter({ payment_method: 'Cheque' }),
        Supplier.list(),
        BankAccount.list()
      ]);

      // Sort by cheque number (numeric if possible, otherwise alphabetic)
      const sortedPayments = paymentsData.sort((a, b) => {
        const aNum = parseInt(a.cheque_number);
        const bNum = parseInt(b.cheque_number);
        
        // If both are valid numbers, sort numerically
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return bNum - aNum; // Descending order (newest/highest first)
        }
        
        // Otherwise sort alphabetically
        return (b.cheque_number || '').localeCompare(a.cheque_number || '');
      });

      setCheques(sortedPayments);
      setSuppliers(suppliersData);
      setBankAccounts(bankAccountsData);
    } catch (error) {
      console.error('Error loading cheque register:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : 'Unknown Supplier';
  };

  const getBankAccountName = (source) => {
    if (!source) return 'N/A';
    const bankAccount = bankAccounts.find(b => b.id === source);
    return bankAccount ? bankAccount.name : source;
  };

  const handleUpdateNote = async (id, newNote) => {
    // Optimistic UI update
    setCheques(prev => prev.map(c => c.id === id ? { ...c, notes: newNote } : c));
    try {
        await SupplierPayment.update(id, { notes: newNote });
    } catch (error) {
        console.error("Failed to update note:", error);
        // Could reload data or revert optimistic update here if needed
        loadData();
    }
  };

  const handleViewCheque = (cheque) => {
    const url = createPageUrl('ChequeWriter') + `?chequeReference=${encodeURIComponent(cheque.cheque_number)}`;
    navigate(url);
  };

  const handleViewSupplier = (supplierId) => {
    const url = createPageUrl('SupplierTx') + `?id=${supplierId}`;
    navigate(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredCheques = cheques.filter(cheque => {
    const searchLower = searchTerm.toLowerCase();
    const supplierName = getSupplierName(cheque.supplier_id).toLowerCase();
    
    return !searchTerm ||
      cheque.cheque_number?.toLowerCase().includes(searchLower) ||
      supplierName.includes(searchLower) ||
      cheque.amount?.toString().includes(searchTerm) ||
      cheque.notes?.toLowerCase().includes(searchLower);
  });

  const totalAmount = filteredCheques.reduce((sum, cheque) => sum + (cheque.amount || 0), 0);

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 2rem; }
          .no-print { display: none !important; }
          .print-title { display: block !important; font-size: 16px; font-weight: bold; margin-bottom: 1rem; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #ddd; padding: 4px; text-align: left; }
          th { background-color: #f2f2f2; }
        }
        @media screen {
          .print-title { display: none; }
        }
      `}</style>

      {/* Header Actions */}
      <div className="flex justify-end no-print">
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="w-4 h-4 mr-2" />
          Print Register
        </Button>
      </div>

      {/* Search */}
      <Card className="no-print">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by cheque number, supplier, amount, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Cheques</p>
                <p className="text-2xl font-bold text-slate-900">{filteredCheques.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Amount</p>
                <p className="text-2xl font-bold text-slate-900">${totalAmount.toFixed(2)}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Last Cheque Date</p>
                <p className="text-lg font-semibold text-slate-900">
                  {filteredCheques.length > 0 
                    ? format(new Date(filteredCheques[0].payment_date), 'MMM d, yyyy')
                    : 'N/A'}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cheques Table */}
      <div className="print-area">
        <div className="print-title" style={{ display: 'none' }}>
          Cheque Register - {format(new Date(), 'MMMM d, yyyy')}
        </div>

        <Card>
          <CardHeader className="no-print">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Issued Cheques ({filteredCheques.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold text-slate-700">Cheque #</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Payable To</th>
                    <th className="text-right p-3 font-semibold text-slate-700">Amount</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Source</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Notes</th>
                    <th className="text-center p-3 font-semibold text-slate-700 no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array(5).fill(0).map((_, i) => (
                      <tr key={i} className="border-b animate-pulse">
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-40"></div></td>
                        <td className="p-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                      </tr>
                    ))
                  ) : filteredCheques.length > 0 ? (
                    filteredCheques.map((cheque) => (
                      <tr key={cheque.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <span className="font-mono font-semibold text-slate-900">
                            {cheque.cheque_number}
                          </span>
                        </td>
                        <td className="p-3">
                          {format(new Date(cheque.payment_date), 'MMM d, yyyy')}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleViewSupplier(cheque.supplier_id)}
                            className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                          >
                            {getSupplierName(cheque.supplier_id)}
                          </button>
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          ${cheque.amount.toFixed(2)}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {getBankAccountName(cheque.source)}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-600 text-xs">
                          {cheque.notes || '-'}
                        </td>
                        <td className="p-3 text-center no-print">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewCheque(cheque)}
                              className="text-xs"
                            >
                              View Cheque
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="p-12 text-center">
                        <div className="text-slate-400 mb-4">
                          <FileText className="w-12 h-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Cheques Found</h3>
                        <p className="text-slate-600">
                          {searchTerm ? 'No cheques match your search criteria.' : 'No cheques have been issued yet.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold">
                  <tr>
                    <td colSpan="3" className="p-3 text-right">Total:</td>
                    <td className="p-3 text-right text-blue-700">${totalAmount.toFixed(2)}</td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}