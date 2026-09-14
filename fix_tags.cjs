const fs = require('fs');
const files = [
  'c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROModal.jsx',
  'c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROViewModal.jsx'
];

for (const file of files) {
  try {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/<\/>[\s\n]*<\/>/g, '</>');
    fs.writeFileSync(file, content);
    console.log('Fixed tags in', file);
  } catch (e) {
    console.log('Error with', file, e.message);
  }
}
