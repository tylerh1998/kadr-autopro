import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
// Using supabase proxy for entities
import { format, parseISO } from 'date-fns';
import { Loader2, FileText, Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ARPaymentEmailModal from './ARPaymentEmailModal';
import ARReceiptPDFViewerModal from './ARReceiptPDFViewerModal';

export default function ARPaymentDetailsModal({ open, onClose, paymentRecord }) {
  const [appliedToDetails, setAppliedToDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [customerEmail, setCustomerEmail] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPdfUrl, setReceiptPdfUrl] = useState(null);

  useEffect(() => {
    const loadAppliedToDetails = async () => {
      if (!paymentRecord || !open) return;
      
      setLoading(true);
      try {
        // Fetch customer email
        if (paymentRecord.customer_id) {
          try {
            const res = await base44.functions.invoke('supabaseCustomer', { action: 'get', id: paymentRecord.customer_id });
            const customer = res?.data?.data;
            setCustomerEmail(customer?.email || null);
          } catch (e) {
            console.warn('Could not fetch customer:', e);
            setCustomerEmail(null);
          }
        }

        console.log('Loading details for payment:', paymentRecord);

        const response = await base44.functions.invoke('getAppliedPaymentDetails', {
          paymentId: paymentRecord.id
        });

        const details = response?.data?.appliedDetails || [];
        console.log('Loaded applied to details:', details);
        setAppliedToDetails(details);
      } catch (error) {
        console.error('Error loading payment details:', error);
        setAppliedToDetails([]);
      } finally {
        setLoading(false);
      }
    };

    loadAppliedToDetails();
  }, [paymentRecord, open]);

  const totalApplied = appliedToDetails.reduce((sum, detail) => sum + detail.amountApplied, 0);

  // Format payment method to be user-friendly
  const formatPaymentMethod = (method) => {
    if (!method) return 'Unknown';
    return method.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const handleGenerateReceipt = async () => {
    if (!paymentRecord || !paymentRecord.id) return;

    setGeneratingPDF(true);
    try {
      const response = await base44.functions.invoke('generateARReceiptPDF', {
        paymentId: paymentRecord.id
      });

      if (response.data) {
        if (receiptPdfUrl) {
          window.URL.revokeObjectURL(receiptPdfUrl);
        }
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        setReceiptPdfUrl(url);
        setShowReceiptModal(true);
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
      alert('Failed to generate receipt. Please try again.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    if (receiptPdfUrl) {
      window.URL.revokeObjectURL(receiptPdfUrl);
      setReceiptPdfUrl(null);
    }
  };

  const handleEmailReceipt = () => {
    if (!paymentRecord || !paymentRecord.id) return;
    setShowEmailModal(true);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payment Application Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {paymentRecord && (
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Payment Date:</span>
                  <span>{format(parseISO(paymentRecord.payment_date), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Payment Method:</span>
                  <span>{formatPaymentMethod(paymentRecord.payment_method)}</span>
                </div>
                {paymentRecord.reference && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Reference:</span>
                    <span>{paymentRecord.reference}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-semibold">Total Payment:</span>
                  <span className="font-bold">${(paymentRecord.amount || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Applied To:</h3>
              {appliedToDetails.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appliedToDetails.map((detail, index) => (
                        <TableRow key={index} className={detail.isOverpayment ? 'bg-green-50' : ''}>
                          <TableCell>{detail.reference}</TableCell>
                          <TableCell>{detail.date ? format(parseISO(detail.date), 'MMM d, yyyy') : '—'}</TableCell>
                          <TableCell>{detail.description}</TableCell>
                          <TableCell className={`text-right font-semibold ${detail.isOverpayment ? 'text-green-700' : ''}`}>
                            ${detail.amountApplied.toFixed(2)}
                            {detail.isOverpayment && <span className="ml-2 text-xs">(Available Credit)</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-slate-50">
                        <TableCell colSpan={3} className="text-right">Total Applied:</TableCell>
                        <TableCell className="text-right">${totalApplied.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No payment application details available.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button
            onClick={handleEmailReceipt}
            disabled={!paymentRecord}
            variant="outline"
          >
            <Mail className="w-4 h-4 mr-2" />
            Email Receipt
          </Button>
          <Button
            onClick={handleGenerateReceipt}
            disabled={!paymentRecord || generatingPDF}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {generatingPDF ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Receipt
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      {showEmailModal && paymentRecord && (
        <ARPaymentEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          paymentRecord={paymentRecord}
          customerEmail={customerEmail || ''}
          appliedToDetails={appliedToDetails}
        />
      )}
      {showReceiptModal && (
        <ARReceiptPDFViewerModal
          open={showReceiptModal}
          onClose={handleCloseReceiptModal}
          pdfUrl={receiptPdfUrl}
          appliedToDetails={appliedToDetails}
        />
      )}
    </Dialog>
  );
}