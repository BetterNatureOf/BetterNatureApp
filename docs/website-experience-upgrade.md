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
| Motion | Anime.js owns only explorer entrance; existing Motion owns original hero/title effects; CSS owns simple feedback | Reduced-motion browser scenarios and normal-motion smoke check |

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
- Existing hero photos now load locally without cropping; three programs receive equal image sizes. Further hero changes are on hold pending the user’s next reference.
- Fixed the zero-height map canvas caused by a late-loaded map-library position rule. Added resize/teardown handling, clearer streets, local default view, centered world legend and theme-aware surfaces. No chapter flower badges.
- Program action buttons now enter the app root/welcome flow. Navigation distinguishes How it works from the chapter directory.
- Signup has a distinct theme-aware surface and a local 200px SVG QR. Browser-rendered QR decoded successfully to the app URL in light/dark and mobile/desktop checks.
- Added blog.html, published-only article rendering, search/topic filtering, explicit empty state, and separate-page links. No stories are fabricated; configure actual posts before publishing stories.
- Selected workflow tabs now have strong pill styling, ARIA selection and arrow-key support.
- Pointer remains BN-colored on graphs and maps, highlights countries/states, surrounds small controls and applies a bounded magnetic/jelly response. Pointer outlines are sharp; the requested subtle frost is confined to the highlighted control.
- Guidance consulted: https://developer.apple.com/design/human-interface-guidelines/pointing-devices and https://developer.apple.com/documentation/uikit/integrating-pointer-interactions-into-your-ipad-app . This is a web adaptation, not native UIPointerInteraction.

### Figma identity work

Editable file: https://www.figma.com/design/hZlsxT6ZvZxMK7mL23PWEq?node-id=1-32

Four vector marks, four reusable components, light/dark token foundations, and a review board were created with the Figma plugin. Read-back confirmed 16 vector layers, four instances, eight editable text nodes, and Inter fonts. Three program SVGs are used on the site; the master-mark direction remains a proposal. No Figma AI generation credits were used. Framer could not be used because its connection was unavailable.

### Follow-up validation

Six unit tests and the static bundle build passed. Browser checks verified page order, program links, distinct signup/donation surfaces, absent glow, QR decoding, theme-aware maps, blog empty/search/detail/safe-text behavior, compact checkout and section offsets. Scoped Axe checks of signup, donation controls and chapter insights passed in 390px/1121px light and dark after correcting donation-button contrast. No uncaught page errors were observed. Browser fixtures are test-only and never create production records.


### Latest pointer and tab checks

- The pointer no longer switches to the system cursor over ECharts, the SVG world map, or the street-map canvas. Native text-entry and embedded checkout behavior remain available.
- Pointer outlines have no blur, backdrop blur, or shadow. A requested 0.55px frosted effect applies only to hovered small controls; it resets on leave and accessibility fallbacks. Controls use bounded magnetic translation and 1.012 scale.
- Country/state hover highlights use BN colors; chart tooltips remain owned by the chart library.
- Workflow tabs expose selected state, roving tab focus and Left/Right/Home/End keys.
- Focused pointer checks passed for control enclosure, jelly state, content frost, reset, country hover and persistent custom cursor over chart SVG.
- Local QR generation uses the qrcode development dependency (MIT); no visitor QR request is sent to an external QR service.

Journal publishing schema in website/content.js or site_content/main.blog.posts:

```js
{ posts: [{ published: true, slug: 'a-real-story', title: 'Approved title', project: 'IRIS', excerpt: 'Approved summary', author: 'Approved author', paragraphs: ['Approved body paragraph'] }] }
```

No sample article is shipped as a real post. The empty page is intentional until approved editorial records exist. `npm run test:review --prefix website` and `npm run test:pointer --prefix website` require the local preview server; the browser test command starts its own server.
