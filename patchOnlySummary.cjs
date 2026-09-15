const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // 1. Map dynamicInspectionSections filtering out 'Summary'
  const mapRegex = /\{dynamicInspectionSections\.sort\(\(a, b\) => a\.display_order - b\.display_order\)\.map\(\(section\) => \{/g;
  const newMapStart = `{dynamicInspectionSections.filter(s => s.section_name !== 'Summary').sort((a, b) => a.display_order - b.display_order).map((section) => {`;
  content = content.replace(mapRegex, newMapStart);

  // 2. Add the Summary section at the end of the loop
  const endLoopRegex = /\}\)\}\s*<\/div>/;
  const newSummary = `})\}
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

                                {(() => {
                                  let comment = '';
                                  try {
                                    if (typeof project.inspection_comments === 'string') {
                                      comment = JSON.parse(project.inspection_comments)['Summary'];
                                    } else if (project.inspection_comments) {
                                      comment = project.inspection_comments['Summary'];
                                    }
                                  } catch (e) {}
                                  
                                  return comment ? (
                                    <div className="pt-2">
                                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Other Comments</span>
                                      <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded">{comment}</p>
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          )}`;
  content = content.replace(endLoopRegex, newSummary);

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
