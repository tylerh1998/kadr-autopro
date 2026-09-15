const fs = require('fs');

function replaceBetween(content, startStr, endStr, replacement) {
  const startIndex = content.indexOf(startStr);
  if (startIndex === -1) return content;
  const endIndex = content.indexOf(endStr, startIndex + startStr.length);
  if (endIndex === -1) return content;
  
  return content.substring(0, startIndex) + replacement + content.substring(endIndex + endStr.length);
}

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  const startBlock = `                      return (
                        <div key={index} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 py-2 border-b last:border-b-0 items-center">`;
  const endBlock = `                        </div>
                      );`;

  const replacement = `                      return (
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
                                  checked={selectedValue === "roadworthy"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500 cursor-pointer"
                                />
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
                                  checked={selectedValue === "reject"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500 cursor-pointer"
                                />
                              </label>

                              <div className="text-center py-1"></div>
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
                                  checked={selectedValue === "good"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500 cursor-pointer"
                                />
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
                                  checked={selectedValue === "fair"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-yellow-600 border-gray-300 focus:ring-yellow-500 cursor-pointer"
                                />
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
                                  checked={selectedValue === "poor"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500 cursor-pointer"
                                />
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
                                  checked={selectedValue === "n/a"}
                                  onChange={(e) => onInspectionChange(section.section_name, item, e.target.value)}
                                  className="w-4 h-4 text-gray-600 border-gray-300 focus:ring-gray-500 cursor-pointer"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      );`;

  if (content.includes('grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-2 py-2 border-b')) {
    content = replaceBetween(content, startBlock, endBlock, replacement);
    fs.writeFileSync(filepath, content, 'utf8');
    console.log("Patched rows successfully!");
  } else {
    console.log("Could not find start block!");
  }
}

patchFile('C:/Users/tyler/OneDrive/Documents/GitHub/WorkPro2/src/components/projects/InspectionGrid.jsx');
