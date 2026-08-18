import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import {
  Shield,
  Ticket,
  Search,
  RefreshCw,
  Pencil,
  ExternalLink,
  Paperclip,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const ATTACHMENT_BUCKET = "kadr-issue-report-attachments";

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'replicated', label: 'Replicated' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_testing', label: 'Pending Testing' },
  { value: 'pending_merge', label: 'Pending Merge' },
  { value: 'planned', label: 'Planned' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'closed', label: 'Closed' },
];
const STATUS_LABELS = STATUS_OPTIONS.reduce((acc, opt) => ({ ...acc, [opt.value]: opt.label }), {});
const statusLabel = (status) => STATUS_LABELS[status] || status;

const STATUS_TIER = {
  new: 1,
  follow_up: 2,
  replicated: 2,
  in_progress: 3,
  pending_testing: 4,
  pending_merge: 5,
  planned: 6,
  deferred: 6,
  closed: 7,
};
const TRAILING_TIER = 8;

const SEVERITY_RANK = { critical: 1, medium: 2, low: 3 };
const TRAILING_SEVERITY = 4;

const SEVERITY_BADGE = {
  critical: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-900/60",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-900/60",
  low: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900/60",
};

const STATUS_BADGE = {
  new: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900/60",
  follow_up: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-900/60",
  replicated: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-900/60",
  in_progress: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-900/60",
  pending_testing: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-900/60",
  pending_merge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-900/60",
  planned: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  deferred: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  closed: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-900/60",
};

const LOG_TYPE_COLOR = {
  error: 'text-red-500 dark:text-red-400',
  warn: 'text-yellow-600 dark:text-yellow-400',
  log: 'text-slate-500 dark:text-slate-400',
};

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
};

export default function ManageTickets() {
  const { employee } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [gateLoading, setGateLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [savingField, setSavingField] = useState(null);

  useEffect(() => {
    if (employee?.admin === true) {
      setIsAdmin(true);
    }
    setGateLoading(false);
  }, [employee]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('IssueReport').select('*');
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Failed to load issue reports:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchReports();
  }, [isAdmin]);

  const selectedReport = reports.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    setEditingTitle(false);
    setTitleDraft(selectedReport?.title || '');
    setNotesDraft(selectedReport?.notes || '');
  }, [selectedId]); // eslint-disable-line

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const tierA = STATUS_TIER[a.status] ?? TRAILING_TIER;
      const tierB = STATUS_TIER[b.status] ?? TRAILING_TIER;
      if (tierA !== tierB) return tierA - tierB;

      const sevA = SEVERITY_RANK[a.severity] ?? TRAILING_SEVERITY;
      const sevB = SEVERITY_RANK[b.severity] ?? TRAILING_SEVERITY;
      if (sevA !== sevB) return sevA - sevB;

      return new Date(a.created_date) - new Date(b.created_date);
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    let list = sortedReports;
    if (!showClosed) list = list.filter((r) => r.status !== 'closed');
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((r) =>
        r.title?.toLowerCase().includes(term) ||
        r.user_title?.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term) ||
        r.created_by?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [sortedReports, showClosed, search]);

  const updateIssueReport = async (id, patch) => {
    const { data, error } = await supabase
      .from('IssueReport')
      .update({ ...patch, updated_date: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setReports((prev) => prev.map((r) => (r.id === id ? data : r)));
    return data;
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedReport) return;
    setSavingField('status');
    try {
      await updateIssueReport(selectedReport.id, { status: newStatus });
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveTitle = async () => {
    if (!selectedReport || !titleDraft.trim()) return;
    setSavingField('title');
    try {
      await updateIssueReport(selectedReport.id, { title: titleDraft.trim() });
      setEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      alert('Failed to update title. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedReport) return;
    setSavingField('notes');
    try {
      await updateIssueReport(selectedReport.id, { notes: notesDraft });
    } catch (error) {
      console.error('Failed to save notes:', error);
      alert('Failed to save notes. Please try again.');
    } finally {
      setSavingField(null);
    }
  };

  const handleOpenAttachment = async (attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open attachment:', error);
      alert('Failed to open the attachment. Please try again.');
    }
  };

  if (gateLoading) return <div className="p-8 text-center">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-300">Access Denied</h1>
          <p className="text-slate-500 mt-2 dark:text-slate-400">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
          <Ticket className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Manage Tickets</h1>
          <p className="text-slate-500 dark:text-slate-400">Issue reports submitted through "Report an Issue".</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <Card className="xl:col-span-2">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle>Tickets</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-closed" className="text-sm text-slate-600 dark:text-slate-400">Show closed</Label>
                  <Switch id="show-closed" checked={showClosed} onCheckedChange={setShowClosed} />
                </div>
                <Button variant="outline" size="icon" onClick={fetchReports} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search title, description, reporter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t dark:border-slate-700">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800">
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredReports.length > 0 ? (
                    filteredReports.map((report) => (
                      <TableRow
                        key={report.id}
                        onClick={() => setSelectedId(report.id)}
                        className={`cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
                          selectedId === report.id ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                        }`}
                      >
                        <TableCell>
                          <Badge className={SEVERITY_BADGE[report.severity] || ''} variant={SEVERITY_BADGE[report.severity] ? undefined : 'outline'}>
                            {report.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{report.title}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE[report.status] || ''} variant={STATUS_BADGE[report.status] ? undefined : 'outline'}>
                            {statusLabel(report.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {format(new Date(report.created_date), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24 text-slate-500 dark:text-slate-400">
                        No tickets found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-3">
          {!selectedReport ? (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                Select a ticket to view details.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="space-y-2">
                {editingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="text-lg font-semibold"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveTitle} disabled={savingField === 'title' || !titleDraft.trim()}>
                      {savingField === 'title' ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditingTitle(false); setTitleDraft(selectedReport.title || ''); }}
                      disabled={savingField === 'title'}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{selectedReport.title}</CardTitle>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTitle(true)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                {selectedReport.user_title && selectedReport.user_title !== selectedReport.title && (
                  <CardDescription>Originally reported: &ldquo;{selectedReport.user_title}&rdquo;</CardDescription>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Select value={selectedReport.status} onValueChange={handleStatusChange} disabled={savingField === 'status'}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge className={SEVERITY_BADGE[selectedReport.severity] || ''} variant={SEVERITY_BADGE[selectedReport.severity] ? undefined : 'outline'}>
                    {selectedReport.severity}
                  </Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Created {format(new Date(selectedReport.created_date), 'MMM d, yyyy h:mm a')}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Updated {format(new Date(selectedReport.updated_date), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-slate-700 dark:text-slate-300">Description</Label>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedReport.description}</p>
                </div>

                {selectedReport.error_message && (
                  <div className="space-y-1.5">
                    <Label className="text-slate-700 dark:text-slate-300">Error Message</Label>
                    <pre className="text-xs font-mono whitespace-pre-wrap rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-slate-700 dark:text-slate-300">
                      {selectedReport.error_message}
                    </pre>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-slate-700 dark:text-slate-300">Metadata</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Reporter:</span> {selectedReport.created_by}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Employee:</span> {selectedReport.metadata?.employee_name || 'Unknown'}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Browser:</span> {selectedReport.metadata?.browser || 'N/A'}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Screen:</span> {selectedReport.metadata?.screen_resolution || 'N/A'}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Clocked in:</span> {selectedReport.metadata?.is_globally_clocked_in ? 'Yes' : 'No'}
                    </div>
                    {selectedReport.url && (
                      <a
                        href={selectedReport.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline truncate"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Open source page
                      </a>
                    )}
                  </div>
                </div>

                {selectedReport.console_logs?.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-slate-700 dark:text-slate-300">Console Logs</Label>
                    <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-2 font-mono text-xs space-y-0.5">
                      {selectedReport.console_logs.map((log, i) => (
                        <div key={i} className={LOG_TYPE_COLOR[log.type] || 'text-slate-500'}>
                          <span className="opacity-60">{format(new Date(log.timestamp), 'HH:mm:ss')}</span> [{log.type}] {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedReport.attachments?.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-slate-700 dark:text-slate-300">Attachments</Label>
                    <div className="space-y-1">
                      {selectedReport.attachments.map((att, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-4 h-4 shrink-0 text-slate-400" />
                            <span className="truncate">{att.filename}</span>
                            <span className="text-xs text-slate-400 shrink-0">{formatFileSize(att.size)}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleOpenAttachment(att)}>Open</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                  <Textarea
                    rows={4}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Internal notes for the program administrator..."
                  />
                  <Button size="sm" onClick={handleSaveNotes} disabled={savingField === 'notes'}>
                    {savingField === 'notes' ? 'Saving...' : 'Save Notes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
