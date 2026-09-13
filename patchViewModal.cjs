const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROViewModal.jsx', 'utf8');

// 1. Add Droplet to lucide-react imports if missing
if (!c.includes('Droplet,')) {
  c = c.replace(/AlertTriangle,/g, 'AlertTriangle,\n  Droplet,');
}

// 2. Add techTimeTotal state
if (!c.includes('techTimeTotal')) {
  c = c.replace(
    'const [loading, setLoading] = useState(false);',
    'const [loading, setLoading] = useState(false);\n  const [techTimeTotal, setTechTimeTotal] = useState(0);'
  );
}

// 3. Add fetching for tech time
if (!c.includes("from('ProjectTimeSession')")) {
  c = c.replace(
    'setProject(foundProject);',
    `setProject(foundProject);\n\n      if (foundProject) {\n        const { data: sessions } = await supabase\n          .from('ProjectTimeSession')\n          .select('total_hours')\n          .eq('project_id', foundProject.id);\n        if (sessions) {\n          const total = sessions.reduce((sum, session) => sum + (parseFloat(session.total_hours) || 0), 0);\n          setTechTimeTotal(total);\n        }\n      }`
  );
}

// 4. Update the "Time Estimate" in Project Overview to "Odometer" + Add "Time Logged"
const oldTimeEstimateStr = `                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Time Estimate</label>
                      <p>{project.time_estimate ? \`\${project.time_estimate} hours\` : 'Not set'}</p>
                    </div>`;
                    
const newOdometerAndTimeStr = `                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Odometer</label>
                      <p>{project.odometer_reading ? \`\${parseInt(project.odometer_reading).toLocaleString()} km\` : 'Not recorded'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Time Logged</label>
                      <p>{techTimeTotal > 0 ? \`\${techTimeTotal.toFixed(1)} hours\` : 'None'}</p>
                    </div>`;
                    
c = c.replace(oldTimeEstimateStr, newOdometerAndTimeStr);

// 5. Add Oil Change Details card just before Tech Time
const techTimeCardRegex = /\{\/\* Tech Time \*\/\}/;

const oilChangeCardStr = `              {/* Oil Change Details */}
              {project.project_type === 'oil_change' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      Oil Change Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500">Filter</label>
                        <p className="font-medium">{project.filter || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Oil Type</label>
                        <p className="font-medium capitalize">{project.oil_type || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Oil (Viscosity)</label>
                        <p className="font-medium capitalize">{project.oil || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Qty (Liters)</label>
                        <p className="font-medium">{project.oil_qty || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Air Filter</label>
                        <p className="font-medium capitalize">{project.air || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Cabin Filter</label>
                        <p className="font-medium capitalize">{project.cabin || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Windshield Wash</label>
                        <p className="font-medium capitalize">{project.wind_wash || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Tire Rotation</label>
                        <p className="font-medium capitalize">{project.tire_rotation || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">TPMS Reset</label>
                        <p className="font-medium capitalize">{project.tpms_reset || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Reset Oil Light</label>
                        <p className="font-medium capitalize">{project.reset_oil_light || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Next Oil Change</label>
                        <p className="font-medium text-blue-600">{project.next_oil_change_odometer ? \`\${parseInt(project.next_oil_change_odometer).toLocaleString()} km\` : 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tech Time */}`;

c = c.replace(techTimeCardRegex, oilChangeCardStr);

// Also remove the old Tech Time card since we moved time logged into the overview block, or just leave it for time_estimate.
// The user said "rather have that than time estimate" so I'll just remove the whole Tech Time block.
c = c.replace(/\{\/\* Tech Time \*\/\}\s*\{project\.time_estimate && \(\s*<Card>[\s\S]*?<\/Card>\s*\)\}/, '');

fs.writeFileSync('src/components/work-orders/WorkPROViewModal.jsx', c);
