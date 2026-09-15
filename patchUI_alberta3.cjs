const fs = require('fs');

function replaceBetween(content, startStr, endStr, replacement) {
  const startIndex = content.indexOf(startStr);
  if (startIndex === -1) return content;
  const endIndex = content.indexOf(endStr, startIndex + startStr.length);
  if (endIndex === -1) return content;
  
  return content.substring(0, startIndex + startStr.length) + replacement + content.substring(endIndex);
}

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  const theadStart = `<tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">`;
  const theadEnd = `</tr>`;
  
  const newThead = `
                                        <th className="text-left p-2 font-medium text-slate-700 dark:text-slate-300">Item</th>
                                        {project?.inspection_type === 'alberta_insurance' ? (
                                          <>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-24">Roadworthy</th>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-24">Reject</th>
                                          </>
                                        ) : (
                                          <>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Good</th>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Fair</th>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Poor</th>
                                            <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">N/A</th>
                                          </>
                                        )}
                                      `;
                                      
  content = replaceBetween(content, theadStart, theadEnd, newThead);

  const tbodyStart = `<tr key={item} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">`;
  const tbodyEnd = `</tr>`;
  
  const newTbody = `
                                            <td className="p-2 text-slate-900 dark:text-slate-100">{item}</td>
                                            {project?.inspection_type === 'alberta_insurance' ? (
                                              <>
                                                <td className="p-2 text-center">
                                                  {result === 'roadworthy' && <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {result === 'reject' && <CheckCircle2 className="w-4 h-4 text-red-600 mx-auto" />}
                                                </td>
                                              </>
                                            ) : (
                                              <>
                                                <td className="p-2 text-center">
                                                  {result === 'good' && <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {result === 'fair' && <CheckCircle2 className="w-4 h-4 text-yellow-600 mx-auto" />}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {result === 'poor' && <CheckCircle2 className="w-4 h-4 text-red-600 mx-auto" />}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {result === 'n/a' && <CheckCircle2 className="w-4 h-4 text-slate-400 mx-auto" />}
                                                </td>
                                              </>
                                            )}
                                          `;
                                          
  content = replaceBetween(content, tbodyStart, tbodyEnd, newTbody);
  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
