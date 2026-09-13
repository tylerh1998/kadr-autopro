const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROViewModal.jsx', 'utf8');

// 1. Remove the hardcoded INSPECTION_SECTIONS constant completely
c = c.replace(/const INSPECTION_SECTIONS = \[\s+{(.|\n)*?}\s+\];/g, '');

// 2. Add state for dynamic sections
c = c.replace(
  "const [project, setProject] = useState(null);",
  "const [project, setProject] = useState(null);\n  const [dynamicInspectionSections, setDynamicInspectionSections] = useState([]);"
);

// 3. Update fetchWorkPROData to fetch sections dynamically
c = c.replace(
  "// Fetch approvals (using cp_id)",
  `// Fetch Inspection Sections based on project type
      const inspType = foundProject?.inspection_type || 'oil_change';
      const { data: dbSections, error: secError } = await supabase
        .from('InspectionSection')
        .select('*')
        .eq('insp_type', inspType)
        .order('display_order', { ascending: true });
        
      if (!secError && dbSections) {
        // Build dynamic sections (include any orphaned keys from results)
        let parsedResults = {};
        if (foundProject?.inspection_results) {
          try { 
            parsedResults = typeof foundProject.inspection_results === 'string' 
              ? JSON.parse(foundProject.inspection_results) 
              : foundProject.inspection_results; 
          } catch (e) {}
        }
        
        const sectionMap = {};
        dbSections.forEach(s => sectionMap[s.section_name] = { ...s });
        
        Object.keys(parsedResults).forEach(key => {
          let sectionName = null;
          let itemName = null;
          for (let s of dbSections) {
            if (key.startsWith(s.section_name + '-')) {
              sectionName = s.section_name;
              itemName = key.substring(s.section_name.length + 1);
              break;
            }
          }
          if (!sectionName) {
            const dashIdx = key.indexOf('-');
            if (dashIdx > 0) {
              sectionName = key.substring(0, dashIdx);
              itemName = key.substring(dashIdx + 1);
            } else {
              sectionName = 'Other';
              itemName = key;
            }
          }
          if (!sectionMap[sectionName]) {
            sectionMap[sectionName] = { section_name: sectionName, display_order: 999, inspection_items: [] };
          }
          if (!sectionMap[sectionName].inspection_items.includes(itemName)) {
            sectionMap[sectionName].inspection_items.push(itemName);
          }
        });
        
        setDynamicInspectionSections(Object.values(sectionMap));
      }

      // Fetch approvals (using cp_id)`
);

// 4. Update the render loop
c = c.replace(
  /INSPECTION_SECTIONS\.sort/g,
  'dynamicInspectionSections.sort'
);

fs.writeFileSync('src/components/work-orders/WorkPROViewModal.jsx', c);
