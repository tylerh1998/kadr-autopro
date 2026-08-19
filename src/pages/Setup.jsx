import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";

import TechDirectory from "../components/setup/TechDirectory";
import SalesClassManager from "../components/setup/SalesClassManager";
import TagAlongManager from "../components/setup/TagAlongManager";
import OtherChargesManager from "../components/setup/OtherChargesManager";
import WIPSettings from "../components/setup/WIPSettings";

export default function SetupPage() {
  const { employee } = useAuth();
  const [activeTab, setActiveTab] = useState("sales");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(employee);
  }, [employee]);

  const isLvl3User = currentUser?.autopro_access_lvl === 'lvl3_user';

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Setup</h1>
            <p className="text-slate-600 mt-1 dark:text-slate-400">Configure your shop settings and manage users</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => window.open('https://drive.google.com/uc?export=download&id=1-APT_Tt8xlAxBChlmvU1KftO5h83ViKP', '_blank')}
              variant="outline"
              className="bg-white dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isLvl3User ? 'grid-cols-5' : 'grid-cols-4'} bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800`}>
            {isLvl3User && (
              <TabsTrigger
                value="tech"
                className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700"
              >
                Tech Setup
              </TabsTrigger>
            )}
            <TabsTrigger
              value="sales"
              className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700"
            >
              Sales Classes
            </TabsTrigger>
            <TabsTrigger
              value="tagalongs"
              className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700"
            >
              Tagalongs
            </TabsTrigger>
            <TabsTrigger
              value="other_charges"
              className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700"
            >
              Other Charges
            </TabsTrigger>
            <TabsTrigger
              value="general"
              className="text-slate-700 dark:text-slate-300 data-[state=inactive]:hover:bg-slate-50 dark:data-[state=inactive]:hover:bg-slate-800 data-[state=active]:bg-blue-800 data-[state=active]:text-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-blue-700"
            >
              General
            </TabsTrigger>
          </TabsList>

          {isLvl3User && (
            <TabsContent value="tech">
              <TechDirectory />
            </TabsContent>
          )}

          <TabsContent value="sales">
            <SalesClassManager />
          </TabsContent>

          <TabsContent value="tagalongs">
            <TagAlongManager />
          </TabsContent>

          <TabsContent value="other_charges">
            <OtherChargesManager />
          </TabsContent>

          <TabsContent value="general">
            <WIPSettings currentUser={currentUser} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}