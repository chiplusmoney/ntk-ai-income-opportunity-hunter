# Source Compliance Review — Devpost, Hacker News (Algolia), Freelancer.com RSS

**Review date:** 2026-10-14
**Scope:** the three adapters that exist in `packages/core/src/sources/registry.ts`
but are switched off because no terms text had been read for them:

| registry id | endpoint |
|-------------|----------|
| `devpost` | `https://devpost.com/api/hackathons` |
| `hn-freelancer` | `https://hn.algolia.com/api/v1/search_by_date` |
| `freelancer-rss` | `https://www.freelancer.com/rss.xml` |

**Method.** Primary sources only: the providers' own terms pages, the providers'
own feed/marketing pages, and the official repositories that render the HN Search
API documentation. Every statement below is tied to a quoted sentence and the URL
it came from. Where a page could not be read (client-rendered, 404, or no relevant
clause exists), that is recorded as *not established* rather than inferred.
`robots.txt` was not consulted and is not treated as permission anywhere in this
review.

**What this review does not cover:** the other registry entries, the legal
sufficiency of the store-a-hash design, and copyright in third-party story or
project text beyond what the providers' own documents state.

---

## 1. Devpost — `https://devpost.com/api/hackathons`

### Verdict

**KEEP DORMANT. Reading is not permitted.** Devpost's terms explicitly prohibit
automated access to the Site and to *"any related data or information"*, which
covers the payload returned by the listing endpoint. Storing and displaying
follow the same fate: there is no grant, and no official Devpost API terms exist
to grant one.

| sub-question | answer |
|---|---|
| Reading the feed permitted? | **No** — explicit prohibition (quoted below) |
| Store normalised record + excerpt + hash? | **No** — the prohibited act is access to the Site *and* its data; no storage licence is granted anywhere in the terms |
| Display with link back + attribution? | **No basis** — the prohibition bites before display; Devpost publishes no attribution or redistribution rules because automated retrieval itself is excluded |
| Rate limits / required attribution string | None published (no official API, no API terms) |

### Evidence (quoted, verbatim)

Devpost Terms of Service, Section 4 ("Code of Conduct and Responsibility for
User Content"), list of things "All Users agree NOT to … use the Site in a manner
that":

> "Uses manual or automated software, devices, scripts robots, or other means or
> processes to access, "scrape," "crawl" or "spider" the Site, User Content
> (including User Profiles and Team Pages), or any related data or information;"

Source: <https://devpost.com/terms> (read 2026-10-14; the identical text is served
at <https://info.devpost.com/legal/terms-of-service> — both were read).

The agreement binds by mere use, so a headless fetch of the endpoint sits inside
it rather than outside:

> "By using and/or visiting our Site, you agree to the terms and conditions
> outlined in this Agreement and accompanying Privacy Policy (collectively the
> "Agreement"). If you do not agree to the Agreement, you should not use the
> Site."

Source: <https://devpost.com/terms>, Section 1 "Acceptance of Agreement".

And the terms are revised unilaterally:

> "We may revise this Agreement at any time by posting an update to the Site."

Source: <https://devpost.com/terms>, Section 1.

### Cross-check: no official API terms exist

Searches for a Devpost API licence or developer terms returned no Devpost-operated
API documentation. The only API artefacts found are third-party and self-described
as scraping, e.g. <https://github.com/ViRb3/devpost-api> ("An unofficial,
scrape-based API for DevPost", read 2026-10-14) and
<https://github.com/thegu5/devpost-api> (read 2026-10-14) — i.e. they are examples
of the prohibited pattern, not permissions. **Not established:** any Devpost
document that authorises automated retrieval or republication of listing data.
Absence of such a document is the finding.

### Drop-in registry values (source stays off)

```ts
termsSource: 'unverified',      // no provider policy grants automated access
termsReviewed: false,
enabled: false,
disabledReason:
  'Devpost Terms of Service §4 explicitly prohibits automated access: "Uses manual or automated software, devices, scripts robots, or other means or processes to access, \'scrape,\' \'crawl\' or \'spider\' the Site, User Content … or any related data or information" (https://devpost.com/terms). No official Devpost API or API terms exist; enabling requires written permission from Devpost.'
```

---

## 2. Hacker News story metadata via Algolia HN Search API — `https://hn.algolia.com/api/v1/search_by_date`

### Verdict

**ENABLE NOW — for personal, non-commercial use, with conditions.** The API is
published by its operator *for* programmatic third-party use, carries a stated
rate budget, and no located clause restricts storing story metadata or displaying
an item with a link back. The prohibitions that do exist target scraping the HN
site itself and commercial display/distribution — both of which this project's V1
design avoids.

| sub-question | answer |
|---|---|
| Reading the feed permitted? | **Yes** — the API is documented and its operator invites apps built on it |
| Store normalised record + excerpt + hash? | **Not addressed / no prohibition located** (silence, not a licence) |
| Display with link back + attribution? | **Permitted for non-commercial use** as far as the located documents go; the HN/YC documents restrict *commercial* display and distribution, and scraping of the Site |
| Rate limit | **10,000 requests per hour per IP** (Algolia HN Search). The underlying official HN API states no rate limit |
| Required attribution string | **None stated.** Adopted voluntarily (see conditions) |

### Evidence (quoted, verbatim)

**a) The API is documented for third-party programmatic use.** The live page
`https://hn.algolia.com/api` is client-rendered: a plain fetch on 2026-10-14
returned only the title text "Hacker News Search powered by Algolia", so the
documentation was read at its source of record in the operator's own repository
(the React component that renders that page):

> "This API is built on top of Algolia Search's API. It enables developers to
> access HN data programmatically using a REST API. This documentation describes
> how to request data from the API and how to interpret the response."

Source: <https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/Api.tsx> (read 2026-10-14).

**b) A published rate budget:**

> "We are limiting the number of API requests from a single IP to 10,000 per
> hour. If you or your application has been blacklisted and you think there has
> been an error, please contact us."

Source: same file, section "Rate limits".

**c) Third-party apps are invited, not merely tolerated:**

> "We love Hacker News and apps based on it. If you're building an app based on
> our API, please let us know!"

Source: <https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/CoolApps.tsx> (read 2026-10-14).

**d) Provenance — the data is HN's, served through the official HN API:**

> "Items are updated in real-time using official HackerNews API."

Source: <https://raw.githubusercontent.com/algolia/hn-search/master/app/javascript/views/About.tsx> (read 2026-10-14).

Supporting: the project README documents the same repo as "the Rails 5 application
providing [HN Search](https://hn.algolia.com)" with no usage restrictions or
attribution requirement — <https://raw.githubusercontent.com/algolia/hn-search/master/README.md> (read 2026-10-14).

**e) HN's own footer points at both governing documents** (read 2026-10-14 from
`https://news.ycombinator.com`):

```
<a href="newsguidelines.html">Guidelines | <a href="newsfaq.html">FAQ
| <a href="https://github.com/HackerNews/API">API
| <a href="https://www.ycombinator.com/legal/">Legal
```

**f) The official HN API is public data, with no stated rate limit:**

> "In partnership with Firebase, we're making the public Hacker News data
> available in near real time."

> "There is currently no rate limit."

Source: <https://github.com/HackerNews/API> (linked as "API" from HN's footer; read 2026-10-14). The same README states the backward-compatibility contract ("only removal of a non-optional field or alteration of an existing field will be considered incompatible changes") and directs bugs to `api@ycombinator.com`. It contains **no** attribution requirement, storage restriction or redistribution clause.

**g) The limits that do exist come from Y Combinator's Terms of Use** (the target
of HN's own "Legal" link):

> "In connection with your use of the Site you will not engage in or use any data
> mining, robots, scraping or similar data gathering or extraction methods."

> "Except as expressly authorized by Y Combinator, you agree not to modify, copy,
> frame, scrape, rent, lease, loan, sell, distribute or create derivative works
> based on the Site or the Site Content, in whole or in part, except that the
> foregoing does not apply to your own User Content (as defined below) that you
> legally upload to the Site."

> "**Commercial Use**: Unless otherwise expressly authorized herein or in the
> Site, you agree not to display, distribute, license, perform, publish,
> reproduce, duplicate, copy, create derivative works from, modify, sell, resell,
> exploit, transfer or upload for any commercial purposes, any portion of the
> Site, use of the Site, or access to the Site."

> "…obtain or attempt to access or otherwise obtain any materials or information
> through any means not intentionally made available or provided for through the
> Site."

Source: <https://www.ycombinator.com/legal#tou> (read 2026-10-14). The same page
defines the Site as the YC website "including all subdomains", and incorporates
HN's Guidelines by reference ("All such terms are hereby incorporated by reference
into these Terms of Use").

**How these interact (reading, not paraphrasing away the tension):** the
scraping/data-mining prohibition names the *Site* (`ycombinator.com` and its
subdomains), not the Algolia-hosted API host `hn.algolia.com`; the commercial-use
prohibition is expressly limited to "commercial purposes"; and the last clause
above carves out material "intentionally made available", which is exactly what a
documented, invited API is. This project is personal and non-commercial in V1, so
none of the three bites — provided the adapter keeps using the API and never
harvests `news.ycombinator.com` HTML.

### Not established

- Whether Algolia's general Terms of Service bind consumers of the free
  `hn.algolia.com` API. The page was read on 2026-10-14
  (<https://www.algolia.com/policies/terms>): it governs "SUBSCRIPTION TO AND USE
  OF ALGOLIA'S SERVICES" between Algolia and a "Subscriber", and no clause
  addressing HN Search API consumers (attribution, storage, redistribution) was
  located in it.
- Any explicit grant of redistribution rights for HN story titles. There is
  silence on storage and republication, not a licence — the enable rests on
  (i) the API being published for third-party programmatic use, (ii) a stated
  rate budget, and (iii) the located prohibitions only reaching Site scraping and
  commercial use.

### Conditions attached to the enable

1. **API only.** Use `hn.algolia.com/api/*` (or HN's official Firebase API). Never
   fetch or parse `news.ycombinator.com` pages.
2. **Budget.** Stay inside 10,000 requests/hour/IP from a single IP; the current
   `minIntervalMinutes: 120` is far below that.
3. **Non-commercial.** If the app is ever monetised, the YC "Commercial Use"
   clause quoted above applies and this verdict must be re-reviewed first.
4. **Link back + attribution.** Not required by any located clause, adopted as
   good practice given the silence on republication: `attribution: 'Hacker News (via Algolia)'`
   and item links to `https://news.ycombinator.com/item?id=<objectID>` — the
   existing registry entry already does both.
5. **Excerpt discipline.** Store at most the story title and a bounded excerpt of
   the submission; story and comment text is third-party content whose terms are
   not covered by this review.

### Drop-in registry values

```ts
termsSource: 'provider-policy',        // Algolia HN Search API doc + HN/YC legal docs
termsReviewed: true,
enabled: true,
permittedUse:
  'Permitted for personal, non-commercial use. The Algolia HN Search API is published for third-party programmatic access: "It enables developers to access HN data programmatically using a REST API" and "We are limiting the number of API requests from a single IP to 10,000 per hour" (hn-search repo, app/javascript/views/Api.tsx). HN links its own API doc from news.ycombinator.com. YC Terms of Use (linked as HN Legal) prohibit scraping/data mining of the Site and commercial display or distribution of it, but not personal storage of API metadata; keep non-commercial, API-only, link back to the HN item.'
```

---

## 3. Freelancer.com new-projects RSS — `https://www.freelancer.com/rss.xml`

### Verdict

**KEEP DORMANT. Reading is not permitted without express written permission, and
the storage model is separately barred.** This is the hardest of the three
findings: the feed is published, but two independent clauses prohibit exactly what
this project does — automated access without written permission, and storing
hashed data.

| sub-question | answer |
|---|---|
| Reading the feed permitted? | **No** — express written permission required for automated access, explicitly including API access |
| Store normalised record + excerpt + hash? | **No** — API terms bar storing "any Data or … any information expressed by the Data (such as hashed or transferred data)"; caching is permitted only for performance and must be refreshed at least every 24 hours |
| Display with link back + attribution? | **No** — aggregating "listings from our website for display with listings from other websites" requires express written permission; that is this project's exact pattern |
| Rate limits | No published numeric limit; a general prohibition on exceeding rate limits and on excessive volume applies |

### Evidence (quoted, verbatim)

Freelancer User Agreement ("This Agreement was last modified on 05 June 2025"),
<https://www.freelancer.com/about/terms> (read 2026-10-14):

**§33 "Access and Interference":**

> "You agree that you will not use any robot, spider, scraper or other automated
> means to access the Website via any means, including for the avoidance of doubt
> access to our API or application programming interface, for any purpose without
> our express written permission."

The list that follows on the same page includes:

> "bypass our robot exclusion headers or other measures we may use to prevent or
> restrict access to the Website."

> "take any action that imposes or may impose (in our sole discretion, exercised
> reasonably) an unreasonable or disproportionately large load on our
> infrastructure;"

**§4 "Using Freelancer", prohibited-acts list, item 11** (the aggregator clause):

> "download and aggregate listings from our website for display with listings
> from other websites without our express written permission, "frame", "mirror" or
> otherwise incorporate any part of the Website into any other website without
> our prior written authorisation;"

**Definitions — the RSS feed is inside "Website":**

> ""Website" means the Websites operated by Freelancer and available at:
> Freelancer.com and any of its regional or other domains or properties, and any
> related Freelancer service, tool or application, specifically including mobile
> web, any iOS App and any Android App, or API or other access mechanism."

**The feed asserts copyright and grants nothing:**

The page that serves the feed declares it as a subscription link —
`<link href="https://www.freelancer.com/rss.xml" rel="alternate" type="application/rss+xml" title="Latest projects">`
— and the feed body itself carries:

> "<copyright>Copyright 2004-2026, Freelancer</copyright>"

(Feed read 2026-10-14 at <https://www.freelancer.com/rss.xml>.)

**Freelancer API Terms and Conditions** ("This Agreement was last modified on 21st
December 2017"), <https://www.freelancer.com/about/apiterms> (read 2026-10-14).
This document governs the path the User Agreement points to (its "API" link
resolves to <https://developers.freelancer.com>). It is not a permission to store
feed data:

§2 Definitions:

> ""Data" – means all data uploaded, posted, transmitted or otherwise made
> available via interactions with the API."

§5 Storage of Data:

> "Where Data is cached, you should refresh the cache at least every 24 hours.
> This limited permission to cache is for performance reasons only."

> "All Data should be stored and served using strong encryption."

> "You may not copy or store any Data or capture or store any information
> expressed by the Data (such as hashed or transferred data), except to the extent
> permitted by these API T&Cs."

§4 Use of API and Freelancer.com Data, including:

> "You may not use the API or any other technology in a manner that accesses or
> uses any information beyond what Freelancer.com intends to allow under these API
> T&Cs; that changes, breaks or circumvents any of Freelancer's technical,
> administrative, regulatory, process or security measures; that disrupts or
> degrades the performance of or that tests the vulnerability of Freelancer's
> systems or networks."

> "You may not use the API to replicate or compete with the services offered by
> Freelancer;"

> "You may charge for your Application. However, you may not sell, rent, lease,
> sublicense, redistribute, or syndicate access to the API."

> "You will not attempt to exceed or circumvent limitations on access (via rate
> limit or any other method), calls and use of API, or otherwise use the API in a
> manner that exceeds reasonable request volume, constitutes excessive or abusive
> usage, or otherwise fails to comply or is inconsistent with any part of these
> API T&Cs."

§7.4 on termination:

> "unless we agree otherwise in writing or as stated in this API T&Cs, you must
> permanently delete all Data and other information that you stored pursuant to
> your use of the API;"

**Note on the marketing page.** <https://developers.freelancer.com> (read
2026-10-14) promotes the API for building apps ("Use the Freelancer API to access
a cloud workforce…") but publishes no licensing grant of its own; the grant lives
in §3 of the API T&Cs and the storage limit in §5.3 stands regardless.

### Why "the feed exists" is not a permission

Freelancer publishes the RSS feed for readers and does assert `<copyright>` in it,
but neither located document contains a syndication licence or an exception for
RSS. The operative sentences require "express written permission" for automated
access (§33) and for aggregating listings "for display with listings from other
websites" (§4 item 11), and bar storing the data or its hash (API T&Cs §5.3).
**That is an explicit prohibition, not silence.**

### Not established

- Any Freelancer document granting RSS syndication or republication rights, or
  stating an attribution string — none was located, which is consistent with the
  fact that it would require written permission to exist at all.
- A numeric rate limit for the API/RSS; §4.9 refers to limits without publishing
  them.

### Drop-in registry values (source stays off)

```ts
termsSource: 'unverified',      // provider policy prohibits the intended use
termsReviewed: false,
enabled: false,
disabledReason:
  'Freelancer.com prohibits this use. User Agreement §33: "You agree that you will not use any robot, spider, scraper or other automated means to access the Website via any means, including for the avoidance of doubt access to our API or application programming interface, for any purpose without our express written permission." §4 item 11 forbids aggregating "listings from our website for display with listings from other websites" without express written permission. API T&Cs §5.3 bars storing "any Data or … any information expressed by the Data (such as hashed or transferred data)". Enabling requires express written permission from Freelancer.'
```

---

## Limitations of this review

1. **`https://hn.algolia.com/api` could not be read directly** — it is
   client-rendered and returned only its title. The documentation text quoted
   above was read from the source of record that renders it
   (`algolia/hn-search`, `app/javascript/views/Api.tsx`) rather than from the
   rendered page.
2. **`https://news.ycombinator.com/legal` returns HTTP 404** (checked
   2026-10-14). HN's footer "Legal" link resolves to
   <https://www.ycombinator.com/legal/>, which is the document quoted.
3. **No Devpost API terms exist to cite** — that absence is reported as a finding,
   not filled in with the terms of a third-party scraper.
4. **Terms are versioned.** Version markers actually read: Freelancer User
   Agreement "last modified on 05 June 2025", Freelancer API T&Cs "last modified
   on 21st December 2017", YC legal page shown to open with "Privacy Policy /
   Last Updated February 2024" (that heading is the Privacy Policy section; the
   Terms of Use section's own version line was not captured before the fetch
   truncated), Devpost terms undated on-page. These
   verdicts bind to the text as read on 2026-10-14 and should be re-checked if a
   provider posts an amendment — the `verify:live` suite is the natural place.
5. **Confidence.** Devpost and Freelancer verdicts are *high confidence*: both rest
   on explicit prohibitory sentences covering the intended use. The HN verdict is
   *high confidence for reading and for the rate budget*, but the storage and
   republication permission is **silence**, so the enable is a judgement that the
   located prohibitions (Site scraping, commercial use) do not reach a personal,
   non-commercial, API-based aggregator that links back.

---

## Summary

| provider | verdict | enabling fact still missing |
|---|---|---|
| Devpost — `devpost.com/api/hackathons` | **Keep dormant** — ToS §4 prohibits automated access to the Site and to "any related data or information" | Written permission from Devpost, or published API terms, that authorise automated retrieval and display of listing data. No such document exists today |
| Hacker News via Algolia HN Search — `hn.algolia.com/api/v1/search_by_date` | **Enable now** (personal, non-commercial, API-only, ≤10k req/hour/IP, link back + attribution) | None blocking. Residual: no clause grants redistribution, so any future commercial use requires fresh review against the YC "Commercial Use" clause |
| Freelancer.com — `freelancer.com/rss.xml` | **Keep dormant** — User Agreement §33 and §4 item 11 prohibit automated access and cross-site aggregation without express written permission; API T&Cs §5.3 bars storing the data or its hash | Express written permission from Freelancer that covers automated retrieval *and* storage/display of listing data (the API T&Cs' cache-only permission is not enough) |
