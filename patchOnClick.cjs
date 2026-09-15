const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  // We are going to replace the onClick logic to be more robust and add type="button"
  const oldOnClick = `onClick={() => {
            // Need customer and vehicle. In WorkPROModal it's localCustomer/localVehicle or passed in. 
            // We can just pass the props available.
            const cust = typeof localCustomer !== 'undefined' ? (localCustomer || customer) : (typeof customer !== 'undefined' ? customer : null);
            const veh = typeof localVehicle !== 'undefined' ? (localVehicle || (vehicles ? vehicles.find(v => v.id === workOrder?.vehicle_id) : null)) : null;
            generateInspectionPDF(project, cust, veh, dynamicInspectionSections);
          }}`;

  const newOnClick = `type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const cust = typeof localCustomer !== 'undefined' ? (localCustomer || customer) : (typeof customer !== 'undefined' ? customer : null);
              const veh = typeof localVehicle !== 'undefined' ? (localVehicle || (typeof vehicles !== 'undefined' && vehicles ? vehicles.find(v => v.id === workOrder?.vehicle_id) : null)) : null;
              generateInspectionPDF(project, cust, veh, dynamicInspectionSections);
            } catch (err) {
              console.error('PDF Generation Error:', err);
              alert('Failed to generate PDF: ' + err.message);
            }
          }}`;

  content = content.replace(oldOnClick, newOnClick);

  const oldOnClickView = `onClick={() => {
            const cust = null;
            const veh = null;
            generateInspectionPDF(project, cust, veh, dynamicInspectionSections);
          }}`;

  const newOnClickView = `type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const cust = null;
              const veh = null;
              generateInspectionPDF(project, cust, veh, dynamicInspectionSections);
            } catch (err) {
              console.error('PDF Generation Error:', err);
              alert('Failed to generate PDF: ' + err.message);
            }
          }}`;
          
  content = content.replace(oldOnClickView, newOnClickView);

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('./src/components/work-orders/WorkPROModal.jsx');
patchFile('./src/components/work-orders/WorkPROViewModal.jsx');
