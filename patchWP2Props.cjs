const fs = require('fs');

function patchProjectForm(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  const oldPropsRegex = /<InspectionGrid\s+inspectionSections=\{inspectionSections\}/;
  const newProps = `<InspectionGrid\n                  inspectionType={formData.inspection_type}\n                  inspectionSections={inspectionSections}`;

  if (oldPropsRegex.test(content) && !content.includes('inspectionType={formData.inspection_type}')) {
    content = content.replace(oldPropsRegex, newProps);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log("Patched ProjectForm props!");
  } else {
    console.log("Failed to patch ProjectForm props!");
  }
}

patchProjectForm('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/ProjectForm.jsx');
