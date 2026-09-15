const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Fix "Province/Territory" text overlapping with "Postal Code"
  // Let's just abbreviate it to "Province" or change the widths.
  // We'll change the x-positions of the vertical lines for Row 2.
  // Old lines:
  // doc.line(115, currentY + 10, 115, currentY + 20); // City | Prov
  // doc.line(145, currentY + 10, 145, currentY + 20); // Prov | Postal
  content = content.replace(/doc\.line\(115, currentY \+ 10, 115, currentY \+ 20\);/g, 'doc.line(100, currentY + 10, 100, currentY + 20);');
  content = content.replace(/doc\.line\(145, currentY \+ 10, 145, currentY \+ 20\);/g, 'doc.line(130, currentY + 10, 130, currentY + 20);');

  // And fix the labels/data x-positions for Row 2:
  // Prov text was at 96. Let's make it Prov text at 102.
  content = content.replace(/doc\.text\("Province\/Territory", 96, currentY \+ 13\);/g, 'doc.text("Province", 102, currentY + 13);');
  content = content.replace(/doc\.text\("AB", 96, currentY \+ 18\);/g, 'doc.text("AB", 102, currentY + 18);');
  
  // Postal was at 116. Let's make it at 132.
  content = content.replace(/doc\.text\("Postal Code", 116, currentY \+ 13\);/g, 'doc.text("Postal Code", 132, currentY + 13);');
  content = content.replace(/doc\.text\("T0B 1G0", 116, currentY \+ 18\);/g, 'doc.text("T0B 1G0", 132, currentY + 18);');

  // Telephone was at 146. Let's make it at 160.
  // Wait, if Postal is 132, line is 130? No, let's keep line 1: 100. Line 2: 130. Line 3: 160.
  content = content.replace(/doc\.text\("Telephone Number", 146, currentY \+ 13\);/g, 'doc.text("Telephone Number", 162, currentY + 13);');
  content = content.replace(/doc\.text\("780-847-3002", 146, currentY \+ 18\);/g, 'doc.text("780-847-3002", 162, currentY + 18);');
  
  // Also need to add the 3rd vertical line for Phone!
  // Wait, there are 4 boxes in Row 2: City | Prov | Postal | Phone.
  // Lines were: 95, 115, 145. (3 lines inside the 14-196 box)
  // Let's replace the vertical lines completely to be safe.
  const oldLines = `    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    doc.line(100, currentY + 10, 100, currentY + 20); // City | Prov
    doc.line(130, currentY + 10, 130, currentY + 20); // Prov | Postal
    doc.line(135, currentY + 20, 135, currentY + 35); // Name | Cert / Date | Sig`;
    
  const newLines = `    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    doc.line(95, currentY + 10, 95, currentY + 20); // City | Prov (Wait, 95 is already drawn above from currentY to +20!)
    doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal
    doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone
    doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number
    doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature`;
    
  // I'll just regex replace all vert lines block.
  const vertLinesRegex = /doc\.line\(95, currentY, 95, currentY \+ 20\);[\s\S]*?doc\.line\(135, currentY \+ 20, 135, currentY \+ 35\); \/\/ Name \| Cert \/ Date \| Sig/;
  if (vertLinesRegex.test(content)) {
    content = content.replace(vertLinesRegex, newLines);
  }

  // Now fix Date / Signature labels and values.
  // Return date back to 15, and signature back to 136?
  // Wait, Date is x=15 to x=75. So Date is left. Signature is x=75 to x=196.
  content = content.replace(/doc\.text\("Date \(yyyy-mm-dd\)", 15, currentY \+ 30\);/g, 'doc.text("Date (yyyy-mm-dd)", 15, currentY + 30);');
  content = content.replace(/doc\.text\("Certified Automotive Technician's Signature", 136, currentY \+ 30\);/g, 'doc.text("Certified Automotive Technician\'s Signature", 77, currentY + 30);');
  
  // Date string was moved to 136 by my previous script!
  content = content.replace(/doc\.text\(dateStr, 136, currentY \+ 34\);/g, 'doc.text(dateStr, 15, currentY + 34);');

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
