
// Q2: real company identity + CRA Business/Payroll (RP) account number, replacing source's
// fake placeholder - same hardcode convention as every other PDF in this codebase.
// D5: SIN is normalized to CRA's standard "XXX XXX XXX" grouping at render time regardless
// of how it happens to be stored (dev's bare digits vs. production's space-separated string).
const formatSin = (sin) => {
    const digits = (sin || '').replace(/\D/g, '');
    if (digits.length !== 9) return '000 000 000';
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
};

const T4_PDF = (employee, year, t4Data) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>T4 - ${employee.first_name} ${employee.last_name} - ${year}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { -webkit-print-color-adjust: exact; font-family: 'Courier New', Courier, monospace; }
            .t4-box { border: 1px solid black; padding: 2px 4px; display: flex; flex-direction: column; }
            .t4-label { font-size: 8px; font-weight: bold; margin-bottom: 2px; }
            .t4-value { font-size: 12px; text-align: right; }
            @media print {
                body { margin: 0.5in; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body class="bg-gray-100 p-8">
        <div class="max-w-4xl mx-auto bg-white p-4 border-2 border-black">
            <div class="flex justify-between items-center border-b-2 border-black pb-2 mb-2">
                <div>
                    <h1 class="text-2xl font-bold">Statement of Remuneration Paid</h1>
                    <h2 class="text-xl font-bold">T4</h2>
                </div>
                <div class="text-right">
                    <p class="font-bold text-2xl">${year}</p>
                    <p class="text-sm">Canada Revenue Agency</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <!-- Left Column -->
                <div class="space-y-1">
                    <div class="t4-box">
                        <span class="t4-label">Employer's name</span>
                        <div class="text-sm mt-1 text-left">
                            <p class="font-bold">Ken's Auto & Diesel Repair</p>
                            <p>5002 49 Ave - PO Box 160, Dewberry, AB T0B 1G0</p>
                            <p>780-847-3002</p>
                        </div>
                    </div>
                    <div class="t4-box">
                        <span class="t4-label">Business/Payroll (RP) Account Number</span>
                        <span class="t4-value text-center">893497602RP0001</span>
                    </div>
                    <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box">
                            <span class="t4-label">10 - Province of employment</span>
                            <span class="t4-value text-center">AB</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">12 - Social Insurance Number</span>
                            <span class="t4-value text-center">${formatSin(employee.sin)}</span>
                        </div>
                    </div>
                    <div class="t4-box">
                        <span class="t4-label">Employee's name and address</span>
                        <div class="text-sm mt-1">
                            <p>${employee.last_name.toUpperCase()}, ${employee.first_name.toUpperCase()}</p>
                            <p>${(employee.address || 'Address not provided').toUpperCase()}</p>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="border-l-2 border-black pl-2 space-y-1">
                     <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box bg-gray-200">
                            <span class="t4-label">14 - Employment income</span>
                            <span class="t4-value">$${t4Data.box14.toFixed(2)}</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">16 - Employee's CPP contributions</span>
                            <span class="t4-value">$${t4Data.box16.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box">
                            <span class="t4-label">18 - Employee's EI premiums</span>
                            <span class="t4-value">$${t4Data.box18.toFixed(2)}</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">20 - RPP contributions</span>
                            <span class="t4-value">$0.00</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box bg-gray-200">
                            <span class="t4-label">22 - Income tax deducted</span>
                            <span class="t4-value">$${t4Data.box22.toFixed(2)}</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">24 - EI insurable earnings</span>
                            <span class="t4-value">$${t4Data.box24.toFixed(2)}</span>
                        </div>
                    </div>
                     <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box">
                            <span class="t4-label">26 - CPP/QPP pensionable earnings</span>
                            <span class="t4-value">$${t4Data.box26.toFixed(2)}</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">44 - Union dues</span>
                            <span class="t4-value">$0.00</span>
                        </div>
                    </div>
                     <div class="grid grid-cols-2 gap-1">
                        <div class="t4-box">
                            <span class="t4-label">46 - Charitable donations</span>
                            <span class="t4-value">$0.00</span>
                        </div>
                        <div class="t4-box">
                            <span class="t4-label">52 - Pension adjustment</span>
                            <span class="t4-value">$${t4Data.box52.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="border-t-2 border-black mt-2 pt-2">
                <p class="text-xs font-bold">Other Information</p>
                <div class="grid grid-cols-6 gap-1 text-xs mt-1">
                    <!-- Other boxes can be added here if needed -->
                </div>
            </div>

            <div class="border-t-2 border-black mt-2 pt-2">
                 <div class="t4-box">
                    <span class="t4-label">55 - Employee's PPIP premiums</span>
                    <span class="t4-value">$0.00</span>
                </div>
                 <div class="t4-box mt-1">
                    <span class="t4-label">56 - PPIP insurable earnings</span>
                    <span class="t4-value">$0.00</span>
                </div>
            </div>

            <div class="text-center mt-4 text-xs">
                <p>Keep one copy for your records. Attach one copy to your return.</p>
                <p>Conservez une copie pour vos dossiers. Joignez une copie à votre déclaration.</p>
            </div>
        </div>
        <div class="text-center mt-8 no-print">
            <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded">Print or Save as PDF</button>
        </div>
    </body>
    </html>
    `;
};

export default T4_PDF;
