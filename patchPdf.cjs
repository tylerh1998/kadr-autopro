const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // 1. Fix row heights to prevent overlap
  content = content.replace(/currentY \+= 6;/g, 'currentY += 4.5;');
  content = content.replace(/currentY \+= 5\.5;/g, 'currentY += 4.2;');
  content = content.replace(/doc\.text\(sec\.name, 37, currentY \+ 4,/g, "doc.text(sec.name, 37, currentY + 3,");
  content = content.replace(/doc\.text\("Roadworthy", 70, currentY \+ 4,/g, "doc.text(\"Roadworthy\", 70, currentY + 3,");
  content = content.replace(/doc\.text\("Reject", 87\.5, currentY \+ 4,/g, "doc.text(\"Reject\", 87.5, currentY + 3,");
  content = content.replace(/doc\.text\("Comments", 97, currentY \+ 4\);/g, "doc.text(\"Comments\", 97, currentY + 3);");
  content = content.replace(/doc\.text\(item, 15, currentY \+ 3\);/g, "doc.text(item, 15, currentY + 2.5);");
  content = content.replace(/doc\.rect\(68, currentY, 4, 4\);/g, "doc.rect(68, currentY - 0.5, 3.5, 3.5);");
  content = content.replace(/doc\.rect\(85, currentY, 4, 4\);/g, "doc.rect(85, currentY - 0.5, 3.5, 3.5);");
  content = content.replace(/doc\.text\("X", 69, currentY \+ 3\);/g, "doc.text(\"X\", 69, currentY + 2.2);");
  content = content.replace(/doc\.text\("X", 86, currentY \+ 3\);/g, "doc.text(\"X\", 86, currentY + 2.2);");

  // Fix outer grid lines to accommodate the questions if we want them inside or outside
  // They were originally doc.line(40, 82, 40, 207) etc.
  // Actually, keeping the grid the same is fine since the row height is reduced.

  // 2. Fix the signature block layout & date positioning
  // Original labels:
  // doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);
  // doc.text("Certified Automotive Technician's Signature", 136, currentY + 30);
  const oldDateLabels = `doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);\n    doc.text("Certified Automotive Technician's Signature", 136, currentY + 30);`;
  const newDateLabels = `doc.text("Certified Automotive Technician's Signature", 15, currentY + 30);\n    doc.text("Date (yyyy-mm-dd)", 136, currentY + 30);`;
  content = content.replace(oldDateLabels, newDateLabels);

  // Original date text injection:
  // const dateStr = project.created_date ? format(new Date(project.created_date), 'yyyy-MM-dd') : '';
  // doc.text(dateStr, 15, currentY + 34);
  const oldDateVal = `doc.text(dateStr, 15, currentY + 34);`;
  const newDateVal = `doc.text(dateStr, 136, currentY + 34);`;
  content = content.replace(oldDateVal, newDateVal);

  // 3. Add Business Address
  // Original shop name injection:
  // doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
  const oldShop = `doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);`;
  const newShop = `doc.text("Ken's Auto & Diesel Repair", 15, currentY + 8);
    doc.text("5002 49 Ave - PO Box 160", 96, currentY + 8);
    doc.text("Dewberry", 15, currentY + 18);
    doc.text("T0B 1G0", 116, currentY + 18);
    doc.text("780-847-3002", 146, currentY + 18);`;
  content = content.replace(oldShop, newShop);

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
