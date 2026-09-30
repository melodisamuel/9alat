// Target roles with weighting
const TARGET_ROLES = [
  'qa engineer',
  'software qa engineer',
  'quality assurance engineer',
  'software test engineer',
  'api test engineer',
  'backend qa engineer',
  'integration test engineer',
  'qa automation engineer',
  'mobile qa engineer',
  'qa analyst',
  'quality analyst',
  'qa specialist',
  'test engineer'
];

// Technical experience keywords
const TECHNICAL_KEYWORDS = [
  'api testing',
  'rest api testing',
  'rest api',
  'postman',
  'backend testing',
  'mobile testing',
  'web testing',
  'functional testing',
  'integration testing',
  'regression testing',
  'exploratory testing',
  'system testing',
  'end-to-end testing',
  'e2e testing',
  'database testing',
  'authentication',
  'authorization',
  'rbac',
  'bola',
  'idor',
  'webhook testing',
  'payment testing',
  'idempotency',
  'concurrency testing',
  'selenium',
  'appium',
  'mocha',
  'chai',
  'git',
  'github',
  'github actions',
  'jira',
  'agile',
  'scrum'
];

// Domain keywords
const DOMAINS = [
  'fintech',
  'e-commerce',
  'ecommerce',
  'marketplace',
  'proptech',
  'real estate',
  'saas',
  'mobile',
  'logistics',
  'supply chain',
  'security'
];

// Exclusion keywords (Hardware, Embedded, Aerospace, etc.)
const EXCLUSION_KEYWORDS = [
  'embedded hardware',
  'firmware',
  'aerospace certification',
  'do-178c',
  'hardware qa',
  'embedded systems',
  'microcontroller'
];

// Experience level patterns (3-5 years)
const EXP_PATTERNS = [
  /3\s*[-–to]\s*5\s*years/i,
  /3\+\s*years/i,
  /4\+\s*years/i,
  /5\+\s*years/i,
  /3-5\s*yrs/i,
  /mid\s*[- ]?level/i
];

/**
 * Evaluates a job listing against the candidate's QA profile.
 * @param {Object} job - The job object containing title, description, location, company, etc.
 * @returns {Object} Structured match evaluation result
 */
function evaluateJob(job) {
  if (!job) {
    return {
      score: 0,
      matchedKeywords: [],
      reasons: ['Invalid job object'],
      excludedReasons: []
    };
  }

  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const location = (job.location || '').toLowerCase();
  const fullText = `${title} ${description} ${location}`;

  let score = 0;
  const matchedKeywords = [];
  const reasons = [];
  const excludedReasons = [];

  // 1. Evaluate Job Title (Max 40 points)
  let titleScore = 0;
  const directTitleMatch = TARGET_ROLES.find(role => title.includes(role));
  if (directTitleMatch) {
    titleScore = 40;
    reasons.push(`Title matches target role: "${directTitleMatch}" (+40 pts)`);
  } else if (title.includes('qa') || title.includes('test') || title.includes('quality assurance')) {
    titleScore = 25;
    reasons.push('Title contains general QA/Testing terms (+25 pts)');
  }

  score += titleScore;

  // 2. Evaluate Technical Keywords (Max 30 points)
  const uniqueMatchedKeywords = new Set();
  TECHNICAL_KEYWORDS.forEach(keyword => {
    if (fullText.includes(keyword)) {
      uniqueMatchedKeywords.add(keyword);
    }
  });

  const matchedKeywordsList = Array.from(uniqueMatchedKeywords);
  const keywordPoints = matchedKeywordsList.length * 3;
  const clampedKeywordScore = Math.min(30, keywordPoints);

  if (clampedKeywordScore > 0) {
    score += clampedKeywordScore;
    matchedKeywords.push(...matchedKeywordsList);
    reasons.push(`Matched ${matchedKeywordsList.length} technical skill(s) (+${clampedKeywordScore} pts)`);
  }

  // 3. Evaluate Experience Level (3-5 years) (Max 10 points)
  const matchesExp = EXP_PATTERNS.some(pattern => pattern.test(fullText));
  if (matchesExp) {
    score += 10;
    reasons.push('Experience requirement matches target level (~3-5 years) (+10 pts)');
  }

  // 4. Evaluate Remote Compatibility (Max 10 points)
  if (location.includes('remote') || fullText.includes('work from home') || fullText.includes('telecommute') || fullText.includes('remote')) {
    score += 10;
    reasons.push('Job supports remote work (+10 pts)');
  }

  // 5. Evaluate Domain Alignment (Max 10 points)
  const matchedDomains = DOMAINS.filter(domain => fullText.includes(domain));
  if (matchedDomains.length > 0) {
    const domainScore = Math.min(10, matchedDomains.length * 5);
    score += domainScore;
    reasons.push(`Matches relevant domain(s): ${matchedDomains.join(', ')} (+${domainScore} pts)`);
  }

  // 6. Check Exclusions / Non-matching Domain Penalties
  EXCLUSION_KEYWORDS.forEach(exclusion => {
    if (fullText.includes(exclusion)) {
      excludedReasons.push(`Role mentions hardware/embedded domain: "${exclusion}" (-35 pts)`);
      score -= 35;
    }
  });

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    matchedKeywords,
    reasons,
    excludedReasons
  };
}

module.exports = {
  evaluateJob,
  TARGET_ROLES,
  TECHNICAL_KEYWORDS,
  DOMAINS,
  EXCLUSION_KEYWORDS
};
