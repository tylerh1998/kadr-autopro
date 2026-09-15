const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Fix the Signature label x-position
  content = content.replace(/doc\.text\("Certified Automotive Technician's Signature", 136, currentY \+ 30\);/g, 'doc.text("Certified Automotive Technician\'s Signature", 77, currentY + 30);');

  // Fix the Date value x-position (it was moved to 136 by patchPdf.cjs which used a single line replace that WORKED)
  content = content.replace(/doc\.text\(dateStr, 136, currentY \+ 34\);/g, 'doc.text(dateStr, 15, currentY + 34);');

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
