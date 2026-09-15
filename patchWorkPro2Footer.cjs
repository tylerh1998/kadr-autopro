const fs = require('fs');

function patchInspectionGridFooter(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  if (content.includes('Is this vehicle roadworthy')) {
     console.log("Already patched InspectionGrid footer");
     return;
  }

  const oldFooter = `        </div>
      )}
    </div>
  );
}`;

  const newFooter = `        </div>
      )}
      
      {inspectionType === 'alberta_insurance' && (
        <div className="mt-6 border rounded-lg p-4 bg-white">
          <h3 className="font-semibold text-md text-gray-900 mb-4">Summary & Certification</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-gray-800">Is this vehicle roadworthy?</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="Summary-Roadworthy" 
                    checked={inspectionResults?.['Summary-Roadworthy'] === 'yes'}
                    onChange={() => onInspectionChange('Summary', 'Roadworthy', 'yes')}
                  /> Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="Summary-Roadworthy" 
                    checked={inspectionResults?.['Summary-Roadworthy'] === 'no'}
                    onChange={() => onInspectionChange('Summary', 'Roadworthy', 'no')}
                  /> No
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-gray-800">Has the vehicle been altered for speed or performance?</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="Summary-Altered" 
                    checked={inspectionResults?.['Summary-Altered'] === 'yes'}
                    onChange={() => onInspectionChange('Summary', 'Altered', 'yes')}
                  /> Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="Summary-Altered" 
                    checked={inspectionResults?.['Summary-Altered'] === 'no'}
                    onChange={() => onInspectionChange('Summary', 'Altered', 'no')}
                  /> No
                </label>
              </div>
            </div>

            <div className="pt-2">
              <Label className="text-sm font-medium mb-2 block">Other Comments</Label>
              <Textarea 
                value={inspectionComments?.['Summary'] || ''}
                onChange={(e) => onCommentChange('Summary', e.target.value)}
                placeholder="Additional comments..."
                rows={3}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;
  content = content.replace(oldFooter, newFooter);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log("Patched InspectionGrid Footer");
}

patchInspectionGridFooter('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/InspectionGrid.jsx');
