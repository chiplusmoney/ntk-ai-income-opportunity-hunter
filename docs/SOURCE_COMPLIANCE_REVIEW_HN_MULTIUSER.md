# Source Compliance Review — HN story metadata displayed to multiple users via the Algolia HN Search API

**Reviewed:** 2026-10-15 (all pages read on this date; quotes are verbatim from the URLs shown)
**Question:** May a FREE, PUBLIC, MULTI-USER web/mobile app display Hacker News story metadata (title, bounded excerpt, author, points, comment count, HN item link, attribution "Hacker News (via Algolia)") obtained through the Algolia HN Search API (hn.algolia.com)?
**Product facts assumed:** no charge to users, no revenue; no comment-thread republication; no scraping of news.ycombinator.com HTML.

**Access notes (per instructions):**
- `https://hn.algolia.com/api` is a **client-rendered React app**: a text reader returns only the page title ("Hacker News Search powered by Algolia"). Its documented content was therefore verified from the repository source that renders it: `app/javascript/views/Api.tsx` (branch `master`) — quoted below. Treat the `.tsx` file as the primary text for that page.
- `https://news.ycombinator.com/legal` returns the literal body `Unknown.` (9 bytes) — the URL exists but publishes nothing. **HN's own footer "Legal" link points to `https://www.ycombinator.com/legal/`** (`<a href="https://www.ycombinator.com/legal/">Legal</a>` on the HN front page), so the YC Terms of Use is the document HN itself designates as its legal terms.
- `https://www.ycombinator.com/legal` is one long page containing Privacy Policy + Terms of Use + Trademarks; the ToU is also reachable as `https://www.ycombinator.com/legal#tou` (that anchor form is the one cited by YC's own Send-a-SAFE terms, quoted in §3).

---

## 1. VERDICT

**(C) Permission is UNESTABLISHED.** No first-party document reviewed grants the right to display HN story metadata to third parties or to multiple users, and none addresses third-party apps built on either the official HN API or the Algolia HN Search API.

Two qualifications, both load-bearing:
1. Nothing found clearly *prohibits* a free, non-revenue display either: the clause that names "display, distribute, license, perform, publish, reproduce…" is expressly limited to "**for any commercial purposes**" (F2), and the ToU contains **no definition of "commercial"** (F6).
2. The same ToU restricts copying/distribution of "Site Content" in clauses that are **not** gated on commerciality and that require authorization to be **express** (F3), and reserves everything not specifically authorized (F4). No express authorization for redistribution exists in any document located.

**Correction to the prior review's reasoning (in scope of Q1):** the ToU does **not** distinguish "personal use" from "public display to many users" anywhere. Its operative gate is commerciality, not audience size. The earlier scoping to "one person using the data privately" therefore had no textual basis in the quoted clauses — but the change of scope from one user to many also does not, by itself, cross any quoted threshold. What stands unchanged is the underlying gap: no document authorizes redistribution.

---

## 2. FINDINGS WITH QUOTED EVIDENCE

Evidence tiers: **[P1]** first-party text by the rights holder / service operator; **[C]** current repo source (primary code); **[S]** secondary (not used as a basis for any conclusion).

### F1 — The ToU's "Site" covers Hacker News. [P1]
- "Welcome to the Y Combinator website (including all subdomains, the “Site”), which is operated by Y Combinator Management, LLC and its affiliates (collectively, “Y Combinator,” “we,” “us” and/or “our”)."
  — https://www.ycombinator.com/legal (Terms of Use, opening paragraph)
- "any Guidelines applicable to any components of the Site (e.g., the Hacker News Guidelines located at https://news.ycombinator.com/newsguidelines.html, Bookface Guidelines located at https://bookface.ycombinator.com/docs/forum/guidelines, etc.). All such terms are hereby incorporated by reference into these Terms of Use."
  — https://www.ycombinator.com/legal (Terms of Use, incorporation-by-reference paragraph)
- Corroboration: HN's front page footer links `Legal` → `https://www.ycombinator.com/legal/`; HN's own search box is `<form method="get" action="//hn.algolia.com/">` — i.e. **HN's first-party search is served by the Algolia API endpoint in question.** — https://news.ycombinator.com/
- Why it matters: HN content is "Site Content" under the ToU, and the Algolia endpoint is not an off-brand third-party source — it is the search HN itself points at.

### F2 — The clause naming "display… distribute… publish" is gated on COMMERCIALITY, not on audience size or display as such. [P1]
> "**Commercial Use**: Unless otherwise expressly authorized herein or in the Site, you agree not to display, distribute, license, perform, publish, reproduce, duplicate, copy, create derivative works from, modify, sell, resell, exploit, transfer or upload **for any commercial purposes**, any portion of the Site, use of the Site, or access to the Site."
> "The buying, exchanging, selling and/or promotion (commercial or otherwise) of upvotes, comments, submissions, accounts (or any aspect of your account or any other account), karma, and/or content is strictly prohibited, constitutes a material breach of these Terms of Use, and could result in legal liability."
— https://www.ycombinator.com/legal (Terms of Use, "Commercial Use")

Reading: the verb list ("display, distribute… publish, reproduce…") is qualified by the trailing purpose phrase "for any commercial purposes". A free, no-revenue app is not obviously within that purpose. There is **no** "personal use" carve-out and **no** clause keyed to number of users.

### F3 — A second, non-commerciality-gated clause restricts distributing Site Content except when expressly authorized. [P1]
> "**Intellectual Property Rights — Site Content, Software and Trademarks**: You acknowledge and agree that the Site may contain content or features (“Site Content”) that are protected by copyright, patent, trademark, trade secret or other proprietary rights and laws. **Except as expressly authorized by Y Combinator, you agree not to modify, copy, frame, scrape, rent, lease, loan, sell, distribute or create derivative works based on the Site or the Site Content, in whole or in part**, except that the foregoing does not apply to your own User Content (as defined below) that you legally upload to the Site."
> "In connection with your use of the Site you will not engage in or use any data mining, robots, scraping or similar data gathering or extraction methods."
— https://www.ycombinator.com/legal (Terms of Use, "Intellectual Property Rights")

Note for this product: the prohibition here is on *copying/distributing Site Content*, not on *calling an API*. The product does not scrape news.ycombinator.com HTML (so the "data mining, robots, scraping" sentence is not triggered by fetching), but displaying stored copies of titles/authors to other users is squarely "copy… distribute … the Site Content", which this clause forbids **unless expressly authorized by Y Combinator**. No document located contains that express authorization.

### F4 — Catch-all reservation of rights. [P1]
> "**Any use of the Site or the Site Content other than as specifically authorized herein is strictly prohibited. Any rights not expressly granted herein are reserved by Y Combinator.**"
— https://www.ycombinator.com/legal (Terms of Use, "Intellectual Property Rights")

### F5 — Trademarks: "Hacker News®" is claimed, and no mark licence is granted. [P1]
> "The Y Combinator name and logos are trademarks of Y Combinator (collectively the “Y Combinator Trademarks”)."
> "Nothing in this Terms of Use or the Site should be construed as granting, by implication, estoppel, or otherwise, any license or right to use any of Y Combinator Trademarks displayed on the Site, without our prior written permission in each instance."
> Non-exhaustive trademark list includes: "**Hacker News®**", "Startup News™", "Y Combinator®"
— https://www.ycombinator.com/legal (Terms of Use, "Intellectual Property Rights"; "TRADEMARKS")
Relevance: the app's string "Hacker News (via Algolia)" is a nominative reference and does not claim the mark, but the ToU grants no right to use the mark "in each instance" without prior written permission. Not a prohibition finding; a residual-doubt item (§5).

### F6 — No definition of "commercial" (or "commercial purposes") anywhere in the ToU. [P1]
Verified by exhaustive scan of the page text: "commercial" occurs 11 times, in these roles only — "Commercial Use" (F2), "commercial activities and/or sales" (in the prohibited-content list: "constitutes unsolicited or unauthorized advertising, promotional materials, commercial activities and/or sales…"), the CCPA disclosure tables ("business or commercial purposes"), and "commercially reasonable" (security language). **No interpretive definition is supplied.**
— https://www.ycombinator.com/legal
Consequence: whether a free, non-revenue, multi-user aggregator is "commercial" is **not answered by the text** and cannot be settled from primary sources. A contrary indicator in the same list is that the ToU prohibits content that "constitutes… commercial activities and/or sales" while user-facing monetisation (ads, paid tiers, sponsorship) would plainly move the app into the Commercial Use purpose — the app as currently scoped (no revenue) does not.

### F7 — "Expressly authorized" is the ToU's own permission standard; "intentionally made available" is the access standard. [P1]
> "…or obtain or attempt to access or otherwise obtain any materials or information **through any means not intentionally made available or provided for through the Site**."
— https://www.ycombinator.com/legal (Terms of Use, prohibited-conduct list)
Reading: fetching via a published API is not access through "any means not intentionally made available" — YC itself publishes the data programmatically (F9) and HN's own search posts to the Algolia endpoint (F1). This legitimises **access**; it does not by itself license **further distribution**, which F3 subjects to an express-authorization standard.

### F8 — "Third party applications" appear in the ToU only as a disclaimer, never as a permission. [P1]
> "**Third Party Websites**: The Site may provide, or third parties may provide, links or other access to other sites and resources on the Internet or to third party applications. Y Combinator has no control over such sites, resources or applications and Y Combinator is not responsible for and does not endorse such sites, resources or applications."
— https://www.ycombinator.com/legal
Reading: this is a liability disclaimer about apps YC links to or that exist alongside the Site. It neither authorizes nor forbids third-party apps that read HN data, and it is the **only** occurrence of third-party applications in the ToU.

### F9 — YC's official HN API affirmatively publishes HN data programmatically, with no stated usage terms. [P1]
> "In partnership with Firebase, we're making the public Hacker News data available in near real time."
> "There is currently no rate limit."
> "I'm not saying this to defend it - It's not the ideal public API, but it's the one we could release in the time we had. While awkward, **it's possible to implement most of HN using it**."
> "Please email api@ycombinator.com if you find any bugs."
— https://github.com/HackerNews/API (README; repo description: "Documentation and Samples for the Official HN API")
**Absence finding:** this README contains **no** licence, no redistribution clause, no commercial-use clause, and no reference to third-party apps. GitHub reports the repository licence as `MIT License` — that covers the *repository contents* (documentation and samples), **not** the HN data, and it is not a data licence. Nothing in the repo grants a right to redistribute the data.
— https://api.github.com/repos/HackerNews/API (repository metadata, read 2026-10-15)

### F10 — HN Guidelines: silent on third-party apps, bots that read, and redistribution. [P1]
Full text reviewed (4,361 characters of page text). The only provision touching automation concerns **posting**, not reading:
> "Please don't put generated text in HN posts. Write your text yourself—HN is for sharing between humans. For the same reason, **please don't automate posting**."
— https://news.ycombinator.com/newsguidelines.html
**Absence finding:** no clause in the HN Guidelines mentions third-party applications, APIs, data reuse, redistribution, commercial use, or the number of readers/users. (The Guidelines are incorporated into the ToU by reference — see F1.)

### F11 — HN FAQ: silent on third-party apps and redistribution; only an abuse/rate note about fetching pages. [P1]
> "**My IP address seems to be banned. How can I unban it?** If you request many pages quickly, your IP address might get banned. This self-serve unbanning procedure works most of the time. If not, email hn@ycombinator.com."
— https://news.ycombinator.com/newsfaq.html
**Absence finding:** no entry in the FAQ addresses third-party apps, API use, or reuse of HN content. The only relevant rule is a rate/abuse rule that is not a grant of permission (and per project rule, silence is not a grant).

### F12 — Algolia HN Search docs: access language + rate limit only; no redistribution terms. [C]
From the source that renders https://hn.algolia.com/api (the page is client-rendered; see Access notes):
> "This API is built on top of Algolia Search's API. **It enables developers to access HN data programmatically using a REST API.** This documentation describes how to request data from the API and how to interpret the response."
> "## Rate limits — We are limiting the number of API requests from a single IP to 10,000 per hour. If you or your application has been blacklisted and you think there has been an error, please contact us."
— https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/Api.tsx (`app/javascript/views/Api.tsx`, master)
**Absence finding:** the API documentation contains **no** licence, attribution requirement, commercial-use restriction, redistribution clause or users-count limit. "Enables developers to access" is an access statement, not a redistribution licence.

### F13 — The API operator publicly encourages third-party apps built on its API — including at least one redistributing service. [C]
> "**We love Hacker News and apps based on it. If you're building an app based on our API, please let us know!**"
— https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/CoolApps.tsx (`app/javascript/views/CoolApps.tsx`; page `/cool_apps`)
The same page lists third-party consumers of the API, including a multi-recipient redistribution service: "HN Mail - A customizable weekly newsletter service for Hacker News based on topics", plus web apps, browser extensions, iOS/Android clients.
**Scope caution:** this is Algolia speaking about *its* API (Algolia is the operator of hn.algolia.com, not the rights holder of HN content — see F14). It is an encouragement-to-notify, not a licence, and it does not bind YC.

### F14 — Where Algolia's data comes from, and how it describes itself. [C]
> "Items are updated in real-time **using official HackerNews API**. Data is indexed on 3 different servers for high availability, hosted in Beauharnois, Canada."
> "Special thanks to Firebase, Octopart and **YC teams for providing us the data**."
— https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/About.tsx (`app/javascript/views/About.tsx`)
> "This is the Rails 5 application providing HN Search. It's leveraging react on the frontend, algoliasearch-rails for the search…"
— https://raw.githubusercontent.com/algolia/hn-search/master/README.md
Also verified: the site's footer (`app/javascript/components/Footer/Footer.tsx`) links only About / Setting / Help / API Documentation / Hacker News / Fork-Contribute / Cool Apps — **there is no Terms or Privacy/legal link on HN Search itself**, and no licence file exists at the repo root (`https://raw.githubusercontent.com/algolia/hn-search/master/LICENSE` → `404: Not Found`; GitHub metadata: licence "Other", SPDX `NOASSERTION`).
**Maintenance fact:** "This repository was archived by the owner on **Feb 10, 2026**. It is now read-only." — https://github.com/algolia/hn-search/tree/master/app/javascript/views

### F15 — Reverse search for an authorising statement found none. [S, negative]
Searches for a YC/HN statement permitting third-party display or redistribution of HN data returned no first-party grant (search results were unrelated HN threads and third-party posts). Recorded as a negative result, not as evidence of permission.

---

## 3. EXACT WORDING TO STORE AS THE SOURCE'S CONDITIONS / DISABLE-REASON

Store the following verbatim as this source's conditions block (and use the bracketed text as the disable reason if the conditions can no longer be met):

```
source: Hacker News story metadata via Algolia HN Search API (hn.algolia.com)
status: PERMISSION NOT ESTABLISHED — no first-party document grants public/multi-user display.
conditions (all required):
  1. No commercial purpose. No ads, paid tiers, sponsorship, affiliate revenue, paid promotion,
     or sale/promotion of HN content, accounts, karma, upvotes or submissions.
     (YC ToU "Commercial Use": prohibits display/distribute/publish/reproduce of any portion of
     the Site "for any commercial purposes" unless otherwise expressly authorized.)
  2. Access only through the published APIs (API, never HTML scraping of news.ycombinator.com);
     no data mining, robots or scraping methods against the Site.
  3. Read-only display of story metadata (title, excerpt, author, points, comment count,
     HN item link). No republishing of comment threads; link back to the HN item.
  4. Respect Algolia rate limits: max 10,000 requests/hour from a single IP; stop if blacklisted.
  5. No YC/HN branding or marks presented as affiliation or endorsement; attribution is a
     factual reference only ("Hacker News (via Algolia)"); do not name the product after the mark.
  6. Do not require users to log in to HN or handle HN credentials.
disable-reason (if 1–6 cannot be met): "Permission to display HN content to third parties is not
  established; YC Terms of Use restrict distribution of Site Content except as expressly
  authorized and prohibit display/distribution for commercial purposes. Source disabled pending
  written authorization."
re-verify before: any monetisation, any increase in redistribution scope (e.g. full text,
  comment threads, bulk dumps), or any change to YC/HN/Algolia terms.
verify-on: 2026-10-15 | sources: ycombinator.com/legal ; news.ycombinator.com/newsguidelines.html ;
  news.ycombinator.com/newsfaq.html ; github.com/HackerNews/API ;
  github.com/algolia/hn-search (README, app/javascript/views/*.tsx)
```

---

## 4. WHAT WOULD CHANGE THE VERDICT

To move from **(C) unestablished** to **(A) permitted** or **(B) permitted with stated conditions**, at least one of the following facts would have to exist (each is verifiable):

1. **An express, written authorisation from Y Combinator** covering redistribution or public display of HN story metadata — e.g. an API licence or terms document published with the official HN API (`github.com/HackerNews/API`) or on `news.ycombinator.com`. This is the specific standard F3 uses ("Except as expressly authorized by Y Combinator…") and what F2's "Unless otherwise expressly authorized herein or in the Site" contemplates. **This is the missing enabling fact.**
2. **A clause in the HN Guidelines or FAQ addressing third-party apps** — e.g. a sentence permitting clients/aggregators that read HN data, or nominating the official API as the authorised channel for redistribution. None exists today (F10, F11).
3. **Terms published by Algolia for the HN Search API** that grant redistribution rights (the current docs state only access + the 10,000 req/hour/IP limit, F12), *and* evidence that such terms bind the HN content rights holder (they do not, per F14: Algolia states the data is provided by YC).
4. **A definition of "commercial" in the ToU** that excludes a free, no-revenue multi-user app (or that includes it). No definition exists today (F6) — a definition would move Q3 from "unestablished" to answerable.
5. A written reply from `api@ycombinator.com` or `hn@ycombinator.com` confirming the intended use is acceptable. (Not obtained; would be first-party evidence if obtained.)

Absent 1–5, no reading of the located documents upgrades the verdict.

---

## 5. RESIDUAL DOUBT (labelled, not resolved)

- **"Commercial" is undefined (F6).** A reasonable reader could argue that an app built inside an income-generation project, or one that markets itself, serves a "commercial purpose" even without revenue. Confidence that a free multi-user app is outside F2: **moderate**, not high. If the product's own documents describe it as a monetisation vehicle, treat the answer as (D)-risk.
- **F3 vs F2 conflict.** F2 gates display/distribution on commerciality; F3 restricts "copy… distribute… the Site Content" with no commerciality gate and requires express authorisation. The documents do not reconcile these; I do not reconcile them either. Read strictly, F3 + F4 ("Any use… other than as specifically authorized herein is strictly prohibited") are the tighter constraints and neither is satisfied by any located permission.
- **Trademark (F5).** No licence is granted for YC marks; "Hacker News®" is a claimed mark. The app's attribution string is nominally descriptive, but a strict reading of "without our prior written permission in each instance" puts the app's naming/logo choice in a grey zone.
- **API data source path.** Algolia states it ingests "official HackerNews API" (F14). That means the app's chain is HN → Algolia → app; YC's ToU governs HN content, while Algolia's own HN Search documentation governs API behaviour. No document at either hop grants downstream display rights — a gap that a single clause could close.
- **Maintenance risk.** The HN Search repository was archived read-only on 2026-02-10 (F14); its docs are no longer updated. Endpoint behaviour may change without notice.
- **Not examined (out of scope / not reached):** YC's general website terms other than `/legal`, Algolia's commercial product terms (they govern Algolia's paid products, not hn.algolia.com's free search API), the never-archived text of `news.ycombinator.com/legal` (the URL returns `Unknown.` — hence no HN-specific legal text was available to review), and Cloudflare/Firebase terms for the API hosts.
- **Rate-limit note (not a permission):** F12's 10,000 req/hour/IP is an operational limit, and F11's IP-ban note concerns page requests. Neither grants anything; both are recorded as conditions only.

---

## 6. SUMMARY TABLE

| Question | Finding | Quote URL |
| --- | --- | --- |
| 1. Do the ToU / HN Guidelines distinguish "personal use" from "public display to many users"? | **No.** No clause in either document mentions audience size, number of users, or "personal use". The ToU's gate is commerciality ("for any commercial purposes"); HN's only user-volume rule is an abuse limit on page requests. Scope change to multi-user crosses no quoted threshold — and gains no quoted permission. | https://www.ycombinator.com/legal ; https://news.ycombinator.com/newsfaq.html |
| 2. Does the "display, distribute… publish… reproduce" prohibition turn on commerciality, or on display as such? | **Both exist.** The named clause turns on commerciality: "…or upload for any **commercial purposes**, any portion of the Site…". Separately, and **not** gated on commerciality: "Except as expressly authorized by Y Combinator, you agree not to modify, copy, frame, scrape, rent, lease, loan, sell, **distribute** or create derivative works based on the Site or the Site Content". Plus a catch-all: "Any use of the Site or the Site Content other than as specifically authorized herein is strictly prohibited." | https://www.ycombinator.com/legal |
| 3. Is a free, non-revenue, multi-user aggregator "commercial"? | **Not answerable from primary sources: "commercial" is undefined** (11 occurrences, all non-definitional). Third-party applications appear only in a disclaimer ("Y Combinator has no control over such sites, resources or applications… does not endorse such…"), which neither authorises nor forbids. "Intentionally made available" is the access standard and is satisfied by a published API; "expressly authorized" is the distribution standard and is **not** satisfied by anything located. | https://www.ycombinator.com/legal |
| 4. Do the HN Guidelines / FAQ / Algolia docs address third-party apps, bots or redistribution? | **Guidelines: nothing** except "please don't automate posting" (posting, not reading). **FAQ: nothing** except the IP-ban note for rapid page requests. **Official HN API README: nothing** — but it does state "we're making the public Hacker News data available in near real time" and "There is currently no rate limit" (no licence, no redistribution clause). **Algolia docs: nothing on redistribution** — only "It enables developers to access HN data programmatically using a REST API" and "We are limiting the number of API requests from a single IP to 10,000 per hour". **Algolia does encourage apps**: "We love Hacker News and apps based on it. If you're building an app based on our API, please let us know!" | https://news.ycombinator.com/newsguidelines.html ; https://news.ycombinator.com/newsfaq.html ; https://github.com/HackerNews/API ; https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/Api.tsx ; https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/CoolApps.tsx |
| 5. Verdict | **(C) PERMISSION UNESTABLISHED.** Free, non-revenue, multi-user display of HN story metadata via the Algolia HN Search API is neither authorised nor clearly prohibited by any first-party document located. To change the answer, an express written authorisation from Y Combinator covering redistribution/public display must exist (see §4, item 1) — e.g. a licence or terms attached to the official HN API, or a clause in the HN Guidelines. | https://www.ycombinator.com/legal ; https://github.com/HackerNews/API |

---

*Prepared from primary sources only. Every quotation above was read on 2026-10-15 from the URL listed with it. Statements about missing text are absence findings from full-text review of the respective pages, not inferences.*
