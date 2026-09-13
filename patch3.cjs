const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROModal.jsx', 'utf8');

c = c.replace(/\{\/\* Oil Change Details Section \*\/\}\s*\{isOilChangeProject && \(\s*<>\s*(<Card[\s\S]*?<\/Card>)\s*\{\/\* Inspection Results Table \*\/\}/, 
`{/* Oil Change Details Section */}
              {isOilChangeProject && (
                $1
              )}

              {/* Inspection Results Table */}`);

c = c.replace(/<\/Card>\s*\)\}\s*<\/>\s*\)\}/, 
`</Card>
                  )}`);

fs.writeFileSync('src/components/work-orders/WorkPROModal.jsx', c);
