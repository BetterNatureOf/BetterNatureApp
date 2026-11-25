# Website experience upgrade

Continues `feat/website-motion`. Scope is the public website. Authenticated operations screens and backend rescue policies are unchanged.

## Implemented surfaces

| Surface | Change | Verification |
| --- | --- | --- |
| Whole site | Device-following light/dark appearance initialized before CSS, persistent optional override, OS changes and cross-tab preference updates | Browser scenarios at 390, 768 and 1440 px |
| Navigation | Native cursor, accessible appearance selector, skip link, immediate mobile menu initialization independent of remote CMS | Browser interaction checks |
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

The ECharts and Anime.js bundles are not requested on initial hero rendering. ECharts imports only the required chart family and SVG renderer. The standard HTML table is usable if either deferred bundle fails. Removed continuously running particle/custom-pointer/card-tilt code. Bundle sizes and browser results are recorded after validation below.

## Validation results

- Static bundle build passed; all modified JavaScript syntax checks and `git diff --check` passed.
- Four data tests passed, covering missing counts, recorded zero, directory totals, empty input and CSV formatting.
- Six browser combinations passed (390/768/1440 px, light/dark), including chart drill-down, export, system-theme changes, explicit preference persistence, reduced-motion rendering and no horizontal document overflow.
- Failed-directory plus blocked-chart fixture passed, retaining a labeled published list and accessible table.
- Axe found zero violations in the new explorer and appearance control in those six combinations. This is a scoped automated result, not whole-site certification.
- No uncaught page errors in those scenarios.
- Deferred bundles: ECharts 496,299 bytes raw / 167,634 gzip; Anime.js entrance 26,923 raw / 11,174 gzip. No Lighthouse or real-device cellular performance measurement was performed.
- Screenshots and machine-readable browser results are in the local review output directory.
