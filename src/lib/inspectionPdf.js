import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

export const formatInspectionType = (type) => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getInspectionResultsObj = (project) => {
  if (!project?.inspection_results) return {};
  try {
    return typeof project.inspection_results === 'string'
      ? JSON.parse(project.inspection_results)
      : project.inspection_results;
  } catch (error) {
    return {};
  }
};

const getInspectionResult = (project, sectionName, itemName) => {
  const results = getInspectionResultsObj(project);
  const key = `${sectionName}-${itemName}`;
  return results[key] || null;
};

const getInspectionComments = (project) => {
  if (!project?.inspection_comments) return {};
  try {
    return typeof project.inspection_comments === 'string'
      ? JSON.parse(project.inspection_comments)
      : project.inspection_comments;
  } catch (error) {
    return {};
  }
};

export const generateInspectionPDF = (project, customer, vehicle, inspectionSections) => {
  if (!project) return;
  
  const doc = new jsPDF();
  let currentY = 20;

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  const inspType = project.inspection_type ? formatInspectionType(project.inspection_type) : 'Inspection';
  doc.text(`AutoPro - ${inspType} Results`, 14, currentY);
  
  currentY += 10;

  // Header Details
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  // Left Column
  const dateStr = project.created_date ? format(new Date(project.created_date), 'MMMM d, yyyy') : 'Unknown Date';
  doc.text(`Date: ${dateStr}`, 14, currentY);
  currentY += 6;
  
  const customerName = customer?.org_name && customer.org_name.trim() !== '' 
    ? customer.org_name 
    : (customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : (project.customer || 'Unknown Customer'));
  doc.text(`Customer: ${customerName}`, 14, currentY);
  currentY += 6;
  
  const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : (project.vehicle || 'Unknown Vehicle');
  doc.text(`Vehicle: ${vehicleStr}`, 14, currentY);
  currentY += 6;
  
  doc.text(`VIN: ${vehicle?.vin || project.vin || 'N/A'}`, 14, currentY);
  currentY += 6;
  
  doc.text(`Odometer: ${project.odometer_reading ? `${parseInt(project.odometer_reading).toLocaleString()} km` : 'N/A'}`, 14, currentY);
  currentY += 10;

  // Render each section
  const comments = getInspectionComments(project);
  const sortedSections = [...inspectionSections].sort((a, b) => a.display_order - b.display_order);
  
  sortedSections.forEach(section => {
    // Add section title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(section.section_name, 14, currentY);
    currentY += 5; // Slight spacing before table
    
    const tableBody = section.inspection_items.map(item => {
      const result = getInspectionResult(project, section.section_name, item);
      return [
        item,
        result === 'good' ? 'X' : '',
        result === 'fair' ? 'X' : '',
        result === 'poor' ? 'X' : '',
        result === 'n/a' ? 'X' : '',
      ];
    });

    doc.autoTable({
      startY: currentY,
      head: [['Item', 'Good', 'Fair', 'Poor', 'N/A']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
      },
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 5;
    
    // Add comments if any
    const sectionComment = comments[section.section_name];
    if (sectionComment) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      // Use splitTextToSize to wrap text
      const splitComments = doc.splitTextToSize(`Comments: ${sectionComment}`, 180);
      doc.text(splitComments, 14, currentY);
      currentY += (splitComments.length * 5) + 5;
    } else {
      currentY += 5;
    }
  });

  // Save the PDF
  const filename = `${inspType.replace(/\s+/g, '_')}_${vehicleStr.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
};
