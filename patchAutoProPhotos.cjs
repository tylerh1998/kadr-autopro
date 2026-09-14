const fs = require('fs');

function patchModal(file, isEditModal) {
  let content = fs.readFileSync(file, 'utf8');

  // Add imports
  content = content.replace(
    /import { Loader2.*? } from "lucide-react";/g,
    `$&\\nimport { Camera, Upload, Expand } from "lucide-react";\\nimport { uploadProjectPhoto, fetchProjectPhotos, getSignedProjectPhotoUrl, deleteProjectPhoto } from "@/lib/projectPhotos";\\nimport heic2any from "heic2any";\\nimport MediaViewerModal from "../sms/MediaViewerModal";`
  );
  content = content.replace(
    /import { Loader2.*? } from 'lucide-react';/g,
    `$&\\nimport { Camera, Upload, Expand } from "lucide-react";\\nimport { uploadProjectPhoto, fetchProjectPhotos, getSignedProjectPhotoUrl, deleteProjectPhoto } from "@/lib/projectPhotos";\\nimport heic2any from "heic2any";\\nimport MediaViewerModal from "../sms/MediaViewerModal";`
  );

  // Add states
  const statesBlock = `  const [projectPhotos, setProjectPhotos] = useState([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [signedPhotoUrls, setSignedPhotoUrls] = useState({});
  const [viewerPhoto, setViewerPhoto] = useState(null);`;
  
  content = content.replace('const [lineItems, setLineItems] = useState([]);', 'const [lineItems, setLineItems] = useState([]);\\n' + statesBlock);

  // Effect to load photos
  const loadLogic = `
  useEffect(() => {
    if (projectData?.id) {
      loadPhotos(projectData.id);
    }
  }, [projectData?.id]);

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
    if (!files.length || !projectData?.id) return;
    setIsUploadingPhotos(true);
    try {
      for (let file of files) {
        if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
          const converted = await heic2any({ blob: file, toType: "image/jpeg" });
          file = new File([converted], file.name.replace(/\\.heic$/i, ".jpg"), { type: "image/jpeg" });
        }
        await uploadProjectPhoto(projectData.id, user?.id, user?.email || "Unknown", file);
      }
      await loadPhotos(projectData.id);
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
      await loadPhotos(projectData.id);
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };
`;

  content = content.replace('const loadTimeSessions = async (projectId) => {', loadLogic + '\\n  const loadTimeSessions = async (projectId) => {');

  // Insert UI
  const photoUI = isEditModal ? `
            {/* Project Photos Form */}
            {projectData?.id && (
              <div className="pt-4 border-t mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Camera className="w-5 h-5 mr-2 text-gray-700" /> Project Photos
                  </h3>
                  <div>
                    <input type="file" id="photo-upload" multiple accept="image/*,.heic" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhotos} />
                    <Label htmlFor="photo-upload" className={\`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 \${isUploadingPhotos ? 'opacity-50' : ''}\`}>
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploadingPhotos ? "Uploading..." : "Add Photos"}
                    </Label>
                  </div>
                </div>
                {projectPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {projectPhotos.map(photo => (
                      <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-gray-200 cursor-pointer aspect-square bg-gray-100" onClick={() => setViewerPhoto(photo)}>
                        {signedPhotoUrls[photo.id] ? (
                          <img src={signedPhotoUrls[photo.id]} className="w-full h-full object-cover" alt="Project" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">...</div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Expand className="w-8 h-8 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center">No photos attached to this project yet.</div>
                )}
              </div>
            )}
` : `
            {/* Project Photos Grid */}
            {projectPhotos.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border mt-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center">
                  <Camera className="w-4 h-4 mr-1" /> Project Photos
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {projectPhotos.map(photo => (
                    <div key={photo.id} className="relative group rounded-md overflow-hidden border border-gray-200 cursor-pointer aspect-square bg-white" onClick={() => setViewerPhoto(photo)}>
                      {signedPhotoUrls[photo.id] ? (
                        <img src={signedPhotoUrls[photo.id]} className="w-full h-full object-cover" alt="Project" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">...</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Expand className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
`;

  content = content.replace('{/* Line Items Table */}', photoUI + '\\n            {/* Line Items Table */}');

  // Viewer Modal
  const viewerModal = `
      {viewerPhoto && (
        <MediaViewerModal
          isOpen={!!viewerPhoto}
          onClose={() => setViewerPhoto(null)}
          mediaUrl={signedPhotoUrls[viewerPhoto.id]}
          mediaName={"Project Photo"}
          mediaType="image/jpeg"
          uploadedBy={viewerPhoto.uploaded_by}
          uploadedAt={viewerPhoto.created_at}
          ${isEditModal ? 'onDelete={() => handleDeletePhoto(viewerPhoto)}' : ''}
        />
      )}
    </>`;
    
  if (content.includes('</>')) {
    const parts = content.split('</>');
    content = parts.slice(0, -1).join('</>') + viewerModal + '\\n    </>' + parts[parts.length - 1];
  }

  fs.writeFileSync(file, content);
}

patchModal('src/components/work-orders/WorkPROModal.jsx', true);
patchModal('src/components/work-orders/WorkPROViewModal.jsx', false);
