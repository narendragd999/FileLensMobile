/**
 * smartTagService.ts — Comprehensive 65+ Smart Tag Taxonomy & Heuristics
 */

export interface TagCategory {
  id: string;
  name: string;
  icon: string;
  tags: string[];
}

export const TAG_CATEGORIES: TagCategory[] = [
  {
    id: 'identity',
    name: 'Identity & Govt',
    icon: 'card-outline',
    tags: [
      'Aadhaar Card',
      'PAN Card',
      'Passport',
      'Voter ID',
      'Driving License',
      'Ration Card',
      'Birth Certificate',
      'Marriage Certificate',
      'Domicile Certificate',
      'Visa / Immigration',
    ],
  },
  {
    id: 'finance',
    name: 'Finance & Tax',
    icon: 'cash-outline',
    tags: [
      'Tax Invoice',
      'Cash Receipt',
      'Bank Statement',
      'Salary Slip',
      'ITR / Form 16',
      'GST Return',
      'TDS Certificate',
      'Investment / Mutual Fund',
      'Loan / EMI',
      'Cheque',
      'Fixed Deposit',
      'Credit Card Bill',
    ],
  },
  {
    id: 'medical',
    name: 'Medical & Health',
    icon: 'medkit-outline',
    tags: [
      'Prescription (Rx)',
      'Lab Test Report',
      'Doctor Consultation',
      'Discharge Summary',
      'Vaccination Record',
      'Pharmacy Bill',
      'Health Checkup',
    ],
  },
  {
    id: 'vehicle',
    name: 'Vehicle & Travel',
    icon: 'car-outline',
    tags: [
      'Vehicle RC',
      'Pollution (PUC)',
      'Vehicle Insurance',
      'Fastag / Toll',
      'Flight Ticket',
      'Train Ticket',
      'Boarding Pass',
      'Hotel Booking',
      'Vehicle Service Bill',
    ],
  },
  {
    id: 'insurance',
    name: 'Insurance',
    icon: 'shield-checkmark-outline',
    tags: [
      'Health Insurance',
      'Life Insurance',
      'Motor Insurance',
      'Policy Renewal',
      'Insurance Claim',
    ],
  },
  {
    id: 'property',
    name: 'Property & Bills',
    icon: 'home-outline',
    tags: [
      'Rent Agreement',
      'Sale Deed / Registry',
      'Electricity Bill',
      'Water Bill',
      'Gas Bill',
      'Broadband Bill',
      'Appliance Warranty',
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: 'school-outline',
    tags: [
      'Degree / Diploma',
      'Marksheet / Transcript',
      'Student ID',
      'Admission Letter',
      'Fee Receipt',
      'Course Certificate',
    ],
  },
  {
    id: 'career',
    name: 'Career & Business',
    icon: 'briefcase-outline',
    tags: [
      'Resume / CV',
      'Offer Letter',
      'Experience Letter',
      'Appraisal Letter',
      'Business Contract',
      'NDA / Agreement',
      'Quotation / PO',
      'GST Certificate',
    ],
  },
  {
    id: 'status',
    name: 'Status & Priority',
    icon: 'bookmark-outline',
    tags: [
      '⭐ Important',
      '🔴 Urgent',
      '🔒 Confidential',
      '💼 Work / Office',
      '🏠 Personal / Family',
      '📝 Notes / Draft',
    ],
  },
];

export const ALL_PRESET_TAGS: string[] = TAG_CATEGORIES.flatMap((c) => c.tags);

interface TagRule {
  tag: string;
  patterns: RegExp[];
  score: number;
}

const DETECTION_RULES: TagRule[] = [
  // ─── Identity ──────────────────────────────────────────────────
  {
    tag: 'Aadhaar Card',
    patterns: [/aadhaar|aadhar|uidai|unique identification authority|mera aadhaar|आधार|विशिष्ट पहचान/i, /\d{4}\s\d{4}\s\d{4}/],
    score: 10,
  },
  {
    tag: 'PAN Card',
    patterns: [/permanent account number|incometax department|govt of india.*pan|pan card|स्थायी खाता संख्या|आयकर विभाग/i, /[a-z]{5}\d{4}[a-z]/i],
    score: 10,
  },
  {
    tag: 'Driving License',
    patterns: [/driving licen[cs]e|motor vehicles department|dl no|transport department|ड्राइविंग लाइसेंस|सारथी|परिवहन/i],
    score: 10,
  },
  {
    tag: 'Passport',
    patterns: [/republic of india.*passport|passport no|given name.*surname.*nationality|पासपोर्ट|विदेश मंत्रालय/i],
    score: 10,
  },
  {
    tag: 'Voter ID',
    patterns: [/election commission of india|elector.*photo identity|epic no|मतदाता पहचान पत्र|निर्वाचन आयोग/i],
    score: 10,
  },
  {
    tag: 'Ration Card',
    patterns: [/ration card|food and civil supplies|fps code|राशन कार्ड|खाद्य एवं रसद/i],
    score: 10,
  },

  // ─── Finance & Tax ─────────────────────────────────────────────
  {
    tag: 'Tax Invoice',
    patterns: [/tax invoice|gstin|cgst|sgst|igst|hsn\/sac|taxable value|invoice no|बिल|चालान|रसीद/i],
    score: 8,
  },
  {
    tag: 'ITR / Form 16',
    patterns: [/income tax return|assessment year|form 16|part a.*part b|itr-\d|आयकर विवरणी/i],
    score: 9,
  },
  {
    tag: 'Salary Slip',
    patterns: [/payslip|salary slip|earnings.*deductions|basic pay|hra|provident fund|net pay|वेतन पर्ची/i],
    score: 9,
  },
  {
    tag: 'Bank Statement',
    patterns: [/account statement|account summary|transaction date|opening balance|closing balance|ifsc|passbook|बैंक खाता|पासबुक/i],
    score: 8,
  },
  {
    tag: 'Cash Receipt',
    patterns: [/receipt|received with thanks|amount received|payment receipt|bill no|भुगतान रसीद/i],
    score: 6,
  },
  {
    tag: 'GST Return',
    patterns: [/gstr-1|gstr-3b|goods and services tax return|arn no/i],
    score: 9,
  },
  {
    tag: 'Investment / Mutual Fund',
    patterns: [/mutual fund|folio no|nav|sip|demat|zerodha|groww|fixed deposit|fd advice|शेयर|म्यूचुअल फंड/i],
    score: 9,
  },

  // ─── Medical ───────────────────────────────────────────────────
  {
    tag: 'Prescription (Rx)',
    patterns: [/\brx\b|prescription|dr\.|m\.b\.b\.s|m\.d\.|dosage|tablet|capsule|syrup|consultation|दवा पर्ची|चिकित्सक/i],
    score: 9,
  },
  {
    tag: 'Lab Test Report',
    patterns: [/diagnostic|pathology|blood test|hemoglobin|specimen|investigation report|normal range|जांच रिपोर्ट|रक्त परीक्षण/i],
    score: 9,
  },
  {
    tag: 'Discharge Summary',
    patterns: [/discharge summary|admission date|discharge date|diagnosis|hospital course|अस्पताल डिस्चार्ज/i],
    score: 10,
  },

  // ─── Vehicle ───────────────────────────────────────────────────
  {
    tag: 'Vehicle RC',
    patterns: [/registration certificate|chassis no|engine no|mfg date|unladen wt|seating capacity|rto|वाहन पंजीयन|आरसी/i],
    score: 9,
  },
  {
    tag: 'Pollution (PUC)',
    patterns: [/pollution under control|puc certificate|emission norms|co %|hydrocarbon|प्रदूषण नियंत्रण/i],
    score: 10,
  },
  {
    tag: 'Vehicle Insurance',
    patterns: [/motor insurance|two wheeler policy|private car package|idv|third party liability|वाहन बीमा/i],
    score: 9,
  },
  {
    tag: 'Flight Ticket',
    patterns: [/flight ticket|e-ticket|airline|boarding pass|terminal|pnr|seat no|departure|विमान टिकट/i],
    score: 9,
  },
  {
    tag: 'Train Ticket',
    patterns: [/irctc|electronic reservation slip|train no|coach|berth|quota|pnr|रेलवे टिकट|यात्रा/i],
    score: 9,
  },

  // ─── Utilities & Property ──────────────────────────────────────
  {
    tag: 'Electricity Bill',
    patterns: [/electricity|power distribution|consumer no|meter no|kwh|units consumed|connected load|बिजली बिल|विद्युत वितरण/i],
    score: 9,
  },
  {
    tag: 'Gas Bill',
    patterns: [/gas bill|lpg|cylinder|indane|bharat gas|hp gas|consumer number|गैस बिल/i],
    score: 9,
  },
  {
    tag: 'Water Bill',
    patterns: [/water bill|jal board|water supply|पानी का बिल|जल बोर्ड/i],
    score: 9,
  },
  {
    tag: 'Rent Agreement',
    patterns: [/rent agreement|lease agreement|lessor|lessee|monthly rent|security deposit|tenancy|किरायानामा|किराया अनुबंध/i],
    score: 10,
  },
  {
    tag: 'Appliance Warranty',
    patterns: [/warranty card|guarantee card|model no|serial no|warranty period|extended warranty|वारंटी कार्ड/i],
    score: 8,
  },

  // ─── Career & Education ────────────────────────────────────────
  {
    tag: 'Resume / CV',
    patterns: [/curriculum vitae|resume|work experience|skills|education|projects|summary|contact info|बायोडाटा/i],
    score: 9,
  },
  {
    tag: 'Offer Letter',
    patterns: [/offer letter|letter of intent|appointment letter|annual ctc|joining date|we are pleased to offer|नियुक्ति पत्र/i],
    score: 9,
  },
  {
    tag: 'Marksheet / Transcript',
    patterns: [/statement of marks|marksheet|grade card|semester|credits|cgpa|pass percentage|board of education|अंकपत्र|परीक्षा परिणाम/i],
    score: 9,
  },
  {
    tag: 'Degree / Diploma',
    patterns: [/degree certificate|conferred upon|has been admitted to the degree|bachelor of|master of|उपाधि प्रमाण पत्र/i],
    score: 9,
  },
];

/**
 * Detect smart tags based on file name and OCR/content text
 */
export function detectSmartTags(
  fileName: string,
  contentText?: string | null,
  ocrText?: string | null
): string[] {
  const haystack = `${fileName} ${contentText || ''} ${ocrText || ''}`.toLowerCase();
  const scoredTags = new Map<string, number>();

  for (const rule of DETECTION_RULES) {
    let matchCount = 0;
    for (const pat of rule.patterns) {
      if (pat.test(haystack)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const totalScore = rule.score + (matchCount - 1) * 3;
      scoredTags.set(rule.tag, (scoredTags.get(rule.tag) || 0) + totalScore);
    }
  }

  // Sort tags by highest confidence score
  const sorted = Array.from(scoredTags.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Return top 4 distinct suggestions
  return sorted.slice(0, 4);
}