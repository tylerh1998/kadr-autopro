const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Regex replacement for vertical lines
  const vertRegex = /\/\/ vert[\s\S]*?doc\.line\(135, currentY \+ 20, 135, currentY \+ 35\); \/\/ Name \| Cert \/ Date \| Sig/m;
  const newVert = `// vert
    doc.line(95, currentY, 95, currentY + 20); // Address | City/Prov/Postal
    doc.line(125, currentY + 10, 125, currentY + 20); // Prov | Postal
    doc.line(160, currentY + 10, 160, currentY + 20); // Postal | Phone
    doc.line(135, currentY + 20, 135, currentY + 27); // Name | Cert Number
    doc.line(75, currentY + 27, 75, currentY + 35); // Date | Signature`;
    
  if (vertRegex.test(content)) {
    content = content.replace(vertRegex, newVert);
  } else {
    console.log("Vert regex failed to match!");
  }

  // Row 2 Labels
  content = content.replace(/doc\.text\("Province", 102, currentY \+ 13\);/g, 'doc.text("Province", 97, currentY + 13);');
  content = content.replace(/doc\.text\("AB", 102, currentY \+ 18\);/g, 'doc.text("AB", 97, currentY + 18);');
  
  content = content.replace(/doc\.text\("Postal Code", 132, currentY \+ 13\);/g, 'doc.text("Postal Code", 127, currentY + 13);');
  content = content.replace(/doc\.text\("T0B 1G0", 132, currentY \+ 18\);/g, 'doc.text("T0B 1G0", 127, currentY + 18);');
  // Wait, in my original `patchPdfFinal2.cjs` I tried replacing the original `96` to `97`.
  // BUT `patchPdf.cjs` ALREADY changed `96` to `102`!
  // I must replace BOTH just in case.
  content = content.replace(/doc\.text\("Province\/Territory", 96, currentY \+ 13\);/g, 'doc.text("Province", 97, currentY + 13);');
  content = content.replace(/doc\.text\("AB", 96, currentY \+ 18\);/g, 'doc.text("AB", 97, currentY + 18);');
  content = content.replace(/doc\.text\("Postal Code", 116, currentY \+ 13\);/g, 'doc.text("Postal Code", 127, currentY + 13);');
  content = content.replace(/doc\.text\("T0B 1G0", 116, currentY \+ 18\);/g, 'doc.text("T0B 1G0", 127, currentY + 18);');

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/lib/albertaPdfGenerator.js');
