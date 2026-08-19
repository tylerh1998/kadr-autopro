// Shared by T4/T4A PDF generation and the CRA XML exporter so both outputs are
// always built from the same numbers - a stub's totals can't drift between them.
export function calculateT4Totals(stubs, constants) {
  const totals = stubs.reduce((acc, stub) => {
    acc.gross += stub.gross_pay || 0;
    acc.cpp += stub.cpp_deduction || 0;
    acc.cpp2 += stub.cpp2_deduction || 0;
    acc.ei += stub.ei_deduction || 0;
    acc.tax += (stub.federal_tax || 0) + (stub.provincial_tax || 0);
    return acc;
  }, { gross: 0, cpp: 0, cpp2: 0, ei: 0, tax: 0 });

  // Employer CPP matches the employee contribution 1:1; employer EI uses the
  // per-year multiplier - same math as the remittance calculator (RemittanceDialog.jsx).
  const employerEi = totals.ei * (constants.EI_RATE_EMPLOYER_MULTIPLIER ?? 1.4);

  return {
    box14: totals.gross,
    box16: totals.cpp,
    box16A: totals.cpp2,
    box18: totals.ei,
    box22: totals.tax,
    box24: Math.min(totals.gross, constants.EI_MAX_INSURABLE_EARNINGS),
    box26: Math.min(totals.gross, constants.CPP_MAX_PENSIONABLE_EARNINGS),
    box52: 0, // Assuming no pension adjustment
    employerCpp: totals.cpp,
    employerEi: Math.round(employerEi * 100) / 100,
  };
}
