const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Fix vertical lines
  const oldVertBlock = `    // vert
    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    doc.line(115, currentY + 10, 115, currentY + 20); // City | Prov
    doc.line(145, currentY + 10, 145, currentY + 20); // Prov | Postal
    doc.line(135, currentY + 20, 135, currentY + 35); // Name | Cert / Date | Sig`;

  const newVertBlock = `    // vert
    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    // City ends at 95. Prov starts at 95.
    doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal
    doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone
    doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number
    doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature`;

  if (content.includes(oldVertBlock)) {
    content = content.replace(oldVertBlock, newVertBlock);
  }

  // Fix labels for Row 2
  content = content.replace(/doc\.text\("Province\/Territory", 96, currentY \+ 13\);/g, 'doc.text("Province", 97, currentY + 13);');
  content = content.replace(/doc\.text\("AB", 96, currentY \+ 18\);/g, 'doc.text("AB", 97, currentY + 18);');
  
  content = content.replace(/doc\.text\("Postal Code", 116, currentY \+ 13\);/g, 'doc.text("Postal Code", 127, currentY + 13);');
  content = content.replace(/doc\.text\("T0B 1G0", 116, currentY \+ 18\);/g, 'doc.text("T0B 1G0", 127, currentY + 18);');

  content = content.replace(/doc\.text\("Telephone Number", 146, currentY \+ 13\);/g, 'doc.text("Telephone Number", 162, currentY + 13);');
  content = content.replace(/doc\.text\("780-847-3002", 146, currentY \+ 18\);/g, 'doc.text("780-847-3002", 162, currentY + 18);');

  // Fix Date / Signature layout
  const oldDateLabels = `doc.text("Certified Automotive Technician's Signature", 15, currentY + 30);\n    doc.text("Date (yyyy-mm-dd)", 136, currentY + 30);`;
  const newDateLabels = `doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);\n    doc.text("Certified Automotive Technician's Signature", 77, currentY + 30);`;
  content = content.replace(oldDateLabels, newDateLabels);

  const oldDateVal = `doc.text(dateStr, 136, currentY + 34);`;
  const newDateVal = `doc.text(dateStr, 15, currentY + 34);`;
  content = content.replace(oldDateVal, newDateVal);

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
