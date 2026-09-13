const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROModal.jsx', 'utf8');

c = c.replace(/const INSPECTION_SECTIONS = \[\s+{(.|\n)*?}\s+\];/g, '');

c = c.replace(
  "const [project, setProject] = useState(null);",
  "const [project, setProject] = useState(null);\n  const [dynamicInspectionSections, setDynamicInspectionSections] = useState([]);"
);

// We need to inject the loading logic inside fetchWorkPROData in WorkPROModal as well.
// Let's see what fetchWorkPROData looks like in WorkPROModal.
