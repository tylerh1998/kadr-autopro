import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import { OtherChargeList } from "@/entities/all";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import OtherChargeForm from "./OtherChargeForm";

export default function OtherChargesManager() {
  const [charges, setCharges] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const chargesData = await OtherChargeList.list('-created_date');
      setCharges(chargesData);
    } catch (error) {
      console.error("Failed to fetch other charges:", error);
    }
    try {
      const { data: accountsData, error } = await supabase.from('ChartOfAccount').select('*');
      if (error) throw error;
      setGlAccounts(accountsData || []);
    } catch (error) {
      console.error("Failed to fetch GL accounts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = () => {
    setEditingCharge(null);
    setIsFormOpen(true);
  };

  const handleEdit = (charge) => {
    setEditingCharge(charge);
    setIsFormOpen(true);
  };

  const handleSubmit = async (formData) => {
    try {
      if (editingCharge) {
        await OtherChargeList.update(editingCharge.id, formData);
      } else {
        await OtherChargeList.create(formData);
      }
      setIsFormOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Failed to save other charge:", error);
      alert("Failed to save other charge.");
    }
  };

  const handleDelete = async (chargeId) => {
    if (confirm("Are you sure you want to delete this predefined charge?")) {
      try {
        await OtherChargeList.delete(chargeId);
        fetchData();
      } catch (error) {
        console.error("Failed to delete charge:", error);
        alert("Could not delete charge. It may be in use.");
      }
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Manage Other Charges</CardTitle>
              <CardDescription>
                Define predefined charges for quick addition to work orders.
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" /> Add Charge
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Base Amount</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Taxable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.length > 0 ? (
                    charges.map((charge) => (
                      <TableRow key={charge.id}>
                        <TableCell className="font-medium">{charge.description}</TableCell>
                        <TableCell className="text-right">
                          ${(charge.base_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>{charge.gl_account}</TableCell>
                        <TableCell>
                          {charge.is_taxable ? (
                            <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={charge.is_active ? 'default' : 'secondary'}>
                            {charge.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(charge)}>
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(charge.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan="6" className="text-center h-24">
                        No predefined charges found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OtherChargeForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingCharge(null);
        }}
        onSubmit={handleSubmit}
        charge={editingCharge}
        glAccounts={glAccounts}
      />
    </>
  );
}