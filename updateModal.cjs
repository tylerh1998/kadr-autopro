const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROModal.jsx', 'utf8');

c = c.replace(/const INSPECTION_SECTIONS = \[\s+{(.|\n)*?}\s+\];/g, '');

c = c.replace(
  "const [hasChanges, setHasChanges] = useState(false);",
  `const [hasChanges, setHasChanges] = useState(false);
  const [dynamicInspectionSections, setDynamicInspectionSections] = useState([]);
  
  useEffect(() => {
    if (!project) return;
    const loadSections = async () => {
      const inspType = project.inspection_type || 'oil_change';
      const { data: dbSections, error } = await supabase
        .from('InspectionSection')
        .select('*')
        .eq('insp_type', inspType)
        .order('display_order', { ascending: true });
        
      if (!error && dbSections) {
        // Build dynamic sections (include any orphaned keys from results)
        let parsedResults = {};
        if (project.inspection_results) {
          try { 
            parsedResults = typeof project.inspection_results === 'string' 
              ? JSON.parse(project.inspection_results) 
              : project.inspection_results; 
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
    };
    loadSections();
  }, [project]);`
);

c = c.replace(
  /INSPECTION_SECTIONS\.sort/g,
  'dynamicInspectionSections.sort'
);

fs.writeFileSync('src/components/work-orders/WorkPROModal.jsx', c);
