import type { Opportunity } from './types';

/**
 * BUNDLED DEMO ROWS — not real opportunities.
 *
 * These exist so the responsive shell, the offline path and the layout can be
 * reviewed without a Firebase project. They are NOT evidence: the `sourceUrl`
 * values are placeholders, and every row is marked `demoSeed: true` so the UI
 * can label it.
 *
 * Real records come from Firestore, written by the Hunter API from verified
 * source records (see `@ntk/hunter-core`, `docs/BUILD_RECEIPT_M3.md`).
 */
/**
 * Demo rows carry NO cost evidence, so every one of them is explicitly
 * `unconfirmed_no_cost_found` (applied below). A placeholder must never model a
 * "Confirmed $0" claim that the app cannot back with evidence.
 */
const demoRows: Omit<Opportunity, 'capitalStatus'>[] = [
  {
    id: 'demo-react-landing-page',
    title: 'React Developer — Landing Page',
    provider: 'Demo client (placeholder)',
    category: 'Development',
    description:
      'Build a responsive landing page and integrate a simple API. Fixed deliverables, remote work and direct payment after accepted milestones.',
    sourceUrl: 'https://example.invalid/demo/react-landing-page',
    sourceAttribution: 'Demo data',
    requiresLinkBack: false,
    rewardMin: 500,
    rewardMax: 1500,
    currency: 'USD',
    rewardBasis: 'one-off',
    rewardText: '$500 – $1,500 one-off',
    remote: true,
    directPay: true,
    noCvRequired: 'unknown',
    zeroCapital: true,
    countries: ['GLOBAL'],
    skills: ['React', 'Responsive UI', 'API integration'],
    requirements: ['React or Next.js', 'Responsive UI', 'API integration', 'Clear communication'],
    paymentMethods: ['Wise', 'PayPal', 'Bank transfer'],
    deadline: null,
    rankScore: 96,
    trustScore: 94,
    confidence: 92,
    riskLevel: 'low',
    evidenceCount: 4,
    evidence: [
      { label: 'Official source', value: 'Demo placeholder — not a real capture', state: 'unknown' },
      { label: 'Payment terms', value: 'Fixed-price milestones (demo)', state: 'established' },
      { label: 'Upfront cost', value: '$0 assumed for the demo row', state: 'unknown' }
    ],
    discoveredAt: '2026-10-14T11:48:00.000Z',
    discoveredLabel: '12 min ago',
    demoSeed: true
  },
  {
    id: 'demo-ai-response-eval',
    title: 'AI Response Evaluator',
    provider: 'Demo platform (placeholder)',
    category: 'AI Training',
    description:
      'Evaluate AI answers for clarity, correctness and usefulness. Qualification is based on a skills assessment rather than a traditional CV.',
    sourceUrl: 'https://example.invalid/demo/ai-evaluator',
    sourceAttribution: 'Demo data',
    requiresLinkBack: false,
    rewardMin: 15,
    rewardMax: 45,
    currency: 'USD',
    rewardBasis: 'hour',
    rewardText: '$15 – $45 per hour',
    remote: true,
    directPay: true,
    noCvRequired: true,
    zeroCapital: true,
    countries: ['NG', 'GB', 'CA', 'US'],
    skills: ['Written English', 'Attention to detail'],
    requirements: ['Strong written English', 'Attention to detail', 'Pass qualification test'],
    paymentMethods: ['PayPal', 'Wise'],
    deadline: null,
    rankScore: 91,
    trustScore: 90,
    confidence: 89,
    riskLevel: 'low',
    evidenceCount: 3,
    evidence: [
      { label: 'Platform identity', value: 'Demo placeholder — not a real capture', state: 'unknown' },
      { label: 'No CV', value: 'Skills test accepted (demo)', state: 'established' }
    ],
    discoveredAt: '2026-10-14T11:29:00.000Z',
    discoveredLabel: '31 min ago',
    demoSeed: true
  },
  {
    id: 'demo-mobile-app-test',
    title: 'Mobile App Usability Test',
    provider: 'Demo panel (placeholder)',
    category: 'Testing',
    description: 'Test a mobile product, complete scripted tasks and submit structured usability feedback.',
    sourceUrl: 'https://example.invalid/demo/mobile-test',
    sourceAttribution: 'Demo data',
    requiresLinkBack: false,
    rewardMin: 10,
    rewardMax: 60,
    currency: 'USD',
    rewardBasis: 'one-off',
    rewardText: '$10 – $60 one-off',
    remote: true,
    directPay: true,
    noCvRequired: 'unknown',
    zeroCapital: true,
    countries: ['NG', 'GB', 'CA', 'US'],
    skills: ['Usability testing', 'Written feedback'],
    requirements: ['Android or iOS device', 'Microphone', 'Clear feedback'],
    paymentMethods: ['PayPal'],
    deadline: null,
    rankScore: 84,
    trustScore: 88,
    confidence: 86,
    riskLevel: 'low',
    evidenceCount: 3,
    evidence: [{ label: 'Payment', value: 'Per accepted test (demo)', state: 'established' }],
    discoveredAt: '2026-10-14T10:59:00.000Z',
    discoveredLabel: '1 hr ago',
    demoSeed: true
  },
  {
    id: 'demo-web3-doc-bounty',
    title: 'Web3 Documentation Bounty',
    provider: 'Demo protocol (placeholder)',
    category: 'Web3',
    description:
      'Improve developer documentation for an open-source Web3 SDK. No token purchase or staking required.',
    sourceUrl: 'https://example.invalid/demo/web3-docs',
    sourceAttribution: 'Demo data',
    requiresLinkBack: false,
    rewardMin: 200,
    rewardMax: 500,
    currency: 'USD',
    rewardBasis: 'one-off',
    rewardText: '$200 – $500 one-off',
    remote: true,
    directPay: 'unknown',
    noCvRequired: 'unknown',
    zeroCapital: true,
    countries: ['GLOBAL'],
    skills: ['Technical writing', 'GitHub workflow'],
    requirements: ['Technical writing', 'GitHub workflow', 'Basic Web3 familiarity'],
    paymentMethods: ['USDC', 'Bank transfer'],
    deadline: null,
    rankScore: 79,
    trustScore: 87,
    confidence: 82,
    riskLevel: 'medium',
    evidenceCount: 3,
    evidence: [{ label: 'Reward', value: 'Published bounty amount (demo)', state: 'established' }],
    discoveredAt: '2026-10-14T09:59:00.000Z',
    discoveredLabel: '2 hrs ago',
    demoSeed: true
  }
];

/**
 * The bundled rows, each stamped with the honest cost status for placeholder
 * data. Real records get their status from the pipeline, never from here.
 */
export const demoSeedOpportunities: Opportunity[] = demoRows.map(row => ({
  ...row,
  capitalStatus: 'unconfirmed_no_cost_found' as const
}));

/**
 * Backwards-compatible alias used by the shell.
 * Prefer `demoSeedOpportunities` in new code so the intent is visible.
 */
export const opportunities = demoSeedOpportunities;

/** True when every bundled row is explicitly marked as demo data. */
export function allRowsAreMarkedDemo(rows: Opportunity[] = demoSeedOpportunities): boolean {
  return rows.every(row => row.demoSeed === true);
}
