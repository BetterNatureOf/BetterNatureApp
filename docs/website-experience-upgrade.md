# Website experience upgrade

Continues `feat/website-motion`. Scope is the public website. Authenticated operations screens and backend rescue policies are unchanged.

## Implemented surfaces

| Surface | Change | Verification |
| --- | --- | --- |
| Whole site | Device-following light/dark appearance initialized before CSS, persistent optional override, OS changes and cross-tab preference updates | Browser scenarios at 390, 768 and 1440 px |
| Navigation | Adaptive BN pointer with native text-entry fallback, accessible appearance selector, skip link, immediate mobile menu initialization independent of remote CMS | Browser interaction checks |
| Hero and cards | Forest-tinted neutrals, consistent sans typography, real existing images, less glass, no particles or pointer tilt | Before/after screenshots |
| Chapter explorer | Lazy ECharts regional chapter/member comparison, explicit missing member counts, region drill-down, CSV download, accessible data table | Aggregation tests and browser scenarios |
| Directory | Failed reads differ from successfully empty reads; published fallback is labeled | Failure fixture in browser verification |
| Impact | Disclosure separates live counters from published baseline floors; warns that service counts are not unique-person counts and environmental numbers need a methodology | Code inspection and browser rendering |
| Motion | Anime.js owns only explorer entrance; existing Motion owns section/title effects; CSS owns homepage and button feedback | Reduced-motion browser scenarios and normal-motion smoke check |

## Reference and dependency decisions

Reviewed November 25, 2026. Reference patterns are implemented in the existing static-site architecture. No React runtime or paid template was added to the public site.

| Resource | Documentation/source | License | Decision and integration |
| --- | --- | --- | --- |
| React Bits | https://reactbits.dev/text-animations/count-up and https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md | MIT with Commons Clause condition; not plain MIT | Reviewed formatted counter/reveal patterns. Preserve existing counters and avoid importing a second React animation stack. No component source copied. |
| Watermelon UI | https://ui.watermelon.sh/installation and https://ui.watermelon.sh/blocks | Platform MIT, https://github.com/WatermelonCorp/watermelon-platform/blob/main/LICENSE | Use composition principles for the split intro/data surface and responsive toolbar. Existing HTML/CSS implementation; no template source copied. |
| Kokonut UI | https://kokonutui.com/docs and https://github.com/kokonut-labs/kokonutui | Free catalog MIT; Pro is separate | Adapt feedback/empty-state principles into loading, source, missing-count and failed-chart states. No paid components or source copied. |
| Apache ECharts | https://echarts.apache.org/handbook/en/basics/import/ | Apache-2.0; ZRender BSD | Installed 6.0.0, tree-shaken core/bar/grid/tooltip/SVG. Lazy import near chapter explorer, ResizeObserver, disposal on page exit. |
| Anime.js | https://animejs.com/documentation/animation/ | MIT | Installed 4.2.2 with animation-only import. One bounded explorer entrance; no ownership overlap with Motion. Revert on reduced-motion change and exit. |

Actual runtime dependency license and notice files are distributed in `website/vendor/licenses/`; generated bundle legal notices remain beside the bundles. Build dependencies are development-only. Existing Motion/map engines remain in the website; this pass does not replace them.

## Build and preview

From the repository root:

```
npm ci --prefix website
npm run build --prefix website
npm run test --prefix website
npm run test:browser --prefix website
python3 -m http.server 8765 --directory website --bind 127.0.0.1
```

Browser checks use installed Google Chrome on macOS when present. Otherwise install Playwright Chromium, or set CHROME_PATH. Review output defaults to `/tmp/bn-website-review`; set BN_REVIEW_DIR to change it. The script starts its own temporary static server.

The generated `website/vendor/` bundles are checked in for the existing no-build static hosting workflow. No app dependency changes or production deployment are required to review locally.

## Data and operational limits

- Chart data is only public chapter region and optional reported member count from the existing directory read. It is not a rescue volume or beneficiary chart.
- Missing member counts are null and excluded from sums, not silently set to zero. Reported chapter memberships may overlap.
- No historical data is available through this public directory reader, so date filters, trends, comparisons and Sankey diagrams are deliberately absent.
- The chart has table and keyboard-operable region alternatives. Failed chart loading exposes the table automatically.
- Existing published impact floors are retained and disclosed, not independently verified. Environmental estimates lack a published methodology here.
- No new external write, authentication change, notification or deployment was performed.
- The immersive maps and third-party donation embeds retain their own styling. Full map/provider accessibility and third-party checkout conformance are outside this pass.
- This is not a claim that every page meets WCAG AA. Automated checks target the new explorer and appearance control, followed by visual checks; existing content and integrations need broader review.
- The attached broader app-dashboard specification remains future scope; this pass continues the newest public website as requested.

## Performance

The ECharts and Anime.js bundles are not requested on initial hero rendering. ECharts imports only the required chart family and SVG renderer. The standard HTML table is usable if either deferred bundle fails. Removed continuously running particle and card-tilt code. The new adaptive pointer renders only on pointer/scroll events, uses a crisp BN highlight, and returns to native behavior for text-entry controls, touch, reduced motion and forced colors. Bundle sizes and browser results are recorded after validation below.

## Validation results

- Static bundle build passed; all modified JavaScript syntax checks and `git diff --check` passed.
- Four data tests passed, covering missing counts, recorded zero, directory totals, empty input and CSV formatting.
- Six browser combinations passed (390/768/1440 px, light/dark), including chart drill-down, export, system-theme changes, explicit preference persistence, reduced-motion rendering and no horizontal document overflow.
- Failed-directory plus blocked-chart fixture passed, retaining a labeled published list and accessible table.
- Axe found zero violations in the new explorer and appearance control in those six combinations. This is a scoped automated result, not whole-site certification.
- No uncaught page errors in those scenarios.
- Deferred bundles: ECharts 496,299 bytes raw / 167,634 gzip; Anime.js entrance 26,923 raw / 11,174 gzip. No Lighthouse or real-device cellular performance measurement was performed.
- Screenshots and machine-readable browser results are in the local review output directory.


## Browser-review follow-up

Implemented the marked review feedback in the local website:
- Page order now follows primary navigation: Mission, Programs, Impact, How it works, Find a chapter. Supplemental maps follow the directory. Header-aware section links replace a hard-coded 70px offset.
- Card insets and gaps corrected; impact cards use controlled Liquid Glass. Donation glow removed and checkout is compact and opt-in.
- Existing hero photos now load locally without cropping; three programs receive equal image sizes. Superseded by the November 25 homepage redesign below.
- Fixed the zero-height map canvas caused by a late-loaded map-library position rule. Added resize/teardown handling, clearer streets, local default view, centered world legend and theme-aware surfaces. No chapter flower badges.
- Program action buttons now enter the app root/welcome flow. Navigation distinguishes How it works from the chapter directory.
- Signup has a distinct theme-aware surface and a local 200px SVG QR. Browser-rendered QR decoded successfully to the app URL in light/dark and mobile/desktop checks.
- Added blog.html, published-only article rendering, search/topic filtering, explicit empty state, and separate-page links. No stories are fabricated; configure actual posts before publishing stories.
- Selected workflow tabs now have strong pill styling, ARIA selection and arrow-key support.
- Pointer remains BN-colored on graphs and maps, highlights countries/states, merges into small controls and applies a bounded magnetic response with a spring return. Highlighted content stays sharp and the independent cursor disappears.
- Guidance consulted: https://developer.apple.com/design/human-interface-guidelines/pointing-devices and https://developer.apple.com/documentation/uikit/integrating-pointer-interactions-into-your-ipad-app . This is a web adaptation, not native UIPointerInteraction.

### Figma identity work

Editable file: https://www.figma.com/design/hZlsxT6ZvZxMK7mL23PWEq?node-id=1-32

Four vector marks, four reusable components, light/dark token foundations, and a review board were created with the Figma plugin. Read-back confirmed 16 vector layers, four instances, eight editable text nodes, and Inter fonts. Three program SVGs are used on the site; the master-mark direction remains a proposal. No Figma AI generation credits were used. Framer could not be used because its connection was unavailable.

### Follow-up validation

Six unit tests and the static bundle build passed. Browser checks verified page order, program links, distinct signup/donation surfaces, absent glow, QR decoding, theme-aware maps, blog empty/search/detail/safe-text behavior, compact checkout and section offsets. Scoped Axe checks of signup, donation controls and chapter insights passed in 390px/1121px light and dark after correcting donation-button contrast. No uncaught page errors were observed. Browser fixtures are test-only and never create production records.


### Latest pointer and tab checks

- The pointer no longer switches to the system cursor over ECharts, the SVG world map, or the street-map canvas. Native text-entry and embedded checkout behavior remain available.
- Pointer outlines have no blur, backdrop blur, or shadow. Hovered controls stay sharp, use a visible blossom tint, bounded magnetic translation and 1.025 scale. On exit they return through a 420ms damped bounce. Reduced motion disables this enhancement.
- Country/state hover highlights use BN colors; chart tooltips remain owned by the chart library.
- Workflow tabs expose selected state, roving tab focus and Left/Right/Home/End keys.
- Focused pointer checks passed for integrated highlight, jelly state, clear content, reset, country hover and persistent custom cursor over chart SVG.
- Local QR generation uses the qrcode development dependency (MIT); no visitor QR request is sent to an external QR service.

Journal publishing schema in website/content.js or site_content/main.blog.posts:

```js
{ posts: [{ published: true, slug: 'a-real-story', title: 'Approved title', project: 'IRIS', excerpt: 'Approved summary', author: 'Approved author', paragraphs: ['Approved body paragraph'] }] }
```

No sample article is shipped as a real post. The empty page is intentional until approved editorial records exist. `npm run test:review --prefix website` and `npm run test:pointer --prefix website` require the local preview server; the browser test command starts its own server.

### Latest review corrections

- Header Sign up opens the configured app signup route directly; Donate opens the configured Zeffy donation URL. Static HTML provides working fallback destinations before CMS loading.
- Restored and refined the original illustrated IRIS flower, Evergreen forest and Hydro water emblems, updating the existing editable Figma components in place.
- Centered the actual BN logo within the high-error-correction app QR, and added discreet native-share/clipboard handling.
- Compact equal-width metrics, cohesive team cards, clear map detail cards, and removal of redundant chapter and donation actions.

### Donation popup

Replaced the inline checkout disclosure with an animated launch button and native dialog. Zeffy loads only on first open and its frame persists across reopening. The popup provides close, Escape, backdrop dismissal, focus restoration, background scroll lock, a full-screen fallback and reduced-motion behavior. `npm run test:donation --prefix website` verifies these interactions at 390px and 971px using an intercepted form fixture; it does not validate or submit payments. Existing three-width browser review also passes with the live embed.


## Homepage redesign — latest attached brief

The direct request prioritizes the public frontend and main page. This implementation changes the static public website; it does not claim completion of the brief’s separate authenticated operational dashboards.

### Architecture and audit decisions

| Existing area | Owning source | Decision |
| --- | --- | --- |
| Marketing homepage | `website/index.html`, `app.js`, shared CSS | Recompose hero, responsive navigation, program links and section rhythm; preserve CMS rendering and live public reads. |
| Journal | `website/blog.html`, `journal.js` | Retain separate publication flow and honest empty state. |
| Account/role navigation | `src/navigation/MainNavigator.js` and role navigators | Existing Expo/React Native application with volunteer, restaurant, president and executive paths; retain direct account links. No browser-only registry code inserted. |
| Theme foundations | `src/config/theme.js`, website appearance tokens | Public homepage extends existing light/dark CSS tokens. Native tokens are a separate platform implementation. |
| Authentication/database | `src/services/authFirebase.js`, stores, `firestore.rules`, `storage.rules` | Preserve contracts and authorization. No backend or personal data writes. |
| Rescue operations | Functions for receiving sites, dispatch, offers, cargo, release and completion; Worker rescue engine | Preserve operational invariants and confirmed-destination logic. No logistics behavior changed in this visual pass. |
| Deployment | Static website assets, Expo export scripts, Firebase functions/rules and Workers | Existing delivery architecture retained; no production deployment performed. |

### Component selection matrix

| Reference | Verified license / compatibility | Application in this pass |
| --- | --- | --- |
| [Watermelon](https://ui.watermelon.sh/) / [license](https://github.com/WatermelonCorp/watermelon-platform/blob/main/LICENSE) | Platform MIT; React component catalog; public MCP documented at https://ui.watermelon.sh/developers/mcp | Adapt responsive navigation and editorial composition principles in existing HTML/CSS. No template source copied. No new MCP connection needed for public documentation research. |
| [Kokonut UI](https://github.com/kokonut-labs/kokonutui) | MIT free components, React/Tailwind/Motion; paid Pro separate | Adapt restrained magnetic feedback and clear action states. Existing pointer engine and native sharing retained; no additional runtime or paid asset. |
| [Bklit UI](https://bklit.com/docs/theming) / [license](https://github.com/bklit/bklit-ui/blob/main/LICENSE) | MIT; registry charts require a React-oriented stack | Reviewed token-led chart theming and interaction principles. Retain the functioning lazy ECharts explorer and accessible table. Do not add a duplicate chart engine or invent missing historical/rescue data. Bklit skills were evaluated; installing chart-specific skills would not benefit this static implementation. |
| [Anime.js](https://animejs.com/documentation/) | MIT, existing 4.2.2 dependency | Retain bounded explorer motion. CSS handles small homepage interactions; no redundant animation ownership or new dependency. |
| Figma | Existing connected design file | Editable desktop/mobile layout direction at https://www.figma.com/design/hZlsxT6ZvZxMK7mL23PWEq?node-id=4-79 . Reuses token-bound program component instances; layout direction intentionally uses vector emblems while implemented hero uses existing local photographs. |

### Implemented behavior

- Editorial serif headline, compact purpose copy, clear participation/program actions, equal-width program photography and direct links to each program.
- Static hero fallback has the same image geometry as CMS content; no blank hero while remote content loads.
- Tablet header shows Mission, Programs, Impact, Donate and a labeled Menu. Phone header retains Donate and Menu. Expanded navigation exposes account and appearance controls; keyboard opening moves focus into the menu, Escape restores it, outside clicks and section selections dismiss it.
- Shared app link is a quiet rounded icon button with native sharing, clipboard confirmation and a selectable-link fallback. QR and real BN logo remain unchanged.
- Program section uses separators and more deliberate spacing instead of a repeated stack of full card boxes. Existing detailed identities retained.
- Public chapter explorer, maps, signup routes, donation popup and actual-data constraints preserved. Fixed a queued-close/rapid-reopen scroll-lock race found during regression testing.

### Validation and limits

- Six homepage combinations: 390, 971 and 1440 px × light/dark; equal program columns, image decoding, no page overflow, menu behavior and zero Axe violations in header, hero and signup.
- Additional checks: menu account/appearance reachability, section offset after drawer collapse, successful clipboard copy, and reduced motion.
- Three-width existing page review passed. Donation dialog fixtures, pointer checks, bundle build and six data tests are recorded with the final task results.
- Screenshots are local browser evidence; no production, real-device or full-platform accessibility certification is implied. Checkout tests never submit a real payment.
- Authenticated dashboards, operational analytics, new project workflows and native application redesign in the broader document remain outside this public-homepage implementation. They require their own audited changes and authorized-data verification.


## Framer landing and aspect-ratio pass

Created an editable landing composition in the existing [Better Nature — Responsive Landing](https://framer.com/projects/PK2vTIaDpfMvnJEK97oW) project. Native Framer layers include real logo/artwork, purpose copy, working app/chapter/donation links, light/dark tokens, organized text styles and inherited desktop/tablet/phone breakpoints. The desktop is 1200px, tablet 810px and phone 390px. The tagline is preserved verbatim. Framer’s original phone replica caused fatal rendering; rebuilding that replica resolved it. Final desktop/light, tablet/dark and phone/light screenshots were visually reviewed. No publishing action occurred.

The working local site implements the same living-network direction with container-relative heading sizes, a square visual canvas, three equal program pathways and a bounded maximum width. At 800px and below the scene follows the copy; short landscape windows use more compact type and padding. Document height remains content-driven. No fixed viewport height traps content.

Motion follows the user’s attached UX motion guidance: restrained 150ms hover feedback, interruptible menu opening in 180ms and closing in 100ms, immediate ARIA state updates, keyboard focus restoration and reduced-motion fallback. Rapid open/close/open reversals were tested.

`npm run test:ratios --prefix website` checks 14 viewport sizes in both appearances (28 cases): 320×700, 390×844, 768×1024, 800×600, 810×1080, 971×966, 1024×500, 1280×720, 1440×900, 1920×1080, 2560×1080, 3440×1440, 844×390 and 600×300. It verifies horizontal overflow, heading clipping, copy/scene separation, program-card containment and scoped header/cover accessibility. All cases passed. Existing three-width browser review and both donation-dialog fixture sizes also passed. These are local browser checks, not a claim of testing every possible device or publishing the redesign.


## Quiet opening and pink action hierarchy

The opening now contains the preserved tagline, a short program overview, one pink Get involved action and a subtle scroll cue. Removed the three floating project cards, their duplicate photo strip, the second hero action and repeated supporting slogans. Program identities and detail remain in the next sections as visitors scroll. The header’s direct Donate link uses a quiet outline so the primary opening action has the strongest emphasis. No donation/signup destinations changed.

Applied the same hierarchy in the Framer project: moved the existing three program cards below the introduction, retained shared light/dark tokens and preserved responsive replicas. Final desktop/light and phone/dark screenshots were reviewed; mobile spacing and Donate contrast were corrected.

Updated homepage checks assert one opening action, fewer than 40 words of opening copy, and no repeated program-card/photo-strip UI. The 28 viewport/theme checks passed again with the simplified composition and zero scoped header/hero Axe violations.


## Mailchimp-guided opening revision

Reference: https://mailchimp.com/marketing-glossary/landing-pages/ . Applied its guidance on a clear purpose, a specific primary action, concise content, relevant imagery and mobile usability. This is the public homepage; the existing navigation remains available. No conversion-lift claim or A/B experiment is implied.

Rebuilt the cover as a centered tagline, a single short description, pink **Find your chapter** action and one three-panel image strip. Removed the circular image and orbital graphic. The primary action now scrolls to the actual chapter directory and restores focus with header clearance. Project explanations remain below the introduction. Updated the editable Framer composition to the same structure, including its phone image-strip sizing.

Validated 28 viewport/theme combinations and scoped header/cover accessibility, plus the single-action/concise-copy homepage regression. A focused check verifies the primary button is visible without scrolling on desktop, phone and short landscape windows and that it reaches the chapter directory. Saved locally and in Framer; unpublished.


## Gradient and grain accents

The working website decorates the words people and planet with static rose and forest-to-teal text gradients. Food, native forests and waterways use warm terracotta, green and blue respectively, with separate light/dark values. Text-node decoration preserves CMS copy without interpreting it as HTML. The Discover the work below prompt is removed. A small seeded SVG noise tile textures the opening background behind content without an animated loop or external dependency. Forced colors restores solid system text and removes grain.

Six homepage size/theme combinations passed with zero scoped accessibility violations. A focused visual check covers gradient spans, body-text contrast, prompt removal, grain pointer transparency and forced-color fallback. These changes are in the local website; the Framer canvas remains the prior composition.

## Header, founder card and chapter landmarks

Centered the compact Mission / Programs / Impact navigation between the brand and Donate / Menu actions. The expanded menu retains all existing sections, account links and appearance controls. Header, hero and menu checks passed at 28 viewport/theme combinations; the six homepage checks reported no scoped accessibility violations.

Redesigned the founder card with an intentional SK portrait fallback, aligned identity details and a validated outbound LinkedIn profile link. Satvik provided the exact profile URL. LinkedIn returned HTTP 999 to public photo requests and the connected people search supplied no usable photo, so no headshot has been substituted or fabricated. The supplied portrait remains needed to complete that asset.

Added curated, locally hosted landmark photographs for all 11 current chapter cities. Selected cards and strip thumbnails share the same city identity; map pin coordinates and actual fridge photos/directions are unchanged. Matching includes country validation and Bengaluru / accent aliases, with a pin fallback for unknown cities and failed images. Full-size images have a maximum dimension of 1280px; 192px thumbnails reduce strip transfer. Source files, original resolutions, creators, licenses and resize details are recorded in `website/images/chapters/README.md` and `sources.json`. Each selected card shows a city-landmark caption and linked photo/license credit.

Verified all 11 selected photo files decode at high resolution, chapter strip selection, city/country fallbacks, founder link, and scoped header/team/card accessibility. A mobile check at 390px confirms the card fits the viewport and an intentional HTTP 404 reveals the pin fallback; that check isolates the geocoder with a test fixture. These updates are local and unpublished. Framer is unchanged in this round.

## Public launch revision — November 25, 2026

Expanded direct header navigation and kept both Sign in and Sign up visible. Phones use a compact second account-action row. The full menu includes the partner signup route; the repeated partner section is removed. Shared chart, chapter sort and appearance dropdowns now use a keyboard-accessible, theme-aware popover with the original native select as the source of truth and compatibility fallback. Escape, arrow/Home/End keys, selection, outside clicks and theme persistence are covered in browser checks.

Satvik supplied the headshot through a public shared-image link; the photo is now hosted locally in the founder card and his Memphis chapter profile. Added the three founders specified by the user: Rishik Polasa, Pavan Ajithprasad and Punarchithsai Vanamareddy. Pavan's supplied LinkedIn URL is included; the others use initials without fabricated profile links or biographies. Founder cards wrap into a responsive grid.

Chapter details now use a native modal dialog with separate leadership and member groups, position ordering, published headshot support, initials fallback, roster search, focus containment/restoration and Escape dismissal. Public officers and roster entries are deduplicated while different IDs sharing a name remain separate. Email-only records are not displayed. No private profile lookup or new backend write is introduced. The brand's pointer highlight wraps the complete logo/wordmark in a pill.

Validation: 11 unit tests, production vendor build, 28 viewport/theme combinations, and focused header/founder/dropdown/chapter-dialog browser checks pass. The latter verifies the actual four founders, local portrait decode, correct account routes, live metric updates, appearance options, search, modal focus and scoped Axe checks. User requested publication to the existing public website; deployment is tracked separately from these local checks.

## Chapter action, readable header and founder corrections

Moved chapter creation out of the horizontal directory rail into a persistent section footer: “Don’t see your city? Make a difference where you live.” The Start a chapter button preserves referral routing and remains available after a search with no results. Removed the old offscreen start card.

The desktop navigation now fills its available space with 15–17px labels and 44px targets. Below 1000px it uses the full menu while retaining both account actions, instead of shrinking labels to fit. Browser zoom is respected; no forced page zoom or counter-scaling is applied. Long founder names wrap safely. Added Rishik’s supplied LinkedIn link and the supplied fourth-founder link, and changed the fourth founder’s display name to the exact spelling confirmed by Satvik: Punarchithsaireddy Vanamareddy.

Validation: the 28 viewport/theme regression passed. Focused checks cover nine effective layout widths equivalent to 50–400% browser zoom on a 1286px browser, account visibility, header overlap, name clipping, chapter creation after empty searches, referral preservation, both profile links and the confirmed display name.

## Menu control regression fix

Removed outdated hamburger-span background/transform rules that painted a white rectangle behind the Menu label over dark sections. The control now uses an SVG hamburger/close icon with synchronized Menu / Close text and Open menu / Close menu accessible labels. Flattened the obsolete nested More menu so every enabled destination appears in the expanded navigation instead of reserving invisible grid space.

Validation: focused menu regression at 320, 390, 1044 and 1286px in light/dark modes, including dark-section background, all destinations, menu height, stable document scroll, keyboard entry, Escape and link dismissal, plus scoped accessibility. All 28 viewport/theme cases also pass. Owner explicitly requested publication after this fix.

## Mobile chapter cards, project logos and usable fridge map

Removed a conflicting phone grid rule that created a separate first chapter column, and gave every chapter the same fixed-percentage rail track with room for readable content. Restored the program emblems that a legacy phone rule hid; IRIS, Evergreen and Hydro now use compact logo/wordmark rows above their content. Adjusted mobile body type, search input sizing, label contrast and map touch targets.

Moved fridge controls into a separate mobile header above a map stage that is 560–760px tall, rather than overlaying most of the map. The stage retains search, location, layer toggles, chapter thumbnails, landmark cards and provider attribution. Desktop keeps the existing overlaid control layout. Empty-fridge copy now describes chapter exploration instead of incorrectly claiming the map is always centered on Memphis.

Validation: focused mobile layout checks at 320/375/390/430/768px in light and dark appearances; equal card widths and no clipped text; three decoded project logos; map/header separation; selected landmark-card fit and scoped Axe checks. The mobile test isolates geocoding with a fixture while retaining real tiles and public directory reads. The 28 viewport/theme checks, six homepage checks, and desktop/mobile section-navigation, pointer, donation and map regression passed.

## Mobile breathing room and Instagram posts in Impact

Preserved the laptop layout and added phone spacing, readable stacked impact metrics, full-width founder identities, and larger touch targets. The regional chapter chart and app QR code start collapsed on phones and remain expanded on laptops; direct app and sharing actions stay available. Header clearance and equal three-image hero composition are retained.

Impact now lazy-loads Instagram's official public profile embed for @official.better.nature, with a permanent profile link, timeout message and retry. No private account credentials, copied post data or remote HTML injection are used. This is a public profile embed, not an authenticated custom media feed. Instagram/browser restrictions can prevent loading; the profile link remains available.

Validation: 11 unit tests, 28 viewport/theme cases, six homepage/accessibility cases and the focused mobile chapter/logo/map checks passed. Real Instagram rendering and fallback checks are performed separately because third-party availability varies.
