import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Supplier, SupplierInvoiceLine, SupplierPayment, ChartOfAccount } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Calendar as CalendarIcon, Save, DollarSign, Trash2, AlertTriangle, ChevronDown, ChevronRight, Search, Lock, Edit, Receipt, Printer, Loader2, FileText, Calculator, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { format, subDays, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subYears } from 'date-fns';
import { createPageUrl } from '@/utils';
import SupplierTxModals from '../components/suppliers/SupplierTxModals';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
...
            <SupplierTxModals showLineEditModal={showLineEditModal} setShowLineEditModal={setShowLineEditModal} showInventoryEditModal={showInventoryEditModal} setShowInventoryEditModal={setShowInventoryEditModal} editingLine={editingLine} setEditingLine={setEditingLine} handleLineUpdate={handleLineUpdate} chartOfAccounts={chartOfAccounts} loadData={loadData} showPaymentModal={showPaymentModal} setShowPaymentModal={setShowPaymentModal} supplier={supplier} allConceptualInvoices={allConceptualInvoices} handlePaymentComplete={handlePaymentComplete} />
        </>
    );
}