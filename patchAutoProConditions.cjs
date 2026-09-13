const fs = require('fs');
let viewModal = fs.readFileSync('src/components/work-orders/WorkPROViewModal.jsx', 'utf8');
let editModal = fs.readFileSync('src/components/work-orders/WorkPROModal.jsx', 'utf8');

const regexView = /\{project\.inspection_results && Object\.keys\(getInspectionResultsObj\(\)\)\.length > 0 && \(/;
const regexEdit = /\{project\.inspection_results && Object\.keys\(getInspectionResultsObj\(\)\)\.length > 0 && \(/;

const newCondition = `{( (project.inspection_results && Object.keys(getInspectionResultsObj()).length > 0) || (project.inspection_comments && Object.keys(getInspectionComments()).length > 0) ) && (`

viewModal = viewModal.replace(regexView, newCondition);
editModal = editModal.replace(regexEdit, newCondition);

fs.writeFileSync('src/components/work-orders/WorkPROViewModal.jsx', viewModal);
fs.writeFileSync('src/components/work-orders/WorkPROModal.jsx', editModal);
