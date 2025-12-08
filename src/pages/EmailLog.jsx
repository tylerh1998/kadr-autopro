import React, { useState, useEffect } from 'react';
import { SentEmailLog, Customer } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Mail, Search, CheckCircle, XCircle, AlertTriangle, Clock, Ban, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import EmailLogDetailsModal from '../components/emails/EmailLogDetailsModal';

export default function EmailLogPage() {
  const [logs, setLogs] = useState([]);
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsData, customersData] = await Promise.all([
        SentEmailLog.list('-sent_date', 200), // Get latest 200 logs
        Customer.list()
      ]);
      
      setLogs(logsData);

      const customerMap = customersData.reduce((acc, customer) => {
        acc[customer.id] = customer;
        return acc;
      }, {});
      setCustomers(customerMap);

    } catch (error) {
      console.error("Failed to load email logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    const customerName = customer ? `${customer.first_name} ${customer.last_name}` : '';
    const searchLower = searchTerm.toLowerCase();

    return (
      log.to_email.toLowerCase().includes(searchLower) ||
      log.subject.toLowerCase().includes(searchLower) ||
      customerName.toLowerCase().includes(searchLower)
    );
  });
  
  const StatusBadge = ({ status }) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case 'bounced':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><XCircle className="w-3 h-3 mr-1" />Bounced</Badge>;
      case 'complained':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><AlertTriangle className="w-3 h-3 mr-1" />Complained</Badge>;
      case 'delivery_delayed':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Delayed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><Ban className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };



  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Email Log</h1>
          <p className="text-slate-600 mt-1">History of all emails sent from the platform.</p>
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
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
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
                  ) : filteredLogs.length > 0 ? (
                    filteredLogs.map(log => (
                      <TableRow key={log.id} onClick={() => handleRowClick(log)} className="cursor-pointer hover:bg-slate-100 transition-colors">
                        <TableCell><StatusBadge status={log.status} /></TableCell>
                        <TableCell>{format(new Date(log.sent_date), 'MMM d, yyyy h:mm a')}</TableCell>
                        <TableCell>{log.to_email}</TableCell>
                        <TableCell>{customers[log.customer_id] ? `${customers[log.customer_id].first_name} ${customers[log.customer_id].last_name}` : 'N/A'}</TableCell>
                        <TableCell className="font-medium">{log.subject}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24 text-slate-500">
                        No email logs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <EmailLogDetailsModal 
        log={selectedLog}
        customer={selectedLog ? customers[selectedLog.customer_id] : null}
        open={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}