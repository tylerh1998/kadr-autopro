const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Change headers grid-cols-[3fr,1fr,1fr,1fr] to [3fr,1fr,1fr] and remove empty div
  content = content.replace(
    'inspectionType === \'alberta_insurance\' ? "grid grid-cols-[3fr,1fr,1fr,1fr]',
    'inspectionType === \'alberta_insurance\' ? "grid grid-cols-[3fr,1fr,1fr]'
  );
  content = content.replace(
    'inspectionType === \'alberta_insurance\' ? "grid grid-cols-[3fr,1fr,1fr,1fr]',
    'inspectionType === \'alberta_insurance\' ? "grid grid-cols-[3fr,1fr,1fr]'
  );
  
  // Remove empty divs
  content = content.replace('<div className="text-center py-1"></div>', '');
  content = content.replace('<div className="text-center py-1"></div>', '');

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/InspectionGrid.jsx');
