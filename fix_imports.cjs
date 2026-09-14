const fs = require('fs');

const file = 'src/components/work-orders/WorkPROViewModal.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('Expand} from')) {
  content = content.replace(
    /import \{([^}]+)\} from 'lucide-react';/,
    "import {$1, Camera, Expand} from 'lucide-react';"
  );
  fs.writeFileSync(file, content);
  console.log("Added Camera and Expand imports");
}
