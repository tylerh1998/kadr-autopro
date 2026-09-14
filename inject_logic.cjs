const fs = require('fs');

const loadLogic = `
  useEffect(() => {
    if (project?.id) {
      loadPhotos(project.id);
    }
  }, [project?.id]);

  const loadPhotos = async (projectId) => {
    try {
      const photos = await fetchProjectPhotos(projectId);
      setProjectPhotos(photos);
      const urls = {};
      for (const p of photos) {
        urls[p.id] = await getSignedProjectPhotoUrl(p.storage_path);
      }
      setSignedPhotoUrls(urls);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !project?.id) return;
    setIsUploadingPhotos(true);
    try {
      for (let file of files) {
        if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
          const converted = await heic2any({ blob: file, toType: "image/jpeg" });
          file = new File([converted], file.name.replace(/\\.heic$/i, ".jpg"), { type: "image/jpeg" });
        }
        await uploadProjectPhoto(project.id, null, "Unknown", file);
      }
      await loadPhotos(project.id);
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload some photos");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photo) => {
    if (!window.confirm("Are you sure you want to delete this photo?")) return;
    try {
      await deleteProjectPhoto(photo);
      setViewerPhoto(null);
      await loadPhotos(project.id);
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };
`;

function injectLogic(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('const loadPhotos = async')) {
    const searchString = 'const [viewerPhoto, setViewerPhoto] = useState(null);';
    content = content.replace(searchString, searchString + '\n' + loadLogic);
    fs.writeFileSync(file, content);
    console.log('Injected logic into', file);
  } else {
    console.log('Logic already exists in', file);
  }
}

injectLogic('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROModal.jsx');
injectLogic('c:/Users/tyler/OneDrive/Documents/GitHub/kadr-autopro/src/components/work-orders/WorkPROViewModal.jsx');
