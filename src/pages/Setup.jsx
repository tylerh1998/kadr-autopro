import React, { useState, useEffect } from "react";
import { Employee, User } from "@/entities/Employee";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Users, Settings, Wrench, DollarSign, Save, FileText, Upload, Download } from "lucide-react";
import { createPageUrl } from "@/utils";

import TechDirectory from "../components/setup/TechDirectory";
import TechForm from "../components/setup/TechForm";
import SalesClassManager from "../components/setup/SalesClassManager";
import TagAlongManager from "../components/setup/TagAlongManager";
import OtherChargesManager from "../components/setup/OtherChargesManager";
import WIPSettings from "../components/setup/WIPSettings";

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState("sales");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const isLvl3User = currentUser?.access_level === 'lvl3_user';

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Setup</h1>
            <p className="text-slate-600 mt-1">Configure your shop settings and manage users</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => window.open('https://drive.google.com/uc?export=download&id=1-APT_Tt8xlAxBChlmvU1KftO5h83ViKP', '_blank')}
              variant="outline"
              className="bg-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <Button 
              onClick={() => window.location.href = createPageUrl('BatchUploader')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Batch Uploader
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${isLvl3User ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {isLvl3User && (
              <TabsTrigger value="tech">Tech Setup</TabsTrigger>
            )}
            <TabsTrigger value="sales">Sales Classes</TabsTrigger>
            <TabsTrigger value="tagalongs">Tagalongs</TabsTrigger>
            <TabsTrigger value="other_charges">Other Charges</TabsTrigger>
            <TabsTrigger value="wip">WIP</TabsTrigger>
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

          <TabsContent value="wip">
            <WIPSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}