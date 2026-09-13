const fs = require('fs');
let c = fs.readFileSync('src/components/work-orders/WorkPROViewModal.jsx', 'utf8');

c = c.replace(
  `  // Get inspection result for a specific item
  const getInspectionResult = (sectionName, itemName) => {
    if (!project?.inspection_results) return null;
    const key = \`\${sectionName}-\${itemName}\`;
    return project.inspection_results[key] || null;
  };`,
  `  const getInspectionResultsObj = () => {
    if (!project?.inspection_results) return {};
    try {
      return typeof project.inspection_results === 'string'
        ? JSON.parse(project.inspection_results)
        : project.inspection_results;
    } catch (error) {
      return {};
    }
  };

  // Get inspection result for a specific item
  const getInspectionResult = (sectionName, itemName) => {
    const results = getInspectionResultsObj();
    const key = \`\${sectionName}-\${itemName}\`;
    return results[key] || null;
  };`
);

c = c.replace(
  `{project.inspection_results && Object.keys(project.inspection_results).length > 0 && (`,
  `{project.inspection_results && Object.keys(getInspectionResultsObj()).length > 0 && (`
);

fs.writeFileSync('src/components/work-orders/WorkPROViewModal.jsx', c);
