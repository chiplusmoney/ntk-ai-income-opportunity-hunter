# Recorded provider fixtures

These files are **trimmed captures of real provider responses**, taken on the
date in `CAPTURED_AT.json`. The adapter tests run against them, so the tests fail
when a provider changes its real shape rather than when a hand-written mock
drifts from the code.

Regenerate from scratch (this makes real outbound requests):

```bash
cd WORKING
node tools/capture-fixtures.mjs
```

## What was trimmed

| File | Origin | Trimming |
|------|--------|----------|
| `remotive.json` | `https://remotive.com/api/remote-jobs` | 2 jobs with a salary and 1 without; tags capped at 8; descriptions cut to 1200 chars |
| `remoteok.json` | `https://remoteok.com/api` | element 0 (the legal notice) kept verbatim; 1 job with `salary_min` and 1 without; descriptions cut to 1200 chars |
| `arbeitnow.json` | `https://www.arbeitnow.com/api/job-board-api` | 1 `remote: true` and 1 `remote: false` item; `meta` kept verbatim |
| `github-bounties.json` | `https://api.github.com/search/issues?q=label:bounty state:open` | 2 issues, reduced to the fields the adapter reads |
| `hn-freelancer.json` | `https://hn.algolia.com/api/v1/search_by_date?query=freelancer&tags=story` | 3 hits |
| `freelancer-rss.xml` | `https://www.freelancer.com/rss.xml` | channel header verbatim + the first 2 `<item>` blocks |
| `devpost.json` | `https://devpost.com/api/hackathons` | 1 USD-prize and 1 non-USD-prize hackathon |

Trimming is documented here so nobody mistakes a fixture for a full response.
Field shapes, types and nullable behaviour are untouched; only item counts and
long description strings were shortened.

## Notes worth keeping

- `remoteok.json` element 0 is the provider's legal notice, **not** a job. A test
  asserts the adapter never builds a candidate from it.
- `devpost.json` deliberately contains the INR prize that broke an earlier
  parser (the HTML fragment `₹ <span data-currency-value>100,000</span>`
  becomes `₹  100,000` once tags are stripped).
- Every fixture is real data from a public feed, kept small enough for the
  repository; no personal data beyond what the provider already publishes.
