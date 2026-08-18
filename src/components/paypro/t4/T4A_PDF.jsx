
// Q2: real company identity + CRA Business/Payroll (RP) account number, replacing source's
// fake "YOUR COMPANY INC." placeholder - same hardcode convention used throughout this codebase.
const T4A_PDF = (t4SummaryData, year) => {
    // Calculate totals across all employees
    const grandTotals = t4SummaryData.reduce((acc, item) => {
        acc.totalEmploymentIncome += item.t4Data.box14 || 0;
        acc.totalCPPContributions += item.t4Data.box16 || 0;
        acc.totalEIContributions += item.t4Data.box18 || 0;
        acc.totalIncomeTax += item.t4Data.box22 || 0;
        return acc;
    }, {
        totalEmploymentIncome: 0,
        totalCPPContributions: 0,
        totalEIContributions: 0,
        totalIncomeTax: 0
    });

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>T4A Summary - ${year}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { -webkit-print-color-adjust: exact; font-family: 'Courier New', Courier, monospace; }
            .t4a-box { border: 1px solid black; padding: 4px; }
            .t4a-label { font-size: 8px; font-weight: bold; margin-bottom: 2px; }
            .t4a-value { font-size: 11px; }
            @media print {
                body { margin: 0.5in; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body class="bg-gray-100 p-8">
        <div class="max-w-6xl mx-auto bg-white p-6 border-2 border-black">
            <div class="flex justify-between items-center border-b-2 border-black pb-3 mb-4">
                <div>
                    <h1 class="text-3xl font-bold">T4A Summary Report</h1>
                    <h2 class="text-xl font-bold">Statement of Pension, Retirement, Annuity, and Other Income</h2>
                </div>
                <div class="text-right">
                    <p class="font-bold text-3xl">${year}</p>
                    <p class="text-sm">Canada Revenue Agency</p>
                </div>
            </div>

            <!-- Company Information -->
            <div class="mb-6">
                <div class="t4a-box">
                    <span class="t4a-label">Payer's name and address</span>
                    <div class="text-sm mt-1">
                        <p class="font-bold">KEN'S AUTO & DIESEL REPAIR</p>
                        <p>5002 49 AVE - PO BOX 160</p>
                        <p>DEWBERRY, AB T0B 1G0</p>
                        <p>780-847-3002</p>
                    </div>
                </div>
                <div class="t4a-box mt-1">
                    <span class="t4a-label">Business/Payroll (RP) Account Number</span>
                    <span class="t4a-value">893497602RP0001</span>
                </div>
            </div>

            <!-- Summary Totals -->
            <div class="grid grid-cols-4 gap-2 mb-6">
                <div class="t4a-box bg-yellow-100">
                    <span class="t4a-label">Total Employment Income</span>
                    <span class="t4a-value font-bold text-lg">$${grandTotals.totalEmploymentIncome.toFixed(2)}</span>
                </div>
                <div class="t4a-box bg-blue-100">
                    <span class="t4a-label">Total CPP Contributions</span>
                    <span class="t4a-value font-bold text-lg">$${grandTotals.totalCPPContributions.toFixed(2)}</span>
                </div>
                <div class="t4a-box bg-green-100">
                    <span class="t4a-label">Total EI Contributions</span>
                    <span class="t4a-value font-bold text-lg">$${grandTotals.totalEIContributions.toFixed(2)}</span>
                </div>
                <div class="t4a-box bg-red-100">
                    <span class="t4a-label">Total Income Tax</span>
                    <span class="t4a-value font-bold text-lg">$${grandTotals.totalIncomeTax.toFixed(2)}</span>
                </div>
            </div>

            <!-- Employee Breakdown -->
            <div class="mb-4">
                <h3 class="text-lg font-bold mb-2 bg-gray-700 text-white p-2">Employee Breakdown</h3>
                <table class="w-full border-collapse border text-sm">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="border p-2 text-left">Employee Name</th>
                            <th class="border p-2 text-left">Employee ID</th>
                            <th class="border p-2 text-right">Employment Income</th>
                            <th class="border p-2 text-right">CPP Contributions</th>
                            <th class="border p-2 text-right">EI Contributions</th>
                            <th class="border p-2 text-right">Income Tax</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${t4SummaryData.map(item => `
                            <tr>
                                <td class="border p-2 font-medium">${item.employee.first_name} ${item.employee.last_name}</td>
                                <td class="border p-2">${item.employee.employee_id}</td>
                                <td class="border p-2 text-right">$${(item.t4Data.box14 || 0).toFixed(2)}</td>
                                <td class="border p-2 text-right">$${(item.t4Data.box16 || 0).toFixed(2)}</td>
                                <td class="border p-2 text-right">$${(item.t4Data.box18 || 0).toFixed(2)}</td>
                                <td class="border p-2 text-right">$${(item.t4Data.box22 || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        <tr class="bg-gray-100 font-bold">
                            <td class="border p-2" colspan="2">TOTALS</td>
                            <td class="border p-2 text-right">$${grandTotals.totalEmploymentIncome.toFixed(2)}</td>
                            <td class="border p-2 text-right">$${grandTotals.totalCPPContributions.toFixed(2)}</td>
                            <td class="border p-2 text-right">$${grandTotals.totalEIContributions.toFixed(2)}</td>
                            <td class="border p-2 text-right">$${grandTotals.totalIncomeTax.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Notes -->
            <div class="border-t-2 border-black mt-6 pt-4">
                <div class="text-xs">
                    <p class="font-bold mb-2">Notes:</p>
                    <ul class="list-disc pl-5 space-y-1">
                        <li>This T4A summary report provides an overview of all T4 slips generated for the ${year} tax year.</li>
                        <li>Individual T4 slips have been generated for each employee listed above.</li>
                        <li>Please verify all amounts before submitting to Canada Revenue Agency.</li>
                        <li>This summary is for internal record-keeping purposes.</li>
                    </ul>
                </div>
            </div>

            <div class="text-center mt-6 text-xs">
                <p>Generated on: ${new Date().toLocaleDateString('en-CA')} at ${new Date().toLocaleTimeString('en-CA')}</p>
                <p>Total Employees Processed: ${t4SummaryData.length}</p>
            </div>
        </div>

        <div class="text-center mt-8 no-print">
            <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded">Print or Save as PDF</button>
        </div>
    </body>
    </html>
    `;
};

export default T4A_PDF;
