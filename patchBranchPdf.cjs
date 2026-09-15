const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  if (!content.includes('generateAlbertaInsurancePDF')) {
    content = content.replace(
      "import autoTable from 'jspdf-autotable';",
      "import autoTable from 'jspdf-autotable';\nimport { generateAlbertaInsurancePDF } from './albertaPdfGenerator';"
    );

    const oldGenerateStart = `export const generateInspectionPDF = (project, customer, vehicle, inspectionSections) => {
  console.log("generateInspectionPDF called", { project, customer, vehicle, inspectionSections });
  if (!project) {
    console.warn("No project provided to generateInspectionPDF");
    return;
  }`;

    const newGenerateStart = `export const generateInspectionPDF = (project, customer, vehicle, inspectionSections) => {
  console.log("generateInspectionPDF called", { project, customer, vehicle, inspectionSections });
  if (!project) {
    console.warn("No project provided to generateInspectionPDF");
    return;
  }
  
  if (project.inspection_type === 'alberta_insurance') {
    return generateAlbertaInsurancePDF(project, customer, vehicle, inspectionSections);
  }`;

    content = content.replace(oldGenerateStart, newGenerateStart);
    fs.writeFileSync(filepath, content, 'utf8');
  }
}

patchFile('./src/lib/inspectionPdf.js');
