const fs = require('fs');

function patchFile(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix projectData -> project in the useEffect block
  content = content.replace(
    /useEffect\(\(\) => \{\n\s*if \(projectData\?\.id\) \{\n\s*loadPhotos\(projectData\.id\);\n\s*\}\n\s*\}, \[projectData\?\.id\]\);/g,
    `useEffect(() => {\n    if (project?.id) {\n      loadPhotos(project.id);\n    }\n  }, [project?.id]);`
  );

  // Fix projectData -> project in handlePhotoUpload
  content = content.replace(
    /if \(!files\.length \|\| !projectData\?\.id\) return;/g,
    `if (!files.length || !project?.id) return;`
  );
  content = content.replace(
    /await uploadProjectPhoto\(projectData\.id,/g,
    `await uploadProjectPhoto(project.id,`
  );
  content = content.replace(
    /await loadPhotos\(projectData\.id\);/g,
    `await loadPhotos(project.id);`
  );

  // Fix projectData -> project in UI
  content = content.replace(
    /\{projectData\?\.id && \(/g,
    `{project?.id && (`
  );

  fs.writeFileSync(file, content);
  console.log('Fixed projectData in', file);
}

patchFile('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROModal.jsx');
patchFile('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROViewModal.jsx');
