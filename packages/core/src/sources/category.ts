import type { OpportunityCategory } from '../types.js';

/**
 * Product taxonomy assignment.
 *
 * `category` is the product's own classification, NOT a claim the source made,
 * so it is derived here and recorded as a `text-pattern` assertion (or an
 * `absent` one when nothing matched). It never overrides a structured field the
 * source itself published.
 *
 * Rules are ordered: the first matching group wins, so the most specific
 * product intent (AI training work, paid testing, bounties) is checked before
 * the broad engineering bucket.
 */

interface CategoryRule {
  category: OpportunityCategory;
  re: RegExp;
  note: string;
}

const RULES: CategoryRule[] = [
  {
    category: 'AI Training',
    re: /\b(?:ai|llm|model)\s*(?:trainer|training|evaluat|annotat)|data\s*annotat|rlhf|red[\s-]?team\w*\s*(?:ai|model)|prompt\s*(?:evaluat|writ)|\b(?:evaluate|rating|rate)\s+(?:ai|model|llm)\b/i,
    note: 'AI training / evaluation wording'
  },
  {
    category: 'Testing',
    re: /\b(?:usability|user)\s*(?:test|research)|qa\s*(?:test|engineer)|\bsoftware\s+tester\b|test\s*(?:case|scenario)s?\b[^.]{0,30}\b(?:write|create|design)\b|bug\s*bounty/i,
    note: 'Testing / QA wording'
  },
  {
    category: 'Bounty',
    re: /\bbount(?:y|ies)\b|\[bounty\]|reward\s+for\s+(?:fixing|a\s+fix|resolving)/i,
    note: 'Bounty wording'
  },
  {
    category: 'Research',
    re: /\b(?:research|study|survey)\s*(?:participant|assistant|study|project|fellow)|\bparticipate\s+in\s+(?:a\s+)?(?:research|study|survey)\b/i,
    note: 'Research participation wording'
  },
  {
    category: 'Writing',
    re: /\b(?:copywriter|content\s+writer|technical\s+writer|editor|proofread\w*|translat\w*|ghostwrit\w*)\b/i,
    note: 'Writing / translation wording'
  },
  {
    category: 'Design',
    re: /\b(?:ui|ux|graphic|product|visual|brand)\s*(?:designer|design)|illustrat\w+|figma\b/i,
    note: 'Design wording'
  },
  {
    category: 'Web3',
    re: /\b(?:web3|blockchain|solidity|smart\s*contract|defi|nft|on[\s-]?chain|dao)\b/i,
    note: 'Web3 wording'
  },
  {
    category: 'Microtask',
    re: /\b(?:micro[\s-]?task|data\s*entry|transcription|image\s*tagging|short\s*task)\b/i,
    note: 'Microtask wording'
  },
  {
    category: 'Development',
    re: /\b(?:software|frontend|front[\s-]?end|backend|back[\s-]?end|full[\s-]?stack|developer|engineer|programmer|devops|data\s+(?:scientist|engineer|analyst)|python|javascript|typescript|react|node\.?js|golang|rust|java|php|sql|api\s+integration)\b/i,
    note: 'Software development wording'
  },
  {
    category: 'Grant',
    re: /\b(?:grant|scholarship|fellowship\s+stipend|stipend)\b/i,
    note: 'Grant / stipend wording'
  },
  {
    category: 'Competition',
    re: /\b(?:hackathon|competition|contest|prize\s+pool|leaderboard)\b/i,
    note: 'Competition wording'
  }
];

export interface CategoryGuess {
  category: OpportunityCategory;
  /** Rule note when a keyword matched, else null. */
  matched: string | null;
}

export function inferCategory(text: string): CategoryGuess {
  for (const rule of RULES) {
    if (rule.re.test(text)) return { category: rule.category, matched: rule.note };
  }
  return { category: 'Other', matched: null };
}

/** Categories the product treats as competitive and hides by default. */
export function isCompetitiveText(text: string): boolean {
  return /\b(?:hackathon|competition|contest|prize\s+pool|leaderboard|winner\s+announced)\b/i.test(text);
}
