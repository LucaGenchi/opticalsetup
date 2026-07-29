# OpticalSetup Visibility and Launch Strategy

**Status:** Working marketing playbook  
**Last verified:** 2026-07-29  
**Primary goal:** Make OpticalSetup the default browser tool people discover when they need to sketch, teach, explain, publish, or share a 2D optical setup.

> Contact details and platform rules change. Re-check every linked official page immediately before outreach. Use only publicly listed professional addresses, personalize every message, and send at most one follow-up.

## Executive summary

OpticalSetup already has a marketable combination that is unusual in optics software:

- free, browser-based, and usable without an account;
- a large, realistic optical-element library with live qualitative ray tracing;
- publication-ready SVG/PNG export;
- self-contained share links and QR codes;
- explicit, honest boundaries between simulated behavior and diagram-only behavior;
- classroom examples, laboratory examples, detector readouts, pulse timing, polarization, dispersion, and editable freeform glass;
- open source and installable as an offline-capable web app.

The highest-leverage strategy is **not** broad paid advertising. It is a coordinated sequence:

1. Package the product so a journalist, lecturer, or researcher understands it in under 30 seconds.
2. Publish concrete example pages that rank for the setups people already search for.
3. Launch to optics media, educators, open-source communities, and scientific-software communities with different pitches.
4. Turn every good user-created setup into another searchable page, shareable artifact, and reason to return.
5. Measure activation, exports, shares, backlinks, classroom adoption, and repeat use—not vanity traffic alone.

The central positioning should be:

> **Sketch an optical setup in your browser, watch the rays update live, and export a paper-ready figure—free, without an account.**

Do not position OpticalSetup as a replacement for Zemax, Code V, FRED, COMSOL, or calibrated propagation software. Position it as the fastest path from an idea, classroom explanation, lab discussion, or paper draft to a clear optical diagram with useful qualitative physics.

---

## 1. Audience and message map

| Audience | Primary problem | Message | Proof to show |
|---|---|---|---|
| Optics researchers and lab teams | Diagram tools are slow; slideware is not optics-aware | Build and revise bench diagrams quickly, then export SVG/PNG | A realistic microscopy, interferometer, OPO, or spectroscopy setup |
| Educators and students | Static ray diagrams do not respond to parameter changes | Place components and see qualitative ray paths update immediately | Telescope, microscope, image formation, polarization, and dispersion examples |
| Optical engineers | Early communication happens before a full design model exists | Create a clear concept sketch before moving to calibrated design software | Fast editing, component-specific controls, share links, honest scope |
| Scientific illustrators and communicators | General drawing tools require manual ray geometry | Produce editable vector figures with optics-specific components | SVG export and figure-frame workflow |
| Open-source/scientific-software users | Existing tools may require installs, accounts, or proprietary files | Open the URL and use it immediately; inspect or contribute to the source | Public GitHub repository, no build step, offline-capable PWA |
| Vendors and societies | They need useful educational content, not another generic ad | Co-create neutral tutorials and application examples | Branded only at the article level; never compromise component neutrality |

### Message hierarchy

Use this order in headlines, pitches, and social posts:

1. **Immediate utility:** browser-based optical setup sketching.
2. **Visible magic:** live ray tracing while components move.
3. **Practical output:** SVG/PNG export and shareable links.
4. **Low friction:** free, no install, no signup.
5. **Trust:** qualitative physics with clearly stated limitations.
6. **Depth:** broad element library, examples, pulse timing, polarization, detectors, freeform glass, community setups.

Avoid leading with a long component list. The list is supporting evidence, not the headline.

---

## 2. Launch readiness: assets to create first

Editorial outreach should begin only after the following assets exist.

### Required assets

- **A 60–90 second demo video** showing:
  1. open the canvas;
  2. place a laser, lens, mirror, and detector;
  3. move an element and show the path update;
  4. load a strong example;
  5. export SVG;
  6. copy a share link.
- **A press page** at a stable URL such as `/press/` containing:
  - one-sentence description;
  - 50-word and 150-word descriptions;
  - founder names and short bios;
  - launch date and location;
  - high-resolution logo;
  - square and landscape screenshots;
  - demo video;
  - GitHub and product links;
  - public contact address;
  - license and attribution guidance.
- **Six canonical demo setups** with permanent URLs:
  - microscope;
  - Mach–Zehnder interferometer;
  - fluorescence microscopy path;
  - grating spectrometer;
  - pulsed-laser delay line;
  - telescope or camera image formation.
- **A one-page “Why OpticalSetup?” comparison** that clearly separates:
  - drawing/communication;
  - qualitative ray behavior;
  - calibrated optical design.
- **A release/changelog entry** that gives the launch a concrete date and version.
- **A public roadmap** with a small number of understandable themes.
- **A contact inbox** on the project domain, for example `hello@opticalsetup.com` or `press@opticalsetup.com`, rather than relying only on personal LinkedIn profiles.
- **Privacy-respecting analytics** with campaign parameters and event tracking.

### Strongly recommended assets

- “Made with OpticalSetup” badge and optional attribution snippet.
- Embeddable, read-only setup viewer.
- A downloadable classroom handout with three exercises.
- A public gallery with filters for education, research, microscopy, spectroscopy, interferometry, lasers, and imaging.
- Two short testimonials from real researchers or instructors, with permission.
- A 20–30 second looping GIF for social posts and press emails.
- An issue template for “Request an optical element.”
- A contribution guide suitable for first-time scientific-software contributors.

---

## 3. Product packaging and website changes

The current landing page already communicates free browser access, live ray tracing, export, sharing, and honest simulation scope. The next visibility gains will come from **specific entry pages**, not from making the homepage longer.

### High-priority pages

Create pages around real search intent:

- `/optical-setup-drawing-tool/`
- `/ray-optics-simulator/`
- `/optics-lab-diagram-maker/`
- `/scientific-figure-optics/`
- `/teaching-geometric-optics/`
- `/examples/michelson-interferometer/`
- `/examples/mach-zehnder-interferometer/`
- `/examples/fluorescence-microscope/`
- `/examples/grating-spectrometer/`
- `/examples/laser-cavity/`
- `/examples/telescope-ray-diagram/`

Each page should contain:

- a working embedded or one-click-load example;
- a short explanation of the setup;
- what OpticalSetup models;
- what it does not model;
- one export image;
- one direct call to open or remix the setup;
- internal links to the relevant wiki pages;
- a unique title, description, canonical URL, and social image.

Do not generate hundreds of nearly empty pages. Publish fewer pages with real explanatory value, diagrams, and reusable setups.

### Structured data and technical SEO

Add and validate:

- `SoftwareApplication` structured data for the product;
- `VideoObject` for the demo;
- `FAQPage` only for visible, genuine FAQs;
- descriptive image alt text;
- a large landscape social preview image in addition to the square asset;
- breadcrumb markup on example and wiki pages;
- canonical links across the main domain and GitHub Pages mirror;
- updated sitemap entries for every substantive example and guide.

### GitHub discoverability

Add accurate repository topics, up to the GitHub limit. Suggested set:

`optics`, `photonics`, `ray-tracing`, `geometric-optics`, `scientific-visualization`, `scientific-software`, `optical-design`, `physics-education`, `svg`, `web-app`, `open-source`, `pwa`

Also add:

- a strong repository social preview;
- three screenshots near the top of the README;
- a concise “Try it now” call to action before the feature inventory;
- `CITATION.cff` so academic users can cite the project;
- a tagged release with release notes;
- contribution and code-of-conduct files;
- issue labels for `good first issue`, `optical-element`, `physics`, `documentation`, and `example-setup`.

GitHub documents that repository topics help people discover and contribute to projects:  
https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics

---

## 4. The launch sequence

A single announcement is easy to miss. Use a staged launch in which each audience gets a tailored story.

## Phase 0 — preparation, 10–14 days

- Finish the press page, demo video, screenshots, canonical examples, analytics, and tagged release.
- Recruit 10–20 private testers:
  - 5 optics researchers;
  - 5 educators or students;
  - 3 scientific-software developers;
  - 2 scientific illustrators or communicators.
- Ask each tester one question: “What would stop you from using or recommending this?”
- Fix the top three repeated blockers.
- Collect permission for quotes and example screenshots.
- Prepare a contact sheet with one tailored angle per recipient.
- Warm up community accounts by participating normally before posting the project.
- Draft launch posts, but rewrite them manually for each platform.

## Phase 1 — launch week

### Day 1: owned channels

- Publish the release, press page, video, and launch article.
- Update GitHub README, topics, social preview, release notes, and `CITATION.cff`.
- Post from the founders’ LinkedIn accounts with a short demo, not a logo.
- Ask existing users for **feedback and examples**, not votes.

### Day 2: optics trade media

Send individual pitches to the top five specialized outlets. Offer:

- a direct no-signup demo;
- two screenshots;
- the 60–90 second video;
- a founder interview;
- a neutral guest article about communicating optical setups;
- a ready-to-test example link.

### Day 3: educators and societies

Contact physics/optics instructors, Optica and SPIE student chapters, and teaching communities with:

- a three-exercise classroom pack;
- a no-account student workflow;
- a request for a 30-minute classroom pilot;
- an offer to add missing teaching examples.

### Day 4: technical communities

Post a **Show HN** only when the tool is directly usable and the founders can stay in the thread. The official guidelines explicitly favor projects people can try without barriers and prohibit soliciting votes or comments:  
https://news.ycombinator.com/showhn.html

Suggested title:

> Show HN: OpticalSetup – sketch optical benches with live ray tracing in the browser

The opening comment should explain why it was built, what is technically interesting, the qualitative scope, and what feedback is most useful. It should not read like an advertisement.

### Day 5: scientific and optics communities

Post transparently in relevant communities only after reading their rules. Potential communities include:

- r/Optics
- r/lasers
- r/Physics
- r/PhysicsStudents
- scientific Python and scientific visualization communities, where relevant
- optics and photonics LinkedIn groups
- Mastodon/Bluesky communities around open science and scientific software

Reddit states that promotional content is not automatically spam, but community rules vary and some communities apply a 10% self-promotion norm. Contribute useful answers before and after posting:  
https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community

### Day 6 or later: Product Hunt

Product Hunt is secondary, not the core optics audience. Use it for broader software visibility after the specialist launch has produced stronger screenshots and comments.

Current Product Hunt guidance favors live, useful digital products and recommends a direct product URL, short tagline, multiple gallery images, a video, and a maker comment:  
https://help.producthunt.com/en/articles/479557-how-to-post-a-product  
https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines

Do not organize artificial upvotes. Ask people to try the product and leave genuine feedback only if they independently choose to participate.

## Phase 2 — first 30 days

- Publish one strong example or tutorial each week.
- Convert common support questions into FAQ/wiki improvements.
- Follow up once with journalists who received a tailored pitch and did not reply.
- Offer two guest articles:
  - “How to make optical setup figures that remain scientifically honest”
  - “Where qualitative ray tracing helps—and where it should stop”
- Run five educator pilots and publish the resulting lesson plans with permission.
- Recreate one notable public optical setup from a paper each week, with full citation and no implication of author endorsement.
- Add community submissions to a curated gallery.
- Ask early adopters to link to the specific setup they used, not merely the homepage.

## Phase 3 — days 31–90

- Publish a monthly “Optical setup of the month.”
- Launch a small contributor program for examples, wiki pages, and component validation.
- Partner with one university course or student chapter on a public challenge.
- Pitch podcasts and webinars using actual adoption data and user stories.
- Add localized landing pages only when a fluent reviewer can maintain them.
- Approach component vendors for neutral educational collaborations after editorial credibility is established.
- Consider a small paid newsletter or event experiment only after the site demonstrates that qualified visitors activate and return.

---

## 5. Editorial and media outreach list

### Use of this list

- These are **publicly listed professional contacts or official submission routes**.
- Verify every address and role on the linked official page before sending.
- Send one individualized email, not a bulk campaign.
- Explain why the story fits that exact outlet.
- Do not attach large files; link to the press page.
- Offer an interview, demo, screenshots, and a temporary embargo only when there is genuine news.
- Do not claim calibrated accuracy or position the tool as a professional optical-design replacement.

### Priority A: specialist outlets

| Outlet | Public contact | Best angle | Official source |
|---|---|---|---|
| Photonics Spectra / Photonics Media | `editorial@photonics.com`; press-release form | Free browser tool for optical diagrams; open-source scientific visualization; publication-ready SVG | https://www.photonics.com/Articles/Contact-Information/a35705 and https://www.photonics.com/prsubmit |
| Laser Focus World | Sally Cole Johnson, `sallyj@endeavorb2b.com`; Lee Dubay, `ldubay@endeavorb2b.com` | Technical news, software workflow, education, or contributed feature on optical communication/diagramming | https://www.laserfocusworld.com/submission-guidelines and https://digitalinfrastructure.endeavorb2b.com/laser-focus-world/ |
| optics.org | Matthew Peach, `matthew.peach@optics.org` | Open-source photonics software, practical lab communication, education and industry workflow | https://optics.org/publications/ar-vr-mr-focus |
| Optics & Photonics News (Optica) | `opn@optica.org`; Bibiana Campos Seijo, `BCamposSeijo@optica.org` | Tutorial/commentary angle; optics education; scientific communication; community resource | https://www.optica-opn.org/home/contact and https://www.optica-opn.org/home/author/ |
| Electro Optics | Jessica Rowbury, `jessica.rowbury@europascience.com` | Engineer workflow, open tools, industry/education challenges, opinion or analysis | https://www.electrooptics.com/news/engineers-let-us-know-what-s-bothering-you |
| Novus Light Technologies Today | Anne Fischer, `anne.fischer@novustoday.com`; Robert Molenaar, `robert.molenaar@novustoday.com` | Optical design, alignment, microscopy, imaging, education, and open scientific software | https://www.novuslight.com/about_9.html |
| Physics World | `pwld@ioppublishing.org` | Broader physics audience: how interactive optical sketches improve teaching and research communication | https://physicsworld.com/p/contact-us/ and https://physicsworld.com/p/authors/features-pitch-guide/ |
| The Physics Teacher (AAPT) | `tpt@aapt.org` | Classroom activity, interactive ray optics, assignment design, or teaching note | https://www.aapt.org/Publications/tptauthors.cfm |

### Priority B: societies, journals, and broader science channels

| Organization/outlet | Public contact | When to use | Official source |
|---|---|---|---|
| Optica newsroom/media relations | `mediarelations@optica.org` | Partnership, society/community initiative, or substantial optics-community news—not a generic product blast | https://www.optica.org/about/newsroom/ |
| Nature Photonics editorial office | `naturephoton@nature.com` | Only for a genuinely suitable Comment, Correspondence, or editorial idea; not a routine launch announcement | https://www.nature.com/nphoton/contact |
| Product Hunt support | `hello@producthunt.com` | Only for a critical launch-account or eligibility question | https://help.producthunt.com/en/ |
| Hacker News moderators | `hn@ycombinator.com` | Only for a rules/moderation question; never to request promotion | https://news.ycombinator.com/newsguidelines.html |

### Journalist selection rule

Prefer the editorial desk or the editor whose published beat matches the pitch. A smaller, highly relevant outlet is more valuable than a generic technology list with no optics readership.

Before pitching a named journalist:

1. Read their five most recent relevant articles.
2. Reference one specific coverage theme, not empty praise.
3. Offer a story angle, not merely “please write about our product.”
4. State what is new, who uses it, and why it matters now.
5. Include a direct demo link and two proof points.
6. End with a low-pressure question.

---

## 6. Pitch angles that can earn coverage

A product announcement alone is weak. Build pitches around useful stories.

### Angle 1: scientific figures without slideware

**Claim:** Optical setups are often communicated in tools that know nothing about optics. OpticalSetup lets researchers manipulate optics-aware components and export vector figures.

**Proof:** SVG export, figure frame, broad component library, live ray updates.

### Angle 2: no-account interactive optics teaching

**Claim:** Students can open a link, modify a setup, and share the result without creating accounts or installing software.

**Proof:** self-contained links, examples, no server-side scene storage, browser workflow.

### Angle 3: honest qualitative simulation

**Claim:** The product labels what is simulated, what needs configuration, and what is diagram-only instead of implying laboratory-grade precision.

**Proof:** documented simulation scope and capability states.

### Angle 4: open-source lab communication

**Claim:** A research group can discuss and share a bench concept before investing time in a calibrated design model.

**Proof:** instant browser access, JSON save/load, URL sharing, GitHub source.

### Angle 5: optical diagrams as reusable web objects

**Claim:** A setup can become a share link, QR code, community example, wiki illustration, teaching exercise, or publication figure.

**Proof:** share links, read-only community pages, export, gallery.

### Angle 6: AI-assisted building, human scientific review

The project can discuss how modern AI-assisted development accelerates scientific software construction while domain experts define physics boundaries and validate behavior. Use this angle carefully: the story must center on the resulting scientific tool, verification process, and lessons learned—not hype about AI replacing expertise.

---

## 7. Outreach email templates

### Specialist journalist

**Subject:** Browser-based optical setup builder with live ray tracing

Hi [Name],

We have released OpticalSetup, a free open-source browser tool for sketching 2D optical benches. Users can place real optical components, see qualitative ray paths update live, share a self-contained setup link, and export a paper-ready SVG or PNG without installing software or creating an account.

The part that may fit your coverage is [specific angle tied to their beat]. A representative setup is here: [direct example URL]. The 75-second demo and press images are here: [press URL].

It is deliberately not presented as a Zemax/Code V replacement: the interface states where the physics is qualitative and where an element is diagram-only.

Would a short briefing, independent test, or contributed technical article be useful?

Best,  
[Name]  
[Role]  
[Project-domain email]

### Educator or course lead

**Subject:** No-account interactive optical setups for [course/lab]

Hi [Name],

We built a free browser tool that lets students place lenses, mirrors, sources, filters, and detectors and see the qualitative ray paths update immediately. A setup can be shared as a link, so students do not need accounts or installations.

I prepared a [topic] example and a short three-step exercise for [course/module]: [URL].

Could you test it in one class or lab section and tell us what is missing or misleading? We can add a suitable example or clarify the physics scope based on your feedback.

Best,  
[Name]

### Community post

I built OpticalSetup because drawing optical benches in general-purpose tools is slow, while full optical-design software is excessive for many teaching, discussion, and figure-making tasks.

It runs in the browser with no account. Place components, move them, watch qualitative ray paths update, then export SVG/PNG or share the setup as a self-contained link.

Demo: [URL]  
Source: [GitHub URL]

It is not a calibrated design package; the simulation boundaries are documented. Feedback on [one or two specific questions] would be most useful.

---

## 8. Education growth loop

Education can create durable repeat use and backlinks.

### Classroom package

Publish a small, versioned package with:

- instructor notes;
- learning objectives;
- three exercises;
- answer setups as hidden or separate links;
- a warning about qualitative versus calibrated predictions;
- accessible color and labeling guidance;
- a stable URL instructors can cite in a syllabus.

Initial modules:

1. Thin-lens image formation.
2. Telescope and microscope ray diagrams.
3. Polarizers and waveplates.
4. Prism and grating dispersion.
5. Michelson and Mach–Zehnder layouts.
6. Fluorescence excitation/emission paths.
7. Pulsed timing and delay lines.
8. Detector selection and qualitative readouts.

### Instructor outreach

Build a hand-curated list of 30–50 instructors who publicly teach:

- geometric optics;
- experimental optics;
- photonics laboratories;
- microscopy;
- lasers;
- scientific visualization.

Contact them individually through their public institutional addresses or department contact pages. Do not scrape or buy lists. Ask for a pilot and specific criticism, not an endorsement.

### Student chapter program

Offer Optica and SPIE student chapters:

- a one-hour “diagram your lab” workshop;
- a setup recreation challenge;
- recognition on the community gallery;
- a contribution pathway for missing elements or wiki pages.

This produces examples, contributors, classroom use, and society-adjacent visibility without paying for generic reach.

---

## 9. Research and open-source growth loops

### “Recreate this setup” series

Each month, recreate a publicly described setup from an open-access paper or preprint:

- cite the paper prominently;
- link to the source;
- state that the recreation is interpretive and not author-endorsed;
- invite the authors to correct it;
- never reuse copyrighted figures without permission;
- publish the OpticalSetup link and an original exported diagram.

This creates highly relevant pages, author outreach, backlinks, and concrete proof.

### Citation and academic use

Add `CITATION.cff` and a “How to cite” section. When the software is stable enough, archive a release on Zenodo to obtain a DOI. Encourage users to cite the exact version used.

Track:

- papers and theses mentioning OpticalSetup;
- course pages linking to it;
- GitHub dependents/forks;
- community examples;
- exported figure credits.

### Contributor flywheel

Create small, reviewable contribution types:

- example setup JSON;
- wiki corrections;
- element reference images created by the contributor;
- test cases;
- translation reviews;
- physics validation notes.

Not every contributor should need to modify the ray-tracing engine.

---

## 10. Content plan

Publish one substantial piece every two weeks and repurpose it into a short video, LinkedIn post, community setup, and newsletter item.

### First 12 topics

1. How to draw an optical setup for a paper without PowerPoint.
2. Michelson vs. Mach–Zehnder: interactive layouts.
3. Building a fluorescence microscope excitation and detection path.
4. What qualitative ray tracing can and cannot tell you.
5. How dichroics differ from generic beamsplitters in real setups.
6. Grating versus prism spectrometers.
7. Visualizing polarization with Stokes parameters.
8. Pulsed lasers, repetition rate, and optical delay paths.
9. Choosing a detector: photodiode, PMT, camera, power meter, polarimeter, or spectrometer.
10. Recreating a published optical setup responsibly.
11. Making SVG optical figures that survive manuscript revisions.
12. How an open-source optics component library is validated.

Every article should lead to a setup users can open and modify.

---

## 11. Paid visibility: use only after activation is proven

Do not buy broad traffic before measuring whether qualified visitors open the canvas, build something, export/share, and return.

### Budget tiers

**$0–$500**

- demo editing;
- press screenshots;
- captions/transcripts;
- a domain email inbox;
- small design improvements;
- educator materials.

**$500–$2,000**

- a carefully chosen specialist newsletter sponsorship;
- a small webinar production budget;
- travel support for a student chapter workshop;
- professional editing of the press/demo assets.

**$2,000+**

Consider only after organic conversion is understood:

- sponsored webinar with a relevant optics outlet;
- event newsletter placement;
- society or conference sponsorship;
- retargeting only where consent and privacy requirements are satisfied.

Never pay for backlinks, fake reviews, votes, followers, bulk email lists, or undifferentiated “press release distribution” packages.

---

## 12. Measurement

### North-star behavior

A **qualified activated session** is a visit in which the user performs a meaningful workflow, for example:

- opens or creates a setup;
- places or edits at least three elements;
- spends enough time to inspect the result;
- exports, saves, or shares.

The exact definition should be tested, not assumed.

### Events to measure

- landing-page view;
- open-canvas click;
- example loaded;
- first element placed;
- third element placed;
- inspector changed;
- export SVG;
- export PNG;
- save JSON;
- share link created;
- community submission started/completed;
- return visit;
- referral source and campaign.

Do not collect setup contents or personally identifying data unless clearly needed, disclosed, and consented to.

### 90-day operating targets

Treat these as hypotheses to revise after two weeks of data:

- 20 individualized editorial pitches;
- 5 meaningful editorial replies;
- 2 earned-media mentions or interviews;
- 30 educator contacts;
- 5 classroom pilots;
- 12 published example/tutorial pages;
- 3 well-prepared community launches;
- 25 referring domains from relevant sites;
- 100 user-created share links from non-team users;
- 20 accepted community setups or substantive contributions;
- a measurable increase in returning users and export/share completion.

### Weekly review

Review:

1. Which source sends users who activate?
2. Which example creates the most exports/shares?
3. Where do users abandon the workflow?
4. Which pitch angle gets replies?
5. Which requested elements or examples repeat?
6. What created a backlink or classroom adoption?
7. What work produced traffic with no activation and should stop?

---

## 13. Outreach operations and anti-spam rules

- Use a spreadsheet or lightweight CRM with: outlet, person, role, public source URL, angle, date sent, reply, follow-up date, result.
- Send no more than five high-quality media pitches per day.
- Personalize the first two sentences.
- Link to assets; do not attach large unsolicited files.
- Use one clear call to action.
- Follow up once after 5–7 business days with one new fact, example, or milestone.
- Stop after no response.
- Honor opt-outs immediately.
- Do not use tracking pixels in one-to-one journalist outreach.
- Do not conceal the founders’ relationship to the project.
- Do not manufacture urgency, user counts, quotes, or endorsements.
- Keep a record of the official page that published each address.
- Remove or update contacts when roles change.

---

## 14. Immediate action checklist

### This week

- [ ] Add a project-domain contact inbox.
- [ ] Create `/press/`.
- [ ] Record the 60–90 second demo.
- [ ] Select six canonical examples.
- [ ] Add GitHub topics and social preview.
- [ ] Add `CITATION.cff`.
- [ ] Define privacy-respecting activation analytics.
- [ ] Recruit 10–20 private testers.
- [ ] Fix the top repeated blockers.

### Next week

- [ ] Publish a tagged release and launch article.
- [ ] Send five personalized specialist pitches.
- [ ] Contact ten instructors for pilots.
- [ ] Publish the first classroom exercise.
- [ ] Prepare the Show HN post and founder comment.
- [ ] Prepare one transparent, rules-compliant optics community post.
- [ ] Schedule Product Hunt only after assets and early feedback are strong.

### First month

- [ ] Publish four example/tutorial pages.
- [ ] Run five classroom pilots.
- [ ] Publish two user stories.
- [ ] Recreate one open-access published setup.
- [ ] Secure the first five relevant backlinks.
- [ ] Review acquisition-to-activation data and stop low-quality channels.

---

## Sources and verification pages

All pages below were checked on 2026-07-29. Re-check before use.

- OpticalSetup repository and current product description: https://github.com/LucaGenchi/optics-sketch
- OpticalSetup website: https://opticalsetup.com/
- Photonics Media contact information: https://www.photonics.com/Articles/Contact-Information/a35705
- Photonics Media press-release submission: https://www.photonics.com/prsubmit
- Laser Focus World submission guidelines: https://www.laserfocusworld.com/submission-guidelines
- Laser Focus World team contacts: https://digitalinfrastructure.endeavorb2b.com/laser-focus-world/
- optics.org editorial contact page: https://optics.org/publications/ar-vr-mr-focus
- OPN contact page: https://www.optica-opn.org/home/contact
- OPN author/submission guidance: https://www.optica-opn.org/home/author/
- Electro Optics editorial invitation/contact: https://www.electrooptics.com/news/engineers-let-us-know-what-s-bothering-you
- Novus Light editorial team: https://www.novuslight.com/about_9.html
- Physics World contact page: https://physicsworld.com/p/contact-us/
- Physics World feature pitch guide: https://physicsworld.com/p/authors/features-pitch-guide/
- AAPT / The Physics Teacher author information: https://www.aapt.org/Publications/tptauthors.cfm
- Optica newsroom: https://www.optica.org/about/newsroom/
- Nature Photonics contact page: https://www.nature.com/nphoton/contact
- Hacker News Show HN guidelines: https://news.ycombinator.com/showhn.html
- Hacker News general guidelines: https://news.ycombinator.com/newsguidelines.html
- Product Hunt posting guide: https://help.producthunt.com/en/articles/479557-how-to-post-a-product
- Product Hunt featuring guidelines: https://help.producthunt.com/en/articles/9883485-product-hunt-featuring-guidelines
- Reddit spam/self-promotion guidance: https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community
- GitHub repository topics documentation: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
