
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  User, // 'User' icon is imported
  Phone, 
  Mail, 
  Edit3,
  Wrench,
  UserCheck,
  DollarSign
} from "lucide-react";

export default function EmployeeDirectory({ employees, loading, onEdit, onAdd }) {
  const getPositionIcon = (position) => {
    switch (position) {
      case 'technician':
      case 'apprentice':
        return <Wrench className="w-4 h-4" />;
      case 'manager':
      case 'service_advisor':
        return <UserCheck className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getPositionBadge = (position) => {
    const isTech = position === 'technician' || position === 'apprentice';
    return (
      <Badge className={`${
        isTech 
          ? 'bg-blue-100 text-blue-800 border-blue-200' 
          : 'bg-green-100 text-green-800 border-green-200'
      } border font-medium`}>
        {isTech ? 'TECH' : 'NON-TECH'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {/* Changed 'Users' to 'User' */}
              <User className="w-5 h-5" /> 
              Employee Directory
            </CardTitle>
            <p className="text-slate-600 text-sm mt-1">Manage shop staff and their information</p>
          </div>
          <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </CardHeader>
      </Card>

      {/* Employee Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 rounded"></div>
                    <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : employees.length > 0 ? (
          employees.map((employee) => (
            <Card key={employee.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Employee Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        {getPositionIcon(employee.position)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {employee.first_name} {employee.last_name}
                        </h3>
                        <p className="text-slate-600 font-medium capitalize">
                          {employee.position.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(employee)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Employee Details */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-sm">Employee ID:</span>
                      <span className="font-medium">{employee.employee_id}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-sm">Type:</span>
                      {getPositionBadge(employee.position)}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-sm flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Hourly Rate:
                      </span>
                      <span className="font-bold text-green-600">${employee.hourly_rate}/hr</span>
                    </div>

                    {employee.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-sm flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          Phone:
                        </span>
                        <span className="font-medium text-sm">{employee.phone}</span>
                      </div>
                    )}

                    {employee.email && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-sm flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          Email:
                        </span>
                        <span className="font-medium text-sm">{employee.email}</span>
                      </div>
                    )}

                    {employee.hire_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-sm">Hire Date:</span>
                        <span className="font-medium text-sm">
                          {new Date(employee.hire_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {employee.certifications && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs text-slate-500 mb-1">Certifications:</p>
                        <p className="text-xs text-slate-700">{employee.certifications}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full">
            <Card className="text-center py-12">
              <CardContent>
                <div className="text-slate-400 mb-4">
                  {/* Changed 'Users' to 'User' */}
                  <User className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Employees Found</h3>
                <p className="text-slate-600 mb-4">Add your first employee to get started.</p>
                <Button onClick={onAdd}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Employee
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
