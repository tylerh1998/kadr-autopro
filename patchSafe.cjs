const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Replace vertical lines
  const oldVert = `  // vert
  doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
  doc.line(115, currentY + 10, 115, currentY + 20); // City | Prov
  doc.line(145, currentY + 10, 145, currentY + 20); // Prov | Postal
  doc.line(135, currentY + 20, 135, currentY + 35); // Name | Cert / Date | Sig`;

  const newVert = `  // vert
  doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
  doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal
  doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone
  doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number
  doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature`;
  
  if (content.includes(oldVert)) {
    content = content.replace(oldVert, newVert);
  } else {
    console.log("Could not find oldVert");
  }

  // Replace Province/Territory
  const oldProv = `doc.text("Province/Territory", 96, currentY + 13);
  doc.setFontSize(10);
  doc.text("AB", 96, currentY + 18);
  doc.setFontSize(8);
  doc.text("Postal Code", 116, currentY + 13);
  doc.text("Telephone Number", 146, currentY + 13);`;
  
  const newProv = `doc.text("Province", 97, currentY + 13);
  doc.setFontSize(10);
  doc.text("AB", 97, currentY + 18);
  doc.setFontSize(8);
  doc.text("Postal Code", 127, currentY + 13);
  doc.text("Telephone Number", 162, currentY + 13);`;

  if (content.includes(oldProv)) {
    content = content.replace(oldProv, newProv);
  } else {
    console.log("Could not find oldProv");
  }

  // Replace signature text
  const oldSig = `doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);
  doc.text("Certified Automotive Technician's Signature", 136, currentY + 30);`;
  
  const newSig = `doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);
  doc.text("Certified Automotive Technician's Signature", 77, currentY + 30);`;

  if (content.includes(oldSig)) {
    content = content.replace(oldSig, newSig);
  } else {
    console.log("Could not find oldSig");
  }

  // Replace date str placement and hardcoded address offsets
  const oldHardcoded = `doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
    doc.text("5002 49 Ave - PO Box 160", 96, currentY + 8);
    doc.text("Dewberry", 15, currentY + 18);
    doc.text("T0B 1G0", 116, currentY + 18);
    doc.text("780-847-3002", 146, currentY + 18);
  const dateStr = project.created_date ? format(new Date(project.created_date), 'yyyy-MM-dd') : '';
  doc.text(dateStr, 136, currentY + 34);`;
  
  const newHardcoded = `doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
    doc.text("5002 49 Ave - PO Box 160", 96, currentY + 8);
    doc.text("Dewberry", 15, currentY + 18);
    doc.text("T0B 1G0", 127, currentY + 18);
    doc.text("780-847-3002", 162, currentY + 18);
  const dateStr = project.created_date ? format(new Date(project.created_date), 'yyyy-MM-dd') : '';
  doc.text(dateStr, 15, currentY + 34);`;

  if (content.includes(oldHardcoded)) {
    content = content.replace(oldHardcoded, newHardcoded);
  } else {
    console.log("Could not find oldHardcoded");
  }

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
