import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PaychequesReport from "@/components/paypro/reports/PaychequesReport";
import RemittancesReport from "@/components/paypro/reports/RemittancesReport";

export default function Reports() {
  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Payroll Reports</h1>
          <p className="text-slate-600 dark:text-slate-400">Analyze and export payroll data.</p>
      </div>

      <Tabs defaultValue="paycheques" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="paycheques">Paycheques</TabsTrigger>
              <TabsTrigger value="remittances">Remittances</TabsTrigger>
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
