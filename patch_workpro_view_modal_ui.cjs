const fs = require('fs');

const file = 'src/components/work-orders/WorkPROViewModal.jsx';
let content = fs.readFileSync(file, 'utf8');

const photoUI = `
            {/* Project Photos */}
            {project?.id && projectPhotos && projectPhotos.length > 0 && (
              <Card className="bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center">
                    <Camera className="w-4 h-4 mr-2" /> Project Photos
                  </h3>
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
                </CardContent>
              </Card>
            )}
`;

content = content.replace('{/* Inspection Results */}', photoUI + '\n              {/* Inspection Results */}');

// Also inject missing imports
if (!content.includes('import { Camera')) {
  content = content.replace("import { Download,", "import { Camera, Expand, Download,");
}

fs.writeFileSync(file, content);
console.log("Patched WorkPROViewModal UI");
