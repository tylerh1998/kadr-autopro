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

  // 1. Skip rendering the 'Summary' section in the main loop
  const mapStart = `{inspectionSections.map((section) => {`;
  const newMapStart = `{inspectionSections.filter(s => s.section_name !== 'Summary').map((section) => {`;
  content = content.replace(mapStart, newMapStart);

  // 2. Add the Summary section at the bottom (after the main sections loop)
  const afterLoop = `</div>
                          </div>
                        </div>
                      </div>
                    </div>`;

  const newSummary = `</div>
                          </div>

                          {project?.inspection_type === 'alberta_insurance' && (
                            <div className="mt-6 border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                              <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-4">Summary & Certification</h4>
                              
                              <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                                  <span className="text-sm text-slate-700 dark:text-slate-300">Is this vehicle roadworthy?</span>
                                  <div className="flex gap-6">
                                    <span className="text-sm font-medium flex items-center gap-2">
                                      {getInspectionResult('Summary', 'Roadworthy') === 'yes' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <div className="w-4 h-4 border border-slate-300 rounded-full" />} Yes
                                    </span>
                                    <span className="text-sm font-medium flex items-center gap-2">
                                      {getInspectionResult('Summary', 'Roadworthy') === 'no' ? <CheckCircle2 className="w-4 h-4 text-red-600" /> : <div className="w-4 h-4 border border-slate-300 rounded-full" />} No
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                                  <span className="text-sm text-slate-700 dark:text-slate-300">Has the vehicle been altered for speed or performance?</span>
                                  <div className="flex gap-6">
                                    <span className="text-sm font-medium flex items-center gap-2">
                                      {getInspectionResult('Summary', 'Altered') === 'yes' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <div className="w-4 h-4 border border-slate-300 rounded-full" />} Yes
                                    </span>
                                    <span className="text-sm font-medium flex items-center gap-2">
                                      {getInspectionResult('Summary', 'Altered') === 'no' ? <CheckCircle2 className="w-4 h-4 text-red-600" /> : <div className="w-4 h-4 border border-slate-300 rounded-full" />} No
                                    </span>
                                  </div>
                                </div>

                                {getInspectionComment('Summary') && (
                                  <div className="pt-2">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Other Comments</span>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded">{getInspectionComment('Summary')}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>`;

  // Actually, I need to make sure the replacement is placed exactly after the mapping of `inspectionSections`.
  // Let's use regex to find the end of the `inspectionSections.map` block.
  // Wait, I can just find:
  /*
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
  */
  // No, `WorkPROModal` and `WorkPROViewModal` might differ slightly.
  // Let's just find the closing tags of the grid container.
  
  if (content.includes(`</div>\n                          </div>\n                        </div>\n                      </div>\n                    </div>`)) {
    content = content.replace(`</div>\n                          </div>\n                        </div>\n                      </div>\n                    </div>`, newSummary);
  } else {
    // try a more relaxed regex
    content = content.replace(/(<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/, newSummary);
  }

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
