import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Mail, Search, CheckCircle, XCircle, AlertTriangle, Clock, Ban, RefreshCw, Eye, MousePointerClick, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'react-router-dom';
import EmailLogDetailsModal from '../components/emails/EmailLogDetailsModal';

export default function EmailLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdFilter = searchParams.get('customerId');

  const [logs, setLogs] = useState([]);
  const [customers, setCustomers] = useState({});
  const [workOrders, setWorkOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 25;

  const getCustomerDisplayName = (customer) => {
    if (!customer) return 'N/A';
    if (customer.org_name?.trim()) return customer.org_name.trim();
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'N/A';
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let logsQuery = supabase.from('SentEmailLog').select('*').order('sent_date', { ascending: false });
      logsQuery = customerIdFilter ? logsQuery.eq('customer_id', customerIdFilter) : logsQuery.limit(200);

      const customersQuery = customerIdFilter
        ? supabase.from('Customer').select('*').eq('id', customerIdFilter)
        : supabase.from('Customer').select('*');

      const [
        { data: logsData, error: logsError },
        { data: customersData, error: customersError },
        { data: workOrdersData, error: workOrdersError }
      ] = await Promise.all([
        logsQuery,
        customersQuery,
        supabase.from('WorkOrder').select('*')
      ]);

      if (logsError) throw logsError;
      setLogs(logsData || []);

      if (customersError) throw customersError;
      const customerMap = (customersData || []).reduce((acc, customer) => {
        acc[customer.id] = customer;
        return acc;
      }, {});
      setCustomers(customerMap);

      if (workOrdersError) throw workOrdersError;
      const woMap = (workOrdersData || []).reduce((acc, wo) => {
        acc[wo.id] = wo;
        return acc;
      }, {});
      setWorkOrders(woMap);

    } catch (error) {
      console.error("Failed to load email logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchData();
  }, [customerIdFilter]);

  const handleClearCustomerFilter = () => {
    setSearchParams({});
  };

  const handleRowClick = (log) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedLog(null);
    setIsModalOpen(false);
  };

  const filteredLogs = logs.filter(log => {
    const customer = customers[log.customer_id];
    const customerName = getCustomerDisplayName(customer);
    const searchLower = searchTerm.toLowerCase();

    return (
      log.to_email.toLowerCase().includes(searchLower) ||
      log.subject.toLowerCase().includes(searchLower) ||
      customerName.toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredLogs.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
  
  const StatusBadge = ({ status }) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900/60"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900/60"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case 'opened':
        return <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-900/60"><Eye className="w-3 h-3 mr-1" />Opened</Badge>;
      case 'clicked':
        return <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900/60"><MousePointerClick className="w-3 h-3 mr-1" />Clicked</Badge>;
      case 'bounced':
        return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-900/60"><XCircle className="w-3 h-3 mr-1" />Bounced</Badge>;
      case 'complained':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-900/60"><AlertTriangle className="w-3 h-3 mr-1" />Complained</Badge>;
      case 'delivery_delayed':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-900/60"><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-900/60"><Ban className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };



  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Email/Text Log</h1>
          <p className="text-slate-600 mt-1 dark:text-slate-400">History of all emails and text messages sent from the platform.</p>
          {customerIdFilter && (
            <Badge
              variant="outline"
              className="mt-3 bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/60 pl-2.5 pr-1.5 py-1.5"
            >
              <Filter className="w-3 h-3 mr-1.5" />
              Filtered by customer: {getCustomerDisplayName(customers[customerIdFilter])}
              <button
                onClick={handleClearCustomerFilter}
                className="ml-2 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-full p-0.5 transition-colors"
                aria-label="Clear customer filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Sent Emails</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search by recipient, subject, customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchData}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden dark:border-slate-700">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Subject</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : paginatedLogs.length > 0 ? (
                    paginatedLogs.map(log => (
                      <TableRow key={log.id} onClick={() => handleRowClick(log)} className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <TableCell><StatusBadge status={log.status} /></TableCell>
                        <TableCell>{format(new Date(log.sent_date), 'MMM d, yyyy h:mm a')}</TableCell>
                        <TableCell>{log.to_email}</TableCell>
                        <TableCell>{getCustomerDisplayName(customers[log.customer_id])}</TableCell>
                        <TableCell className="font-medium">{log.subject}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24 text-slate-500 dark:text-slate-400">
                        No email logs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredLogs.length > recordsPerPage && (
              <div className="flex items-center justify-between px-4 py-4 border-t dark:border-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} emails
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <div className="flex items-center px-3 text-sm text-slate-600 dark:text-slate-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <EmailLogDetailsModal 
        log={selectedLog}
        customer={selectedLog ? customers[selectedLog.customer_id] : null}
        workOrder={selectedLog ? workOrders[selectedLog.work_order_id] : null}
        open={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}