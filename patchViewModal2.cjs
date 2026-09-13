const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROViewModal.jsx', 'utf8');

const regex = /<div>\s*<label[^>]*>Time Estimate<\/label>\s*<p>\{project\.time_estimate \? \`\$\{project\.time_estimate\} hours\` : 'Not set'\}<\/p>\s*<\/div>/;

const newOdometerAndTimeStr = `<div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Odometer</label>
                      <p>{project.odometer_reading ? \`\${parseInt(project.odometer_reading).toLocaleString()} km\` : 'Not recorded'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Time Logged</label>
                      <p>{techTimeTotal > 0 ? \`\${techTimeTotal.toFixed(1)} hours\` : 'None'}</p>
                    </div>`;

c = c.replace(regex, newOdometerAndTimeStr);

fs.writeFileSync('src/components/work-orders/WorkPROViewModal.jsx', c);
