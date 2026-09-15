const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Add imports if they don't exist
  if (!content.includes('generateInspectionPDF')) {
    if (content.includes('import { Camera, Expand} from \'lucide-react\';')) {
      content = content.replace(
        'import { Camera, Expand} from \'lucide-react\';',
        'import { Camera, Expand, Printer } from \'lucide-react\';\nimport { generateInspectionPDF, formatInspectionType } from "@/lib/inspectionPdf";'
      );
    } else {
        // Just inject it after lucid-react import
        content = content.replace(
            /(import \{[^}]*\} from 'lucide-react';)/,
            "$1\nimport { Printer } from 'lucide-react';\nimport { generateInspectionPDF, formatInspectionType } from '@/lib/inspectionPdf';"
        );
    }
  }

  // WorkPROViewModal.jsx header:
  const viewHeaderTarget = '<h3 className="text-sm font-semibold text-slate-900 mb-3 dark:text-slate-100">Inspection Results</h3>';
  
  if (content.includes(viewHeaderTarget)) {
    const replacement = `
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Inspection Results {project?.inspection_type ? \`- \${formatInspectionType(project.inspection_type)}\` : ''}
        </h3>
        <Button 
          onClick={() => {
            const cust = null;
            const veh = null;
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
    content = content.replace(viewHeaderTarget, replacement);
    console.log("Patched header in", filepath);
  } else {
    // Check if it already was patched
    if (!content.includes('generateInspectionPDF(project')) {
      console.log("Could not find the headerTarget in", filepath);
    }
  }
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log("Patched", filepath);
}

patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
