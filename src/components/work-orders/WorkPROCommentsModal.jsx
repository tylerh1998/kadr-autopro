import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, AlertCircle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Employee } from '@/entities/all';
import { base44 } from '@/api/base44Client';

export default function WorkPROCommentsModal({ open, onClose, workOrder, project, comments, onUpdate }) {
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const allEmployees = await Employee.list();
        setEmployees(allEmployees);
      } catch (error) {
        console.error('Error loading employees:', error);
      }
    };
    loadEmployees();
  }, []);

  const getEmployeeName = (employeeId) => {
    if (!employeeId || typeof employeeId !== 'string') return 'Unknown User';
    
    // If it looks like an employee ID (24 chars), try to resolve it
    if (employeeId.length === 24) {
      const employee = employees.find(emp => emp.id === employeeId);
      return employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown User (ID not found)';
    }
    
    // Otherwise return the string as-is (like "AutoShop User")
    return employeeId;
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !project) {
      if (!project) {
        alert('Please create a task first before adding comments');
        onClose();
      }
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('workProProxy', {
        entityName: 'ProjectComment',
        method: 'create',
        params: {
          project_id: project.id,
          comment: newComment,
          user: 'AutoShop User'
        }
      });

      if (!response.data.success) throw new Error(response.data.error || 'Failed to add comment');

      // Refresh comments list
      const commentsResponse = await base44.functions.invoke('workProProxy', {
        entityName: 'ProjectComment',
        method: 'filter',
        params: {
          project_id: project.id
        }
      });
      
      if (commentsResponse.data.success) {
        const commentsArray = commentsResponse.data.data || [];
        const sortedComments = commentsArray.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        onUpdate(sortedComments);
      }

      setNewComment('');
      alert('Comment added successfully');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            WorkPRO Comments
            {project ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Not Connected</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!project && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800/50">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                This work order is not connected to WorkPRO. Please create a task first to establish the connection.
              </p>
            </div>
          )}

          {project && (
            <>
              {/* Existing Comments */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Comments History</h4>
                <ScrollArea className="h-64 border dark:border-slate-800 rounded-lg p-4">
                  {comments.length > 0 ? (
                    <div className="space-y-4">
                      {comments.map((comment) => (
                        <div key={comment.id} className="border-b border-slate-200 dark:border-slate-800 pb-3 last:border-b-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm text-blue-600 dark:text-blue-400">
                              {getEmployeeName(comment.created_by || comment.user)}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {format(new Date(comment.created_date), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                      <Plus className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
                      <p>No comments yet. Add the first comment below.</p>
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Add New Comment */}
              <div className="space-y-3 border-t dark:border-slate-800 pt-4">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Add New Comment</h4>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment about this project..."
                  className="h-24 resize-none"
                />
              </div>
            </>
          )}

          {project && (
            <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
              <p><strong>Task:</strong> {project.name || 'No task name'}</p>
              <p><strong>Status:</strong> {project.status}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          {project && (
            <Button onClick={handleAddComment} disabled={!newComment.trim() || loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Add Comment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}