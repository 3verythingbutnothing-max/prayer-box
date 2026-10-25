# Care resource notes

Checked October 24, 2026, against the named services' own pages. These are static support links in a fictional frontend, not an integration with a crisis service. The app makes no location lookup, automated call, message, emergency dispatch or referral containing prayer text.

| Region | Displayed support | Primary source |
| --- | --- | --- |
| United States | Call or text 988; user-initiated online chat | [988 Lifeline](https://988lifeline.org/help-someone-else/) and [official chat](https://chat.988lifeline.org/) |
| Canada | Call or text 988, 24 hours a day | [Canada 9-8-8](https://988.ca/) |
| United Kingdom and Ireland | Samaritans 116 123, any time, day or night | [Samaritans contact options](https://www.samaritans.org/how-we-can-help/contact-samaritan/) |
| Elsewhere or no country selected | A directory that lets the visitor choose their country and available options | [Find A Helpline](https://findahelpline.com/) and its [verification information](https://findahelpline.com/about) |

The unknown-country view labels 988 specifically for the United States and Canada. It does not present 988 as a worldwide emergency number. The optional region chooser starts unselected and does not use a box owner's country, browser location or IP address as the requester's location. Link destinations are fixed and include no request text, author identifiers or query parameters.

The Samaritans source currently describes chat as limited in availability. This prototype does not present it as a universally available chat service and does not offer an unverified email channel.

For immediate danger or harm that has already occurred, the panel directs the reader to local emergency services or the nearest emergency department and says not to wait for Prayer Box. It also encourages reaching a trusted person and professional support. A trusted pastor can offer care alongside that support. See [988 guidance on helping someone else](https://988lifeline.org/help-someone-else/) and [Canada's urgent-help guidance](https://988.ca/get-help/help-right-now).

Christian encouragement is editorial wording reflecting the founder's requested Trinitarian foundation. It is not a Bible quotation, a diagnosis, a promise of recovery or a demand to demonstrate faith before receiving help. Crisis support is offered without guilt, blame or a requirement to accept religious wording.

Before real users are accepted, a named safeguarding owner must review the wording, region coverage, accessibility, escalation and retention process. Resource freshness needs ongoing human review. No scheduler or real notification service has been created. Prototype keyword examples do not establish reliable multilingual crisis screening or a continuously monitored team.

## Dedicated Get Help page — therapy and ongoing mental health support

Added October 24, 2026, following the founder’s request for a dedicated support page. The page provides informational pathways and fixed external links, with the existing country-specific crisis panel opened through an `onSupport` callback. It does not diagnose, collect clinical information, make appointments, send referrals, or initiate a crisis call/chat/form. Its emergency guidance and clearly region-labeled U.S./Canada 988 information remain visible before the therapy resources.

Primary sources inspected for the added content:

| Source | Claims used and limits |
| --- | --- |
| [NIMH: Help for Mental Illnesses](https://www.nimh.nih.gov/health/find-help) | Primary care screening/referral; routes through insurance, local health services, schools, and workplaces; questions about provider experience, treatment, insurance, and cost. The fetched page states that it was last reviewed April 2026. These general suggestions do not establish eligibility or an available appointment. |
| [SAMHSA: How to Pay for Mental Health, Drug, or Alcohol Treatment](https://www.samhsa.gov/find-support/how-to-pay-for-treatment) | Asking about costs before starting treatment and discussing affordability with the provider. The source’s article says last updated April 24, 2023; its content was fetched and read during this October 24, 2026 implementation. |
| [SAMHSA: Free and Low-Cost Treatment Options](https://www.samhsa.gov/find-support/how-to-pay-for-treatment/free-or-low-cost-treatment) | Asking about income-based fees, lower-cost options, assistance, health centers, and state agencies. These are options to ask about in the United States, not guarantees. The source article says last updated April 24, 2023; its content was fetched and read during this implementation. |
| [FindTreatment.gov](https://findtreatment.gov/) | Linked as the U.S. treatment locator identified by the NIMH primary guide. The direct browser text fetch exposed only its application shell; individual listings, filtering, capacity, fees, and eligibility were not inspected or verified. No locator form was used. |
| [NHS: How to access mental health services](https://www.nhs.uk/mental-health/social-care-and-your-rights/how-to-access-mental-health-services/) | GP discussion and referrals, plus some self-referral routes. The fetched source says last reviewed May 5, 2026. The page labels this pathway as England, rather than implying identical access arrangements throughout the United Kingdom or elsewhere. |
| [NHS: Find talking therapies for anxiety and depression](https://www.nhs.uk/nhs-services/mental-health-services/find-nhs-talking-therapies-for-anxiety-and-depression/) | England self-referral criteria: generally 18 and over, or 16–17 in some areas; a service assesses whether it can help. The fetched page says last reviewed February 14, 2025. The prototype links to the informational page without starting a referral. |
| [Find A Helpline information](https://findahelpline.com/about) | The international fallback provides emotional-support options chosen by country. It is not represented as a worldwide therapist-booking directory. The crisis service/source checks above also apply to the page’s immediate-support summary and existing support panel. |

The normal browser research fetch returned HTTP 403 for the SAMHSA articles. Their exact primary HTML pages were successfully retrieved using a standard browser User-Agent, and the complete article content was extracted separately from the site navigation and read. No access challenge, login, or account was used. This is a source-content check, not a completed browser walkthrough of any external treatment service.

The question about respecting faith/preferences and the language about a trusted pastor accompanying professional care are editorial suggestions reflecting the founder’s request. They are not attributed to NIMH or presented as clinical instructions. The page keeps the Trinitarian foundation explicit, welcomes people exploring faith or simply seeking help, and does not require a religious declaration or donation.

All links are fixed, carry no prayer text or identity query parameters, and use `noreferrer` for external websites. Links are real and user-initiated; no service availability, cost, recovery, or treatment outcome is promised. A current human resource review remains required before accepting real users.
