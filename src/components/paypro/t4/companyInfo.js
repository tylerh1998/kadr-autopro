// Single source of truth for employer identity + CRA filing details, shared by
// T4_PDF, T4A_PDF, and the CRA T4 XML exporter so the three outputs can't drift
// out of sync with each other (same convention as every other hardcoded-identity
// PDF in this codebase - see T4_PDF.jsx).
export const CRA_EMPLOYER = {
  legalName: "Ken's Auto & Diesel Repair",
  addressLine1: '5002 49 Ave - PO Box 160',
  city: 'Dewberry',
  province: 'AB',
  postalCode: 'T0B 1G0',
  country: 'CAN',
  phone: '780-847-3002',
  phoneAreaCode: '780',
  phoneNumber: '847-3002',
  payrollAccountNumber: '893497602RP0001', // BN15 - T4 slip box 54 / T4Summary <bn>
  businessNumber9: '893497602', // BN9 - T619 <TransmitterAccountNumber><bn9>
};

// CRA's T619 spec requires a transmitter contact name and email on every submission.
// There's no fixed "the" contact for this (it's whoever is filing that year), so it's
// collected per-export via CraXmlExportModal rather than hardcoded here. This is just
// the pre-fill default for that modal - name/email are intentionally left blank.
export const DEFAULT_TRANSMITTER_CONTACT = {
  name: '',
  areaCode: CRA_EMPLOYER.phoneAreaCode,
  phoneNumber: CRA_EMPLOYER.phoneNumber,
  email: '',
  language: 'E', // E = English, F = French
};
