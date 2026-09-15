const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // 1. Add imports
  if (!content.includes('generateInspectionPDF')) {
    content = content.replace(
      'import { Camera, Upload, Expand } from "lucide-react";',
      'import { Camera, Upload, Expand, Printer } from "lucide-react";\nimport { generateInspectionPDF, formatInspectionType } from "@/lib/inspectionPdf";'
    );
  }

  // 2. Add Print button for WorkPROModal.jsx and WorkPROViewModal.jsx
  // Locate the header for Inspection Results
  const headerTarget = '<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Inspection Results</h3>';
  
  if (content.includes(headerTarget)) {
    const replacement = `
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Inspection Results {project?.inspection_type ? \`- \${formatInspectionType(project.inspection_type)}\` : ''}
        </h3>
        <Button 
          onClick={() => {
            // Need customer and vehicle. In WorkPROModal it's localCustomer/localVehicle or passed in. 
            // We can just pass the props available.
            const cust = typeof localCustomer !== 'undefined' ? (localCustomer || customer) : (typeof customer !== 'undefined' ? customer : null);
            const veh = typeof localVehicle !== 'undefined' ? (localVehicle || (vehicles ? vehicles.find(v => v.id === workOrder?.vehicle_id) : null)) : null;
            generateInspectionPDF(project, cust, veh, dynamicInspectionSections);
          }} 
          size="sm" 
          variant="outline"
          className="bg-white"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
      </div>
    `;
    content = content.replace(headerTarget, replacement);
  } else {
    console.log("Could not find the headerTarget in", filepath);
  }
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log("Patched", filepath);
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
