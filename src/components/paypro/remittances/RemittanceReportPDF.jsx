// employerMultiplier: PayPro_TaxYearConstant.ei_rate_employer_multiplier for the remittance's
// own year, passed by the caller - defaults to 1.4 only as a fallback so a caller that hasn't
// resolved a constant yet doesn't crash. Deviation from this phase's plan (D3 said "verbatim,
// zero changes") - found while building that this file's own per-line EI-employer figure
// independently hardcoded 1.4, the same D6-class bug Phase 6 fixed everywhere else it found it.
const RemittanceReportPDF = (remittance, payStubs, employees, employerMultiplier = 1.4) => {
    const cppTotal = (remittance.total_cpp_employee || 0) + (remittance.total_cpp_employer || 0);
    const eiTotal = (remittance.total_ei_employee || 0) + (remittance.total_ei_employer || 0);

    const getEmployee = (employeeId) => {
        return employees.find(e => e.employee_id === employeeId);
    };

    // Format date without timezone issues
    const formatDateMT = (dateString) => {
        if (!dateString) return '';
        const dateStr = dateString.split('T')[0];
        const [year, month, day] = dateStr.split('-');
        const date = new Date(year, month - 1, day);
        return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`;
    };

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Remittance Report - ${remittance.remittance_date}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { -webkit-print-color-adjust: exact; font-family: sans-serif; }
        .bg-gray-700 { background-color: #4a5568; }
        .text-white { color: #fff; }
        .font-bold { font-weight: 700; }
        .p-2 { padding: 0.5rem; }
        .text-sm { font-size: 0.875rem; }
        .text-xs { font-size: 0.75rem; }
        .w-full { width: 100%; }
        .border-collapse { border-collapse: collapse; }
        .border { border: 1px solid #e2e8f0; }
        .p-1 { padding: 0.25rem; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .bg-emerald-500 { background-color: #10b981; }
        .bg-gray-50 { background-color: #f9fafb; }
        .bg-gray-100 { background-color: #f3f4f6; }
        @media print {
            body { margin: 1rem 0.5rem; }
            .no-print { display: none; }
        }
      </style>
    </head>
    <body class="p-4 bg-gray-100">
        <div class="max-w-6xl mx-auto bg-white p-6 shadow-lg rounded-lg">
            <!-- Compact Header -->
            <div class="mb-3">
                <table class="w-full">
                    <tr>
                        <td class="w-1/2 align-top">
                            <h1 class="text-base font-bold text-gray-800">Payroll Remittance Statement</h1>
                            <p class="text-xs text-gray-600 mt-0.5">Ken's Auto & Diesel Repair</p>
                        </td>
                        <td class="w-1/2 text-right align-top" style="font-size: 9px; line-height: 1.3;">
                            <p class="text-gray-500">5002 49 Ave - PO Box 160, Dewberry, AB T0B 1G0</p>
                            <p class="text-gray-500">780-847-3002 | Shop@kensauto.ca</p>
                        </td>
                    </tr>
                </table>
                <table class="w-full text-xs mt-1 border-t border-b">
                    <tr>
                        <td class="p-1 w-1/4">
                            <span class="font-semibold text-gray-500">Remittance Date:</span> ${formatDateMT(remittance.remittance_date)}
                        </td>
                        <td class="p-1 w-1/2">
                            <span class="font-semibold text-gray-500">Period:</span> ${formatDateMT(remittance.period_start)} to ${formatDateMT(remittance.period_end)}
                        </td>
                        <td class="p-1 w-1/4 bg-emerald-500 text-white rounded text-center">
                            <span class="font-semibold">Total: $${remittance.total_remittance.toFixed(2)}</span>
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Breakdown Table -->
            <div class="mb-3">
                <table class="w-full border-collapse border text-xs">
                    <thead>
                        <tr class="bg-gray-100 font-bold">
                            <th class="border p-2 text-left">Deduction Type</th>
                            <th class="border p-2 text-right">Employee Portion</th>
                            <th class="border p-2 text-right">Employer Portion</th>
                            <th class="border p-2 text-right">Line Total</th>
                        </tr>
                    </thead>
                     <tbody>
                        <tr>
                            <td class="border p-2 font-semibold">Income Tax (Federal & Provincial)</td>
                            <td class="border p-2 text-right">$${remittance.total_income_tax.toFixed(2)}</td>
                            <td class="border p-2 text-right text-gray-400">N/A</td>
                            <td class="border p-2 text-right font-medium">$${remittance.total_income_tax.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td class="border p-2 font-semibold">Canada Pension Plan (CPP)</td>
                            <td class="border p-2 text-right">$${remittance.total_cpp_employee.toFixed(2)}</td>
                            <td class="border p-2 text-right">$${remittance.total_cpp_employer.toFixed(2)}</td>
                            <td class="border p-2 text-right font-medium">$${cppTotal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td class="border p-2 font-semibold">Employment Insurance (EI)</td>
                            <td class="border p-2 text-right">$${remittance.total_ei_employee.toFixed(2)}</td>
                            <td class="border p-2 text-right">$${remittance.total_ei_employer.toFixed(2)}</td>
                            <td class="border p-2 text-right font-medium">$${eiTotal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Detailed Paycheque List -->
            <div>
                <div class="bg-gray-700 text-white p-1 font-bold text-xs rounded-t-md">Individual Paycheque Details</div>
                <table class="w-full border-collapse border text-xs">
                    <thead>
                        <tr class="bg-gray-100 font-bold">
                            <th class="border p-1 text-left">Employee / Paycheque #</th>
                            <th class="border p-1 text-center">Pay Date</th>
                            <th class="border p-1 text-right">Gross Pay</th>
                            <th class="border p-1 text-right">Income Tax</th>
                            <th class="border p-1 text-right">CPP (Emp)</th>
                            <th class="border p-1 text-right">CPP (Empr)</th>
                            <th class="border p-1 text-right">EI (Emp)</th>
                            <th class="border p-1 text-right">EI (Empr)</th>
                            <th class="border p-1 text-right">Net Pay</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payStubs.map((stub, index) => {
                            const employee = getEmployee(stub.employee_id);
                            const incomeTax = (stub.federal_tax || 0) + (stub.provincial_tax || 0);
                            const eiEmployer = (stub.ei_deduction || 0) * employerMultiplier;
                            const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown';
                            const paychequeNum = stub.paycheque_number || 'N/A';

                            return `
                            <tr class="${index % 2 === 0 ? 'bg-gray-50' : ''}">
                                <td class="border p-1">
                                    <div class="font-semibold">${employeeName}</div>
                                    <div class="text-gray-500 text-xs">${paychequeNum}</div>
                                </td>
                                <td class="border p-1 text-center">${formatDateMT(stub.pay_date)}</td>
                                <td class="border p-1 text-right">$${(stub.gross_pay || 0).toFixed(2)}</td>
                                <td class="border p-1 text-right">$${incomeTax.toFixed(2)}</td>
                                <td class="border p-1 text-right">$${(stub.cpp_deduction || 0).toFixed(2)}</td>
                                <td class="border p-1 text-right">$${(stub.cpp_deduction || 0).toFixed(2)}</td>
                                <td class="border p-1 text-right">$${(stub.ei_deduction || 0).toFixed(2)}</td>
                                <td class="border p-1 text-right">$${eiEmployer.toFixed(2)}</td>
                                <td class="border p-1 text-right">$${(stub.net_pay || 0).toFixed(2)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="font-bold bg-gray-100">
                            <td class="border p-1" colspan="2">TOTALS:</td>
                            <td class="border p-1 text-right">$${remittance.total_gross_pay.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${remittance.total_income_tax.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${remittance.total_cpp_employee.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${remittance.total_cpp_employer.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${remittance.total_ei_employee.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${remittance.total_ei_employer.toFixed(2)}</td>
                            <td class="border p-1 text-right">$${payStubs.reduce((sum, stub) => sum + (stub.net_pay || 0), 0).toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>


        </div>
        <div class="text-center mt-8 no-print">
            <button onclick="window.print()" class="bg-blue-600 text-white px-6 py-2 rounded-lg shadow-md hover:bg-blue-700 transition">Print or Save as PDF</button>
        </div>
    </body>
    </html>
    `;
};

export default RemittanceReportPDF;
