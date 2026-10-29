/**
 * Spoken forms of whole-number answers. The answer judge compares normalised
 * text and does not convert "fifty six" to "56", so integer answers carry their
 * words as acceptedAnswers (see enrichSpokenNumbers in build.js).
 */
const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function belowThousand(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return belowHundred(rest);
  return `${ONES[hundreds]} hundred${rest ? ` ${belowHundred(rest)}` : ''}`;
}

/** 56 -> 'fifty six', 3500 -> 'three thousand five hundred'. Supports 0..999999. */
export function numberToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999) throw new Error(`unsupported number ${n}`);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (!thousands) return belowThousand(rest);
  return `${belowThousand(thousands)} thousand${rest ? ` ${belowThousand(rest)}` : ''}`;
}

/** 1969 -> 'nineteen sixty nine', 1905 -> 'nineteen oh five'; null outside 1100..1999. */
export function yearToWords(n) {
  if (!Number.isInteger(n) || n < 1100 || n > 1999) return null;
  const lo = n % 100;
  const hi = belowHundred(Math.floor(n / 100));
  if (lo === 0) return `${hi} hundred`;
  return `${hi} ${lo < 10 ? `oh ${ONES[lo]}` : belowHundred(lo)}`;
}

/**
 * Every spoken form of an integer answer: '56' -> ['fifty six'],
 * '156' -> ['one hundred fifty six', 'one hundred and fifty six']; [] for non-integers.
 */
export function spokenNumberForms(answer) {
  if (!/^\d{1,6}$/.test(String(answer).trim())) return [];
  const n = Number(answer);
  const words = numberToWords(n);
  const british = words.replace(/\bhundred (?!thousand\b)/g, 'hundred and ');
  return [...new Set([words, british, yearToWords(n)])].filter(Boolean);
}
