import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export const generateAlbertaInsurancePDF = (project, customer, vehicle, inspectionSections) => {
  const doc = new jsPDF();
  
  // Helper to parse inspection results/comments
  const getInspectionResultsObj = (proj) => {
    if (!proj?.inspection_results) return {};
    try {
      return typeof proj.inspection_results === 'string' ? JSON.parse(proj.inspection_results) : proj.inspection_results;
    } catch (e) { return {}; }
  };
  
  const getInspectionComments = (proj) => {
    if (!proj?.inspection_comments) return {};
    try {
      return typeof proj.inspection_comments === 'string' ? JSON.parse(proj.inspection_comments) : proj.inspection_comments;
    } catch (e) { return {}; }
  };

  const results = getInspectionResultsObj(project);
  const comments = getInspectionComments(project);

  const getResult = (section, item) => results[`${section}-${item}`] || null;

  // Header
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(24);
  doc.text("Alberta", 14, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Automobile Insurance Motor Vehicle", 196, 16, { align: 'right' });
  doc.text("Inspection Report", 196, 22, { align: 'right' });

  // Red text
  doc.setTextColor(255, 0, 0);
  doc.setFontSize(10);
  doc.text("This report is for insurance underwriting purposes only.", 105, 30, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Boxed approved text
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.rect(14, 32, 182, 6);
  doc.text("The Alberta Superintendent of Insurance has approved this form pursuant to section 803 of the Insurance Act.", 105, 36.5, { align: 'center' });

  doc.text("This report is required only if the vehicle is 12 years or older and must be completed by a Certified Automotive Technician.", 14, 43);

  // Vehicle Info Table
  doc.rect(14, 45, 182, 30);
  // horizontal lines
  doc.line(14, 55, 196, 55);
  doc.line(14, 65, 196, 65);
  // vert
    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal
    doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone
    doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number
    doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature

  // Labels
  doc.setFontSize(8);
  doc.text("Name of Automobile Repair Shop", 15, currentY + 3);
  doc.text("Address", 96, currentY + 3);
  
  doc.text("City", 15, currentY + 13);
  doc.text("Province", 97, currentY + 13);
  doc.setFontSize(10);
  doc.text("AB", 97, currentY + 18);
  doc.setFontSize(8);
  doc.text("Postal Code", 127, currentY + 13);
  doc.text("Telephone Number", 162, currentY + 13);

  doc.text("Certified Automotive Technician's Name", 15, currentY + 23);
  doc.text("Certified Automotive Technician's Certificate Number", 136, currentY + 23);

  doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);
  doc.text("Certified Automotive Technician's Signature", 77, currentY + 30);

  // Inject Shop Data (Hardcoded based on user request)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
    doc.text("5002 49 Ave - PO Box 160", 96, currentY + 8);
    doc.text("Dewberry", 15, currentY + 18);
    doc.text("T0B 1G0", 127, currentY + 18);
    doc.text("780-847-3002", 162, currentY + 18);
  const dateStr = project.created_date ? format(new Date(project.created_date), 'yyyy-MM-dd') : '';
  doc.text(dateStr, 15, currentY + 34);

  // Footer text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("FSRP11463 Rev. 2018-07", 14, 285);

  const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : (project.vehicle || 'Unknown Vehicle');
  const filename = `Alberta_Insurance_${vehicleStr.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
};
