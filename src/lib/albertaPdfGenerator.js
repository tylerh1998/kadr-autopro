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
  // vertical lines
  doc.line(105, 45, 105, 55); // owner | company
  doc.line(140, 55, 140, 65); // broker | policy
  doc.line(50, 65, 50, 75); // year | make
  doc.line(105, 65, 105, 75); // make | model
  doc.line(140, 65, 140, 75); // model | VIN

  // Info labels
  doc.setFontSize(8);
  doc.text("Vehicle Owner's Name", 15, 48);
  doc.text("Insurance Company", 106, 48);
  doc.text("Insurance Broker", 15, 58);
  doc.text("Policy Number", 141, 58);
  doc.text("Vehicle Year", 15, 68);
  doc.text("Make", 51, 68);
  doc.text("Model", 106, 68);
  doc.text("VIN", 141, 68);

  // Fill Info
  const customerName = customer?.org_name && customer.org_name.trim() !== '' 
      ? customer.org_name 
      : (customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : (project.customer || ''));
  
  doc.setFont("helvetica", "bold");
  doc.text(customerName, 15, 53);
  doc.text(vehicle?.year?.toString() || project.vehicle?.split(' ')[0] || '', 15, 73);
  doc.text(vehicle?.make || project.vehicle?.split(' ')[1] || '', 51, 73);
  doc.text(vehicle?.model || project.vehicle?.split(' ').slice(2).join(' ') || '', 106, 73);
  doc.text(vehicle?.vin || project.vin || '', 141, 73);

  doc.setFont("helvetica", "normal");
  doc.text("This section is to be completed by a Certified Automotive Technician.", 14, 80);

  // Main Inspection Table
  doc.rect(14, 82, 182, 125);
  // columns
  doc.line(60, 82, 60, 207); // after section
  doc.line(80, 82, 80, 207); // after roadworthy
  doc.line(95, 82, 95, 207); // after reject

  let currentY = 82;
  const sections = [
    { name: "Steering", items: ["Steering Box/Rack", "Struts/Shocks", "Front Suspension", "Tie Rod Ends"] },
    { name: "Electrical System", items: ["Head Lamp/Tail Lamps", "Stop Lamps", "Signal Lamps", "Windshield Wipers"] },
    { name: "Tires", items: ["Front", "Rear"] },
    { name: "Brakes", items: ["Front Lining or Drums", "Rear Lining or Drums", "Park", "Brake Hoses", "Brake Lines"] },
    { name: "General Conditions", items: ["Body Condition", "Muffler/Exhaust", "Motor", "Windshield", "Seat Belts"] }
  ];

  sections.forEach((sec, sIdx) => {
    // Header for section
    doc.setFont("helvetica", "bold");
    doc.text(sec.name, 37, currentY + 4, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("Roadworthy", 70, currentY + 4, { align: 'center' });
    doc.text("Reject", 87.5, currentY + 4, { align: 'center' });
    doc.text("Comments", 97, currentY + 4);

    // Section comments
    const secComment = comments[sec.name] || '';
    if (secComment) {
      doc.text(doc.splitTextToSize(secComment, 95), 97, currentY + 9);
    }

    currentY += 6;
    sec.items.forEach((item, idx) => {
      doc.text(item, 15, currentY + 3);
      
      // Draw checkboxes
      doc.rect(68, currentY, 4, 4);
      doc.rect(85, currentY, 4, 4);
      
      const res = getResult(sec.name, item);
      if (res === 'roadworthy') {
        doc.text("X", 69, currentY + 3);
      } else if (res === 'reject') {
        doc.text("X", 86, currentY + 3);
      }

      currentY += 5.5;
    });

    if (sIdx < sections.length - 1) {
      doc.line(14, currentY, 196, currentY);
    }
  });

  // Footer questions
  currentY = 212;
  doc.text("Is this vehicle roadworthy?", 14, currentY);
  doc.rect(58, currentY - 3, 4, 4);
  doc.text("Yes", 63, currentY);
  doc.rect(73, currentY - 3, 4, 4);
  doc.text("No", 78, currentY);

  doc.text("Has the vehicle been altered for speed or performance?", 95, currentY);
  doc.rect(175, currentY - 3, 4, 4);
  doc.text("Yes", 180, currentY);
  doc.rect(190, currentY - 3, 4, 4);
  doc.text("No", 195, currentY);

  // Mark footer questions if data exists
  const roadworthyRes = getResult('Summary', 'Roadworthy');
  if (roadworthyRes === 'yes') doc.text("X", 59, currentY);
  else if (roadworthyRes === 'no') doc.text("X", 74, currentY);
  
  const alteredRes = getResult('Summary', 'Altered');
  if (alteredRes === 'yes') doc.text("X", 176, currentY);
  else if (alteredRes === 'no') doc.text("X", 191, currentY);

  currentY += 8;
  doc.text("Other Comments", 14, currentY);
  const otherComments = comments['Summary'] || '';
  if (otherComments) {
    doc.text(doc.splitTextToSize(otherComments, 180), 14, currentY + 5);
  }

  currentY = 235;
  doc.text("Certified Automotive Technician Statement:", 14, currentY);
  currentY += 5;
  doc.rect(14, currentY - 3, 4, 4);
  doc.text("I certify that I have inspected and tested the motor vehicle described above and found it to be in the condition stated above.", 20, currentY);

  // Shop Box
  currentY += 4;
  doc.rect(14, currentY, 182, 35);
  // horiz
  doc.line(14, currentY + 10, 196, currentY + 10);
  doc.line(14, currentY + 20, 196, currentY + 20);
  doc.line(14, currentY + 27, 196, currentY + 27);
  // vert
  doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
  doc.line(115, currentY + 10, 115, currentY + 20); // City | Prov
  doc.line(145, currentY + 10, 145, currentY + 20); // Prov | Postal
  doc.line(135, currentY + 20, 135, currentY + 35); // Name | Cert / Date | Sig

  // Labels
  doc.setFontSize(8);
  doc.text("Name of Automobile Repair Shop", 15, currentY + 3);
  doc.text("Address", 96, currentY + 3);
  
  doc.text("City", 15, currentY + 13);
  doc.text("Province/Territory", 96, currentY + 13);
  doc.setFontSize(10);
  doc.text("AB", 96, currentY + 18);
  doc.setFontSize(8);
  doc.text("Postal Code", 116, currentY + 13);
  doc.text("Telephone Number", 146, currentY + 13);

  doc.text("Certified Automotive Technician's Name", 15, currentY + 23);
  doc.text("Certified Automotive Technician's Certificate Number", 136, currentY + 23);

  doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);
  doc.text("Certified Automotive Technician's Signature", 136, currentY + 30);

  // Inject Shop Data (Hardcoded based on user request)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
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
