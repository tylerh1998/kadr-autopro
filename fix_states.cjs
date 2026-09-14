const fs = require('fs');

const states = `
  const [projectPhotos, setProjectPhotos] = useState([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [signedPhotoUrls, setSignedPhotoUrls] = useState({});
  const [viewerPhoto, setViewerPhoto] = useState(null);
`;

function patchStates(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('const [projectPhotos, setProjectPhotos]')) {
    content = content.replace(
      'const [project, setProject] = useState(null);',
      'const [project, setProject] = useState(null);\n' + states
    );
    fs.writeFileSync(file, content);
    console.log('Patched', file);
  } else {
    console.log('Already patched', file);
  }
}

patchStates('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROModal.jsx');
patchStates('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROViewModal.jsx');
