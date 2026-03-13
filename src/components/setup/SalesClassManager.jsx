import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, DollarSign } from "lucide-react";
import { SalesClass } from "@/entities/SalesClass";
import { base44 } from "@/api/base44Client";
import PricingMatrixModal from "./PricingMatrixModal";

export default function SalesClassManager() {
  const [salesClasses, setSalesClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSalesClass, setEditingSalesClass] = useState(null);

  useEffect(() => {
    loadSalesClasses();
  }, []);

  const loadSalesClasses = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('SupabaseProxy', {});
      const data = response.data?.data || [];
      setSalesClasses(data);
    } catch (error) {
      console.error('Error loading sales classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (salesClass) => {
    setEditingSalesClass(salesClass);
    setShowModal(true);
  };

  const handleSubmit = async (salesClassData) => {
    try {
      if (editingSalesClass) {
        await SalesClass.update(editingSalesClass.id, salesClassData);
      } else {
        await SalesClass.create(salesClassData);
      }
      
      setShowModal(false);
      setEditingSalesClass(null);
      loadSalesClasses();
    } catch (error) {
      console.error('Error saving sales class:', error);
      alert('Failed to save sales class.');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this sales class?')) {
      try {
        await SalesClass.delete(id);
        loadSalesClasses();
      } catch (error) {
        console.error('Error deleting sales class:', error);
        alert('Failed to delete sales class.');
      }
    }
  };

  const filteredSalesClasses = salesClasses.filter(sc =>
    !searchTerm || sc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRangeCount = (pricingMatrix) => {
    if (!pricingMatrix) return 0;
    try {
      let tempParsed = JSON.parse(pricingMatrix);
      if (typeof tempParsed === 'string') {
        tempParsed = JSON.parse(tempParsed);
      }
      return Array.isArray(tempParsed) ? tempParsed.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sales Classes</h2>
            <p className="text-slate-600 mt-1">Manage pricing classes and profit margins</p>
          </div>
          <Button
            onClick={() => {
              setEditingSalesClass(null);
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Sales Class
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search sales classes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Sales Classes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-3">
                  <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))
          ) : filteredSalesClasses.length > 0 ? (
            filteredSalesClasses.map((salesClass) => (
              <Card key={salesClass.id} className="hover:shadow-lg transition-shadow duration-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{salesClass.name}</h3>
                        <p className="text-sm text-slate-600">{salesClass.description || 'No description'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={salesClass.is_active ? "default" : "secondary"}>
                        {salesClass.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Pricing Ranges:</span>
                      <Badge variant="outline">{getRangeCount(salesClass.pricing_matrix)} ranges</Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(salesClass)}
                      className="flex-1"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit Matrix
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(salesClass.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full">
              <Card className="text-center py-12">
                <CardContent>
                  <DollarSign className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Sales Classes Found</h3>
                  <p className="text-slate-600 mb-4">
                    {searchTerm ? 'No sales classes match your search.' : 'Create your first sales class to get started.'}
                  </p>
                  <Button onClick={() => {
                    setEditingSalesClass(null);
                    setShowModal(true);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sales Class
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Matrix Modal */}
      {showModal && (
        <PricingMatrixModal
          salesClass={editingSalesClass}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowModal(false);
            setEditingSalesClass(null);
          }}
        />
      )}
    </>
  );
}