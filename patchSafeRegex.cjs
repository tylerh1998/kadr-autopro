const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Fix vertical lines
  content = content.replace(/doc\.line\(115, currentY \+ 10, 115, currentY \+ 20\); \/\/ City \| Prov/g, 'doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal');
  content = content.replace(/doc\.line\(145, currentY \+ 10, 145, currentY \+ 20\); \/\/ Prov \| Postal/g, 'doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone');
  content = content.replace(/doc\.line\(135, currentY \+ 20, 135, currentY \+ 35\); \/\/ Name \| Cert \/ Date \| Sig/g, 'doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number\\n  doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature');

  // Row 2 Labels
  content = content.replace(/doc\.text\("Province\/Territory", 96, currentY \+ 13\);/g, 'doc.text("Province", 97, currentY + 13);');
  content = content.replace(/doc\.text\("AB", 96, currentY \+ 18\);/g, 'doc.text("AB", 97, currentY + 18);');
  content = content.replace(/doc\.text\("Postal Code", 116, currentY \+ 13\);/g, 'doc.text("Postal Code", 127, currentY + 13);');
  content = content.replace(/doc\.text\("T0B 1G0", 116, currentY \+ 18\);/g, 'doc.text("T0B 1G0", 127, currentY + 18);');
  content = content.replace(/doc\.text\("Telephone Number", 146, currentY \+ 13\);/g, 'doc.text("Telephone Number", 162, currentY + 13);');
  content = content.replace(/doc\.text\("780-847-3002", 146, currentY \+ 18\);/g, 'doc.text("780-847-3002", 162, currentY + 18);');

  // Fix Signature x-position
  content = content.replace(/doc\.text\("Certified Automotive Technician's Signature", 136, currentY \+ 30\);/g, 'doc.text("Certified Automotive Technician\'s Signature", 77, currentY + 30);');

  // Fix Date value x-position
  content = content.replace(/doc\.text\(dateStr, 136, currentY \+ 34\);/g, 'doc.text(dateStr, 15, currentY + 34);');

  fs.writeFileSync(filepath, content.replace(/\\n/g, '\n'), 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
