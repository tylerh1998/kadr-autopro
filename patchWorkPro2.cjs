const fs = require('fs');

function patchProjectForm(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Inject inspectionType prop
  const oldProps = `<InspectionGrid
                  inspectionSections={inspectionSections}`;
  const newProps = `<InspectionGrid
                  inspectionType={formData.inspection_type}
                  inspectionSections={inspectionSections}`;

  if (!content.includes('inspectionType={formData.inspection_type}')) {
    content = content.replace(oldProps, newProps);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log("Patched ProjectForm");
  }
}

function patchInspectionGrid(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  if (content.includes('inspectionType')) {
     console.log("Already patched InspectionGrid");
     return;
  }

  // 1. Add inspectionType to props
  content = content.replace(
    `export default function InspectionGrid({
  inspectionSections,`,
    `export default function InspectionGrid({
  inspectionType,
  inspectionSections,`
  );

  // 2. Change column headers
  const oldHeaders = `<div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 mb-2 pb-2 border-b font-medium text-sm text-gray-700">
                  <div>Item</div>
                  <div
                    className="text-center cursor-pointer hover:bg-green-50 py-1 rounded transition-colors"
                    onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "good")}
                    title="Click to select all as Good"
                  >
                    Good
                  </div>
                  <div
                    className="text-center cursor-pointer hover:bg-yellow-50 py-1 rounded transition-colors"
                    onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "fair")}
                    title="Click to select all as Fair"
                  >
                    Fair
                  </div>
                  <div
                    className="text-center cursor-pointer hover:bg-red-50 py-1 rounded transition-colors"
                    onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "poor")}
                    title="Click to select all as Poor"
                  >
                    Poor
                  </div>
                  <div
                    className="text-center cursor-pointer hover:bg-gray-50 py-1 rounded transition-colors"
                    onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "n/a")}
                    title="Click to select all as N/A"
                  >
                    N/A
                  </div>
                </div>`;

  const newHeaders = `<div className={inspectionType === 'alberta_insurance' ? "grid grid-cols-[3fr,1fr,1fr,1fr] gap-2 mb-2 pb-2 border-b font-medium text-sm text-gray-700" : "grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 mb-2 pb-2 border-b font-medium text-sm text-gray-700"}>
                  <div>Item</div>
                  {inspectionType === 'alberta_insurance' ? (
                    <>
                      <div
                        className="text-center cursor-pointer hover:bg-green-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "roadworthy")}
                      >
                        Roadworthy
                      </div>
                      <div
                        className="text-center cursor-pointer hover:bg-red-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "reject")}
                      >
                        Reject
                      </div>
                      <div className="text-center py-1"></div>
                    </>
                  ) : (
                    <>
                      <div
                        className="text-center cursor-pointer hover:bg-green-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "good")}
                      >
                        Good
                      </div>
                      <div
                        className="text-center cursor-pointer hover:bg-yellow-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "fair")}
                      >
                        Fair
                      </div>
                      <div
                        className="text-center cursor-pointer hover:bg-red-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "poor")}
                      >
                        Poor
                      </div>
                      <div
                        className="text-center cursor-pointer hover:bg-gray-50 py-1 rounded transition-colors"
                        onClick={() => onSelectAllInColumn(section.section_name, section.inspection_items, "n/a")}
                      >
                        N/A
                      </div>
                    </>
                  )}
                </div>`;
  content = content.replace(oldHeaders, newHeaders);

  // 3. Change row inputs
  const oldRow = `return (
                      <div key={index} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 py-2 border-b last:border-b-0 items-center">
                        <div className="text-sm text-gray-800">{item}</div>

                        <label
                          htmlFor={\`\${key}-good\`}
                          className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                            selectedValue === 'good' ? 'bg-green-200 hover:bg-green-300' : 'hover:bg-green-50'
                          }\`}
                        >
                          <input
                            type="radio"
                            id={\`\${key}-good\`}
                            name={key}
                            value="good"
                            checked={selectedValue === 'good'}
                            onChange={() => onInspectionChange(section.section_name, item, 'good')}
                            className="sr-only"
                          />
                          <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'good' ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white'}\`}>
                            {selectedValue === 'good' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                        </label>

                        <label
                          htmlFor={\`\${key}-fair\`}
                          className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                            selectedValue === 'fair' ? 'bg-yellow-200 hover:bg-yellow-300' : 'hover:bg-yellow-50'
                          }\`}
                        >
                          <input
                            type="radio"
                            id={\`\${key}-fair\`}
                            name={key}
                            value="fair"
                            checked={selectedValue === 'fair'}
                            onChange={() => onInspectionChange(section.section_name, item, 'fair')}
                            className="sr-only"
                          />
                          <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'fair' ? 'border-yellow-600 bg-yellow-600' : 'border-gray-300 bg-white'}\`}>
                            {selectedValue === 'fair' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                        </label>

                        <label
                          htmlFor={\`\${key}-poor\`}
                          className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                            selectedValue === 'poor' ? 'bg-red-200 hover:bg-red-300' : 'hover:bg-red-50'
                          }\`}
                        >
                          <input
                            type="radio"
                            id={\`\${key}-poor\`}
                            name={key}
                            value="poor"
                            checked={selectedValue === 'poor'}
                            onChange={() => onInspectionChange(section.section_name, item, 'poor')}
                            className="sr-only"
                          />
                          <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'poor' ? 'border-red-600 bg-red-600' : 'border-gray-300 bg-white'}\`}>
                            {selectedValue === 'poor' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                        </label>

                        <label
                          htmlFor={\`\${key}-na\`}
                          className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                            selectedValue === 'n/a' ? 'bg-gray-200 hover:bg-gray-300' : 'hover:bg-gray-50'
                          }\`}
                        >
                          <input
                            type="radio"
                            id={\`\${key}-na\`}
                            name={key}
                            value="n/a"
                            checked={selectedValue === 'n/a'}
                            onChange={() => onInspectionChange(section.section_name, item, 'n/a')}
                            className="sr-only"
                          />
                          <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'n/a' ? 'border-gray-600 bg-gray-600' : 'border-gray-300 bg-white'}\`}>
                            {selectedValue === 'n/a' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                        </label>
                      </div>`;

  const newRow = `return (
                      <div key={index} className={inspectionType === 'alberta_insurance' ? "grid grid-cols-[3fr,1fr,1fr,1fr] gap-2 py-2 border-b last:border-b-0 items-center" : "grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 py-2 border-b last:border-b-0 items-center"}>
                        <div className="text-sm text-gray-800">{item}</div>
                        {inspectionType === 'alberta_insurance' ? (
                          <>
                            <label
                              htmlFor={\`\${key}-roadworthy\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'roadworthy' ? 'bg-green-200 hover:bg-green-300' : 'hover:bg-green-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-roadworthy\`}
                                name={key}
                                value="roadworthy"
                                checked={selectedValue === 'roadworthy'}
                                onChange={() => onInspectionChange(section.section_name, item, 'roadworthy')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'roadworthy' ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'roadworthy' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>

                            <label
                              htmlFor={\`\${key}-reject\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'reject' ? 'bg-red-200 hover:bg-red-300' : 'hover:bg-red-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-reject\`}
                                name={key}
                                value="reject"
                                checked={selectedValue === 'reject'}
                                onChange={() => onInspectionChange(section.section_name, item, 'reject')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'reject' ? 'border-red-600 bg-red-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'reject' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>
                            
                            <div></div>
                          </>
                        ) : (
                          <>
                            <label
                              htmlFor={\`\${key}-good\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'good' ? 'bg-green-200 hover:bg-green-300' : 'hover:bg-green-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-good\`}
                                name={key}
                                value="good"
                                checked={selectedValue === 'good'}
                                onChange={() => onInspectionChange(section.section_name, item, 'good')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'good' ? 'border-green-600 bg-green-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'good' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>

                            <label
                              htmlFor={\`\${key}-fair\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'fair' ? 'bg-yellow-200 hover:bg-yellow-300' : 'hover:bg-yellow-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-fair\`}
                                name={key}
                                value="fair"
                                checked={selectedValue === 'fair'}
                                onChange={() => onInspectionChange(section.section_name, item, 'fair')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'fair' ? 'border-yellow-600 bg-yellow-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'fair' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>

                            <label
                              htmlFor={\`\${key}-poor\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'poor' ? 'bg-red-200 hover:bg-red-300' : 'hover:bg-red-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-poor\`}
                                name={key}
                                value="poor"
                                checked={selectedValue === 'poor'}
                                onChange={() => onInspectionChange(section.section_name, item, 'poor')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'poor' ? 'border-red-600 bg-red-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'poor' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>

                            <label
                              htmlFor={\`\${key}-na\`}
                              className={\`flex justify-center cursor-pointer py-2 rounded transition-colors \${
                                selectedValue === 'n/a' ? 'bg-gray-200 hover:bg-gray-300' : 'hover:bg-gray-50'
                              }\`}
                            >
                              <input
                                type="radio"
                                id={\`\${key}-na\`}
                                name={key}
                                value="n/a"
                                checked={selectedValue === 'n/a'}
                                onChange={() => onInspectionChange(section.section_name, item, 'n/a')}
                                className="sr-only"
                              />
                              <div className={\`w-5 h-5 rounded-full border-2 flex items-center justify-center \${selectedValue === 'n/a' ? 'border-gray-600 bg-gray-600' : 'border-gray-300 bg-white'}\`}>
                                {selectedValue === 'n/a' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </label>
                          </>
                        )}
                      </div>`;
                      
  content = content.replace(oldRow, newRow);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log("Patched InspectionGrid");
}

patchProjectForm('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/ProjectForm.jsx');
patchInspectionGrid('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/InspectionGrid.jsx');
