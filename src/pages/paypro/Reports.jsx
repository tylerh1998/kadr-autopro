import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Landmark, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PaychequesReport from "@/components/paypro/reports/PaychequesReport";
import RemittancesReport from "@/components/paypro/reports/RemittancesReport";

export default function Reports() {
  const navigate = useNavigate();

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Payroll Reports</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/paypro/Remittances')} className="flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" />
            <Landmark className="w-4 h-4 mr-1" />
            Remittances
          </Button>
          <Button variant="outline" onClick={() => navigate('/paypro/T4s')} className="flex items-center gap-1">
            <FileText className="w-4 h-4 mr-1" />
            T4s
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="paycheques" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              <TabsTrigger value="paycheques" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Paycheques</TabsTrigger>
              <TabsTrigger value="remittances" className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700">Remittances</TabsTrigger>
          </TabsList>
          <TabsContent value="paycheques">
              <PaychequesReport />
          </TabsContent>
          <TabsContent value="remittances">
              <RemittancesReport />
          </TabsContent>
      </Tabs>
    </div>
  );
}
