import React, { useState, useEffect } from "react";
import { PayStub, Employee, Remittance } from "@/components/paypro/lib/payrollEntities";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Loader2, Pencil, CheckCircle, Circle, Lock, Send, XCircle, Ban, ChevronDown, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditPayStub from "@/components/paypro/paystubs/EditPayStub";
import CancelPaychequeModal from "@/components/paypro/paystubs/CancelPaychequeModal";
import BatchPaymentModal from "@/components/paypro/paystubs/BatchPaymentModal";
import CancelPaymentModal from "@/components/paypro/paystubs/CancelPaymentModal";
import EmailPaystubsModal from "@/components/paypro/paystubs/EmailPaystubsModal";
import PayStubViewerModal from "@/components/paypro/paystubs/PayStubViewerModal";

export default function PayStubs() {
  const [payStubs, setPayStubs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [remittedStubIds, setRemittedStubIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStub, setEditingStub] = useState(null);
  const [cancellingStub, setCancellingStub] = useState(null);
  const [selectedStubs, setSelectedStubs] = useState([]);
  const [selectionType, setSelectionType] = useState(null); // 'paid' or 'unpaid'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(null);
  const [generatingBatchPDF, setGeneratingBatchPDF] = useState(null); // 'employee' | 'employer' | null
  const [viewerStub, setViewerStub] = useState(null); // { pdfDataUri, filename, title } | null

  // Filter states
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [daysBack, setDaysBack] = useState("30");

  const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const [dateRange, setDateRange] = useState(getInitialDateRange());
  const [appliedDateFilter, setAppliedDateFilter] = useState(getInitialDateRange());

  useEffect(() => {
    loadPayStubs();
  }, []);

  const loadPayStubs = async () => {
    setLoading(true);
    const [stubs, emps, remittances] = await Promise.all([
      PayStub.list('-paycheque_number'),
      Employee.list(),
      Remittance.list(),
    ]);
    setPayStubs(stubs);
    setEmployees(emps);
    // Phase 7 D2: a cancelled remittance must un-lock its stubs - only non-cancelled
    // remittances count toward the "already remitted" lock.
    setRemittedStubIds(remittances.filter((r) => r.status !== 'cancelled').flatMap((r) => r.pay_stub_ids || []));
    setLoading(false);
  };

  const getEmployee = (employeeId) => {
    return employees.find((e) => e.employee_id === employeeId);
  };

  const generatePayStubPDF = async (stub, type) => {
    const functionName = type === 'employer' ? 'paypro-generatePayStubPDFEmployer' : 'paypro-generatePayStubPDF';
    const { data: result, error: invokeError } = await supabase.functions.invoke(functionName, { body: { stubId: stub.id } });
    if (invokeError) throw invokeError;
    if (result?.error) throw new Error(result.error);
    return result.data; // { pdfDataUri, filename }
  };

  const triggerFileDownload = (pdfDataUri, filename) => {
    const link = document.createElement('a');
    link.href = pdfDataUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk (Employee/Employer buttons, multiple stubs at once) - downloads directly, same
  // as before. A modal-per-stub doesn't make sense for a batch of N stubs.
  const downloadPayStubPDF = async (stub, type) => {
    const employee = getEmployee(stub.employee_id);
    const { pdfDataUri, filename } = await generatePayStubPDF(stub, type);
    triggerFileDownload(pdfDataUri, filename || `${stub.paycheque_number || 'paystub'} - ${employee?.first_name} ${employee?.last_name}.pdf`);
  };

  // Per-row "View" - opens a large in-page PDF preview modal instead of downloading.
  const handleViewPayStubPDF = async (stubId, type = 'employee') => {
    const stub = payStubs.find((s) => s.id === stubId);
    if (!stub) return;

    if (!stub.is_paid) {
      const proceed = window.confirm('Warning: This paycheque is unpaid. Do you want to continue?');
      if (!proceed) return;
    }

    const employee = getEmployee(stub.employee_id);

    setGeneratingPDF(stubId);
    try {
      const { pdfDataUri, filename } = await generatePayStubPDF(stub, type);
      setViewerStub({
        pdfDataUri,
        filename: filename || `${stub.paycheque_number || 'paystub'} - ${employee?.first_name} ${employee?.last_name}.pdf`,
        title: `${type === 'employer' ? 'Employer' : 'Employee'} Copy — ${employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown'} — ${stub.paycheque_number || 'Pay Stub'}`,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(error.message || 'Error generating PDF. Please try again.');
    } finally {
      setGeneratingPDF(null);
    }
  };

  // Batch download - one PDF per selected paid stub, staggered so the browser doesn't
  // throttle/block several near-simultaneous downloads (same stagger pattern T4s.jsx
  // uses for its per-employee window.open() calls).
  const handleBatchPayStubPDF = async (type) => {
    if (stubsForPayment.length === 0) return;

    setGeneratingBatchPDF(type);
    try {
      for (const stub of stubsForPayment) {
        await downloadPayStubPDF(stub, type);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch (error) {
      console.error(`Error generating ${type} PDFs:`, error);
      alert(error.message || 'Error generating PDFs. Please try again.');
    } finally {
      setGeneratingBatchPDF(null);
    }
  };

  const handleDaysBackChange = (e) => {
    const val = e.target.value;
    setDaysBack(val);
    if (val && !isNaN(val)) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - parseInt(val));

      setDateRange({
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      });
    } else {
      setDateRange({ start: "", end: "" });
    }
  };

  const handleQuickFilter = (type) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    now.setHours(0, 0, 0, 0);

    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (type) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this_quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), currentQuarter * 3, 1);
        end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
        break;
      }
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case 'last_year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
    }

    setDateRange({
      start: formatDate(start),
      end: formatDate(end),
    });
    setDaysBack("");
  };

  const handleApplyFilter = () => {
    setAppliedDateFilter(dateRange);
  };

  const filteredPayStubs = payStubs.filter((stub) => {
    if (employeeFilter !== "all" && stub.employee_id !== employeeFilter) return false;

    if (appliedDateFilter.start && stub.pay_period_end < appliedDateFilter.start) return false;
    if (appliedDateFilter.end && stub.pay_period_end > appliedDateFilter.end) return false;

    return true;
  });

  const handleEditComplete = () => {
    setEditingStub(null);
    loadPayStubs();
  };

  const handleCancelPaychequeComplete = () => {
    setCancellingStub(null);
    loadPayStubs();
  };

  const handleSelectStub = (stub, isChecked) => {
    const currentStatus = stub.is_paid ? 'paid' : 'unpaid';

    if (isChecked) {
      if (selectionType && selectionType !== currentStatus) {
        setSelectedStubs([stub.id]);
        setSelectionType(currentStatus);
      } else {
        setSelectedStubs((prev) => [...prev, stub.id]);
        if (!selectionType) setSelectionType(currentStatus);
      }
    } else {
      const newSelection = selectedStubs.filter((id) => id !== stub.id);
      setSelectedStubs(newSelection);
      if (newSelection.length === 0) {
        setSelectionType(null);
      }
    }
  };

  const handleSelectAll = () => {
    const visibleSelectable = filteredPayStubs;

    let targetStubs = visibleSelectable;
    if (selectionType === 'unpaid') {
      targetStubs = visibleSelectable.filter((s) => !s.is_paid);
    } else if (selectionType === 'paid') {
      targetStubs = visibleSelectable.filter((s) => s.is_paid);
    } else {
      const unpaid = visibleSelectable.filter((s) => !s.is_paid);
      if (unpaid.length > 0) {
        targetStubs = unpaid;
        setSelectionType('unpaid');
      } else {
        targetStubs = visibleSelectable.filter((s) => s.is_paid);
        if (targetStubs.length > 0) setSelectionType('paid');
      }
    }

    const targetIds = targetStubs.map((s) => s.id);

    const allSelected = targetIds.length > 0 && targetIds.every((id) => selectedStubs.includes(id));

    if (allSelected) {
      setSelectedStubs([]);
      setSelectionType(null);
    } else {
      setSelectedStubs(targetIds);
    }
  };

  const handleBatchActionComplete = () => {
    setShowPaymentModal(false);
    setShowCancelModal(false);
    setSelectedStubs([]);
    setSelectionType(null);
    loadPayStubs();
  };

  const stubsForPayment = payStubs.filter((s) => selectedStubs.includes(s.id));
  const hasRemittedOrCancelledSelected = stubsForPayment.some((s) => s.is_cancelled || remittedStubIds.includes(s.id));

  const visibleSelectable = filteredPayStubs;
  let relevantStubs = visibleSelectable;
  if (selectionType === 'unpaid') relevantStubs = visibleSelectable.filter((s) => !s.is_paid);
  if (selectionType === 'paid') relevantStubs = visibleSelectable.filter((s) => s.is_paid);

  const isAllSelected = relevantStubs.length > 0 && relevantStubs.every((s) => selectedStubs.includes(s.id));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Pay Stubs</h1>
        </div>
        <div className="flex gap-2">
          {selectionType === 'unpaid' && selectedStubs.length > 0 && !hasRemittedOrCancelledSelected && (
            <Button
              onClick={() => setShowPaymentModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
              <Send className="mr-2 h-4 w-4" />
              Process Payment ({selectedStubs.length})
            </Button>
          )}

          {selectionType === 'paid' && selectedStubs.length > 0 && !hasRemittedOrCancelledSelected && (
            <Button
              onClick={() => setShowCancelModal(true)}
              variant="destructive"
              className="shadow-sm"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Payment ({selectedStubs.length})
            </Button>
          )}

          {selectionType === 'paid' && selectedStubs.length > 0 && (
            <Button
              onClick={() => handleBatchPayStubPDF('employer')}
              disabled={generatingBatchPDF !== null}
              variant="outline"
              className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm"
            >
              {generatingBatchPDF === 'employer' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Employer ({selectedStubs.length})
            </Button>
          )}

          {selectionType === 'paid' && selectedStubs.length > 0 && (
            <Button
              onClick={() => handleBatchPayStubPDF('employee')}
              disabled={generatingBatchPDF !== null}
              variant="outline"
              className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 shadow-sm"
            >
              {generatingBatchPDF === 'employee' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Employee ({selectedStubs.length})
            </Button>
          )}

          {selectionType === 'paid' && selectedStubs.length > 0 && (
            <Button
              onClick={() => setShowEmailModal(true)}
              className="bg-blue-600 hover:bg-blue-700 shadow-sm text-white"
            >
              <Send className="mr-2 h-4 w-4" />
              Email ({selectedStubs.length})
            </Button>
          )}
        </div>
      </div>

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <CardTitle className="dark:text-slate-100">Generated Pay Stubs</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="w-[180px] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
                      <SelectValue placeholder="Filter Employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.employee_id} value={emp.employee_id}>
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded border dark:border-slate-700">
                    <Input
                      type="number"
                      className="w-16 h-8 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      value={daysBack}
                      onChange={handleDaysBackChange}
                      placeholder="Days"
                      title="Days Back"
                    />
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                    <Input
                      type="date"
                      className="w-32 h-8 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                    <span className="text-slate-400">-</span>
                    <Input
                      type="date"
                      className="w-32 h-8 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                    <Button onClick={handleApplyFilter} size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white border-0">
                      Apply
                    </Button>
                  </div>
                  <div className="absolute top-full right-0 mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400 pr-1 whitespace-nowrap z-10">
                    <button onClick={() => handleQuickFilter('this_month')} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">This Month</button>
                    <button onClick={() => handleQuickFilter('last_month')} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">Last Month</button>
                    <button onClick={() => handleQuickFilter('this_quarter')} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">This Quarter</button>
                    <button onClick={() => handleQuickFilter('this_year')} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">This Year</button>
                    <button onClick={() => handleQuickFilter('last_year')} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">Last Year</button>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleSelectAll}
                  className={`${isAllSelected ? "bg-yellow-400 hover:bg-yellow-500" : "bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border border-yellow-400 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60 dark:text-yellow-300 dark:border-yellow-700"} text-black transition-colors`}
                >
                  {isAllSelected ? "Deselect All" : (selectionType ? `Select All ${selectionType === 'paid' ? 'Paid' : 'Unpaid'}` : "Select All")}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-blue-800 dark:text-blue-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Paycheque #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pay Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Net Pay</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayStubs.map((stub) => {
                  const employee = getEmployee(stub.employee_id);
                  const isPaid = stub.is_paid;
                  const isCancelled = stub.is_cancelled;
                  const isRemitted = remittedStubIds.includes(stub.id);
                  const isSelected = selectedStubs.includes(stub.id);
                  const currentStatus = isPaid ? 'paid' : 'unpaid';

                  const isRowClickable = (!selectionType || selectionType === currentStatus);

                  const handleRowClick = (e) => {
                    if (e.target.closest('button') || e.target.closest('[role="checkbox"]') || e.target.closest('[role="menuitem"]') || e.target.closest('[role="menu"]')) return;
                    if (!isRowClickable) return;
                    handleSelectStub(stub, !isSelected);
                  };

                  return (
                    <TableRow
                      key={stub.id}
                      className={`${isSelected ? (isPaid ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30") : ""} ${isRowClickable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" : ""}`}
                      onClick={handleRowClick}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectStub(stub, checked)}
                          disabled={(selectionType && selectionType !== currentStatus)}
                          title={
                            (selectionType && selectionType !== currentStatus ? `Only ${selectionType} stubs can be selected` : "")
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium dark:text-slate-200">
                        {stub.paycheque_number || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {isRemitted ? (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 flex items-center gap-2 w-fit"><Lock className="h-3 w-3" />Remitted</Badge>
                        ) : isCancelled ? (
                          <Badge className="bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300 flex items-center gap-2 w-fit"><Ban className="h-3 w-3" />Cancelled</Badge>
                        ) : isPaid ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 flex items-center gap-2 w-fit"><CheckCircle className="h-3 w-3" />Paid</Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-2 w-fit"><Circle className="h-3 w-3" />Unpaid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">
                        {stub.pay_date ? stub.pay_date : (stub.is_paid ? '---' : <span className="text-slate-400 dark:text-slate-500">Not paid</span>)}
                      </TableCell>
                      <TableCell>
                        {employee ? (
                          <div
                            className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-2 py-1 -ml-2 w-fit transition-colors dark:text-slate-200"
                            title={employee.email ? `Click to copy email: ${employee.email}` : "No email available"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (employee.email) navigator.clipboard.writeText(employee.email);
                            }}
                          >
                            {employee.first_name} {employee.last_name}
                          </div>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="dark:text-slate-300">
                        {stub.pay_period_start} - {stub.pay_period_end}
                      </TableCell>
                      <TableCell>
                        <div
                          className="font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 rounded px-2 py-1 -ml-2 w-fit transition-colors"
                          title="Click to copy net pay"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(stub.net_pay?.toFixed(2));
                          }}
                        >
                          ${stub.net_pay?.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={generatingPDF === stub.id}
                                className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                {generatingPDF === stub.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                View
                                <ChevronDown className="ml-1 h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleViewPayStubPDF(stub.id, 'employee')}>
                                Employee Copy
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewPayStubPDF(stub.id, 'employer')}>
                                Employer Copy
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingStub(stub)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 dark:border-slate-700 dark:hover:bg-slate-800"
                            disabled={isRemitted || isPaid || isCancelled}
                            title={
                              isRemitted ? "Cannot edit a remitted paycheque." :
                                isPaid ? "Cannot edit a paid paycheque. Cancel payment first." :
                                  isCancelled ? "Cannot edit a cancelled paycheque." : "Edit paycheque"
                            }
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCancellingStub(stub)}
                            className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 dark:border-slate-700 dark:hover:bg-slate-800"
                            disabled={isRemitted || isPaid || isCancelled}
                            title={
                              isRemitted ? "Cannot cancel a remitted paycheque." :
                                isPaid ? "Cannot cancel a paid paycheque." :
                                  isCancelled ? "Paycheque is already cancelled." : "Cancel paycheque"
                            }
                          >
                            <Ban className="mr-2 h-4 w-4" /> Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showPaymentModal && (
        <BatchPaymentModal
          stubs={stubsForPayment}
          onComplete={handleBatchActionComplete}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}

      {showCancelModal && (
        <CancelPaymentModal
          stubs={stubsForPayment}
          onComplete={handleBatchActionComplete}
          onCancel={() => setShowCancelModal(false)}
        />
      )}

      {showEmailModal && (
        <EmailPaystubsModal
          stubs={stubsForPayment}
          employees={employees}
          onComplete={() => {
            setShowEmailModal(false);
            setSelectedStubs([]);
            setSelectionType(null);
            loadPayStubs();
          }}
          onCancel={() => setShowEmailModal(false)}
        />
      )}

      <PayStubViewerModal
        open={!!viewerStub}
        onOpenChange={(open) => { if (!open) setViewerStub(null); }}
        title={viewerStub?.title}
        pdfDataUri={viewerStub?.pdfDataUri}
        onDownload={() => viewerStub && triggerFileDownload(viewerStub.pdfDataUri, viewerStub.filename)}
      />

      {editingStub && !remittedStubIds.includes(editingStub.id) && !editingStub.is_paid && !editingStub.is_cancelled && (
        <EditPayStub
          payStub={editingStub}
          employee={getEmployee(editingStub.employee_id)}
          onComplete={handleEditComplete}
          onCancel={() => setEditingStub(null)}
        />
      )}

      {cancellingStub && !remittedStubIds.includes(cancellingStub.id) && !cancellingStub.is_paid && !cancellingStub.is_cancelled && (
        <CancelPaychequeModal
          payStub={cancellingStub}
          employee={getEmployee(cancellingStub.employee_id)}
          onComplete={handleCancelPaychequeComplete}
          onCancel={() => setCancellingStub(null)}
        />
      )}
    </div>
  );
}
