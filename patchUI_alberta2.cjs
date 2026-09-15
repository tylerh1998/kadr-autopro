const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // Change table headers in WorkPROModal.jsx and WorkPROViewModal.jsx
  const oldTableHeader = `<th className="text-left p-2 font-medium text-slate-700 dark:text-slate-300">Item</th>
                                        <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Good</th>
                                        <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Fair</th>
                                        <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">Poor</th>
                                        <th className="text-center p-2 font-medium text-slate-700 dark:text-slate-300 w-16">N/A</th>`;

  const newTableHeader = `<th className="text-left p-2 font-medium text-slate-700 dark:text-slate-300">Item</th>
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
                                        )}`;

  // Just strip all spaces and newlines to do the replacement safely if needed
  // Or better, use a regex that ignores whitespace differences
  const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const makeRegex = (s) => new RegExp(escapeRegex(s).replace(/\\s+/g, '\\s+'));

  const headerRegex = makeRegex(oldTableHeader);
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, newTableHeader);
    console.log("Replaced headers in", filepath);
  } else {
    console.log("Failed to find headers in", filepath);
  }

  // Change table rows
  const oldTableRow = `<td className="p-2 text-slate-900 dark:text-slate-100">{item}</td>
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
                                            </td>`;

  const newTableRow = `<td className="p-2 text-slate-900 dark:text-slate-100">{item}</td>
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
                                            )}`;

  const rowRegex = makeRegex(oldTableRow);
  if (rowRegex.test(content)) {
    content = content.replace(rowRegex, newTableRow);
    console.log("Replaced rows in", filepath);
  } else {
    console.log("Failed to find rows in", filepath);
  }

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
