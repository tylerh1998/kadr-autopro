import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Briefcase, Calendar, Repeat, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

export default function EmployeeList({ employees, loading, onEdit }) {
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="border-0 shadow-sm dark:bg-slate-900">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <Card className="border-0 shadow-sm dark:bg-slate-900">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No employees found</h3>
          <p className="text-slate-600 dark:text-slate-400">Get started by adding your first employee</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {employees.map((employee) => (
        <Card
          key={employee.id}
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer dark:bg-slate-900 dark:hover:bg-slate-800/70"
          onClick={() => onEdit(employee)}
        >
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
                    {employee.first_name} {employee.last_name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{employee.position || 'No position set'}</p>
                </div>
                <Badge
                  variant={employee.status === 'active' ? 'default' : 'secondary'}
                  className={
                    employee.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                  }
                >
                  {employee.status}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2 pt-2 border-t dark:border-slate-800">
                {employee.email && (
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 group">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{employee.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(employee.email);
                        toast({ description: "Email copied to clipboard" });
                      }}
                      title="Copy email"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {employee.employee_type && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <span>{employee.employee_type}</span>
                  </div>
                )}

                {employee.pay_frequency && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 capitalize">
                    <Repeat className="w-4 h-4 text-slate-400" />
                    <span>{employee.pay_frequency.replace('_', '-')}</span>
                  </div>
                )}

                {employee.start_date && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>Started: {new Date(employee.start_date + 'T00:00:00').toLocaleDateString('en-CA')}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
