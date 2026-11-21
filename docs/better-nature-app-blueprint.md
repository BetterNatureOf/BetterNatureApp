# Better Nature app blueprint

Working design for the public website, member app, donor portal, receiving partners, and chapter and organization operations. Proposed behavior is described below. The current web preview demonstrates volunteer discovery and navigation using sample data.

## Who needs what

| Person | First thing to see | What success looks like |
| --- | --- | --- |
| Person looking for food | Find food, open from the public site | Understand what a site offers, whether it is open, and how to reach it without an account |
| Volunteer | Resume active rescue, complete setup, or find a pickup or event | Know what they are committing to, complete it, or reach the person who can help |
| Food donor | Offer food or act on a live donation | Know whether pickup is confirmed, when to have the food ready, and what arrived |
| Receiving partner | Incoming donations and pause control | Decide what they can take and record what actually arrived |
| Chapter coordinator | Time-sensitive work and assigned exceptions | See what needs a person’s decision, who owns it, and the next deadline |
| Organization staff | Cross-chapter approvals, incidents, and reporting | Work within their permissions, see changes in the audit trail, and publish reliable totals |
| Supporter | Understand the programs and choose a way to help | Donate, volunteer, start a chapter, or partner without hunting through the member app |

## Public website and entry points

| Surface | Design decision |
| --- | --- |
| Homepage, mission, team, testimonials, press | Explain the work in plain language. Use separate links for Find food, Volunteer, Offer food, and Donate. Use consented stories and photos. |
| Programs | Give IRIS, Evergreen, and Hydro distinct pages. Explain what people can do today. Keep Animal Gallery as supporting content with consent and location review. |
| Public map and Find food | Offer an accessible list first-class alongside the map. Show only approved public access locations. Display hours, accessibility, food availability when verified, last update, and a phone or website when available. Distinguish open hours from food being in stock. Show whether ID, appointments, or other requirements apply at each site. |
| Partners and chapters | Publish directory entries only with permission. Separate community-facing contact information from private rescue instructions. Make chapter applications trackable. |
| Events | Show date, local time, accessibility, age requirements, transport, cancellation status, and the signup path. |
| Give and receipts | Open the existing donation form, keep users’ place on return, and distinguish initiated, confirmed, failed, and refunded payments. Keep payment details with the payment provider. |
| Open app, sign up, sign in | Send people to the app flow for their role. Preserve the intended destination through sign-in when authorized. Chapter applications and donor intake need their own status, even if a person does not yet have an account. |
| Newsletter and contact | Keep subscription separate from app enrollment. Set clear expectations about what each form does and show a useful failure and retry state. |
| Website editor | Preview changes before publishing. Keep drafts, permission checks, audit history, and rollback. Public impact metrics should show their date and basis. |

## Account and shared navigation

| Surface | Design decision |
| --- | --- |
| Welcome and account setup | Ask what the person wants to do. Public resources remain available without registration. Resume unfinished signup. Explain why each required field is needed. |
| Sign-in and recovery | Preserve email on errors, offer recovery and verification resend, and show when an account is pending or disabled. Avoid duplicate identities when people add a login method. |
| Volunteer readiness | Separate basic membership from permission to handle a particular type of rescue. Show only missing steps relevant to the action. Save training, agreements, verification, and driver setup independently. Keep a useful path to other programs while rescue approval is pending. |
| Donor onboarding | Verify the organization and its authorized contact. Save pickup instructions, contact availability, and a repeat offer template. Make approval and correction status visible. |
| Chapter applications and agreements | Show a checklist with the next owner and step. Make signed versions available in Agreement Center. Record who signed, version, date, and whether an updated signature is needed. |
| Role and chapter switching | Show the active role and chapter near the top. Let authorized multi-role users switch without signing out. Keep the current rescue tied to its original chapter. Revalidate permissions when opening a link or acting. |
| Notifications | Group Action needed and Updates. Every action opens the relevant record or explains why it is no longer available. Deduplicate retries, support preferences, and avoid revealing addresses or sensitive details on lock screens. |
| Profile and settings | Group account, sign-in methods, contact details, notifications, agreements, privacy, and support. Explain the effect of account deletion on open work and retained records. Provide an accessible sign-out path. |

## Member app

Keep the bottom bar consistent: **Home · Rescue · Programs · Chapters · Profile**. People who manage multiple scopes should be able to tell which one they are in. Keep role-specific tools together and avoid multiple routes that look like they do the same job.

| Surface | Design decision |
| --- | --- |
| Home | Prioritize active rescue, urgent action the user can take, then discovery. Show next event and personal impact below. First-time users see one meaningful next step. |
| Rescue map and list | Both show the same eligible offers. The map emphasizes pickup counts with subdued area shading. The list includes routes missing coordinates. Mark deadlines with words as well as color. Keep refresh, no offers, and data unavailable distinct. |
| Offer review | Show donor and confirmed receiver, both windows, load, required training or equipment, access notes, and who to call. Show travel estimates only when the inputs support them. Explain why a person cannot accept and what they can do next. |
| Active trip | Show the next stop, its instructions, one primary action, and Get help. Keep Resume pickup visible from Home and Rescue. Show whether a handoff is confirmed or pending. No mandatory typing while driving. |
| Programs and events | Keep program details separate from active work. Surface upcoming events, capacity and waitlist, RSVP changes, accessible directions, reminders, and cancellation. Check-in should support staff correction without double-counting hours. |
| Chapters | Show membership, local contacts, events and join requests. Let people choose another chapter, withdraw a pending request, and understand what a move changes. |
| Impact, leaderboard, referrals | Distinguish personal, chapter, and organization totals. Explain how hours, accepted food, and estimated meals are calculated. Use opt-in public recognition and minimal public profiles. Never penalize a safety stop to improve leaderboard numbers. |
| Donations and receipts | Keep financial giving discoverable from Programs and Home. Group a person’s records in Profile. Separate donation amounts, food weights, and operational receipts so each status has a clear meaning. |

## IRIS operations

Start with a repeat donor, staffed receiving site, approved fallback, and named coordinator per run. A receiving site can participate by phone during the pilot. The coordinator records who accepted, what quantity, and the window. Add a receiving portal once that workflow is proven. An app account or smartphone should not be a condition of receiving food.

| Stage | Owner and action | Gate or recovery |
| --- | --- | --- |
| Offer | Donor enters batch, quantity, category, label or allergen details where applicable, and ready and cutoff times. | Incomplete offers stay with the donor. Use repeat templates and confirm the details that change. |
| Confirm destination | Receiver or coordinator records site acceptance, amount, window, contact, and conditions. | No dispatch without a confirmed, suitable destination. Partial acceptance updates the load before dispatch. A second load is a separate record. |
| Assign | Volunteer reviews both stops and accepts. | Server checks authority, capacity, deadline, current offer and assignment state. Only one acceptance wins. Changed terms require review again. |
| Collect | Donor and volunteer confirm the actual handoff, quantity, and required handling checks. | Before collection, release can reopen the offer if the original terms still hold. After collection, record the custodian and keep the batch off the general board. |
| In transit | Volunteer follows the receiving directions. Receiver can see what is expected. | Delay, closure, breakdown, or food concern goes to the coordinator. Confirm an approved alternate, return, or disposition before giving new instructions. Never silently change the destination. |
| Receive | Staffed partner confirms accepted quantity and any rejection. | Keep rejected items accounted for. Separate Received, Stocked, and Distributed. Volunteer evidence and receiver confirmation are distinct records. |
| Close | Donor sees the outcome. Reporting records the supported quantity once. | Weight can remain pending. Corrections require an audited reason. A run cancelled or held before receipt does not count as delivered. |
| Recall | Coordinator identifies the affected batch and all sites that took it. | Stop distribution, notify affected partners, record acknowledgments and disposition, and preserve the record. Rehearse this before real runs. |

**Destination rules.** Staffed sites set receiving hours, accepted categories, and capacity. Community fridges have a named steward, recently verified availability, a pause control, and explicit handling rules. Start with approved shelf-stable food at approved sites. For outreach, assign the batch to an outreach partner or scheduled service. People can choose or decline in person without individual pins, proof photos, or accounts. Design that experience with people who use it. Confirm local procedures with the relevant food safety authority before live runs involving temperature-controlled food. [FDA donation guidance](https://www.fda.gov/food/retail-food-industryregulatory-assistance-training/key-steps-donating-food-retail-food-establishments) · [USICH outreach guidance](https://usich.gov/guidance-reports-data/federal-guidance-resources/core-elements-effective-street-outreach-people)

**Other things that break.** Show a changed deadline and ask for review before accepting. Retry safely after lost signal and show pending updates. If the device is offline, keep already-loaded instructions available where technically supported, and give people a human contact. A map or routing outage falls back to the address and list. A coordinator going off shift transfers responsibility to a named backup or stops new dispatch. If no one takes a run, notify the donor and release the receiving reservation before its cutoff.

## Donor, receiver, and coordinator workspaces

| Surface | Design decision |
| --- | --- |
| Donor dashboard, posting and history | Lead with Offer food and the most urgent active donation. Show what is waiting on the donor versus the receiver or volunteer. Offer repeat templates and clear edits before handoff. Keep records and receipts searchable. |
| Receiver inbox and arrival | Accept, accept less, decline, or pause. Show incoming quantities, arrival windows, and notes that affect unloading or safe storage. Record received quantities and any rejection in one short action. Include a phone path. |
| Chapter dashboard and Live Ops | One queue ordered by action deadline. Surface needs destination, unassigned, late, held, and awaiting confirmation. Every exception has an owner, backup, status, and next decision. |
| Approvals, verification, contracts, and member management | Group decisions by person, partner, or chapter. Give a clear reason and next step for a decline. Limit reviewer access to the needed data. Audit approval, removal, and role changes. |
| Site and donor management | Add or pause partners and sites, verify contacts and hours, control what appears publicly, and see open runs affected by a change. |
| Events, check-in and broadcasts | Scope to the right chapter and audience. Preview a broadcast before sending. Support attendance correction, cancellation, waitlist, and accessible alternatives to QR check-in. |
| Finance, metrics, exports and history | Separate drafts from published totals. Give exports a scope and date range. Limit private fields by role. Record edits and approvals, and make reports reconcile to the underlying records. |

## Design and reliability across every screen

- Use Better Nature green, warm backgrounds, system type for task screens, and one strong primary action per step. Use translucent material where the route sheet overlays the map. Keep contrast strong and respect reduced motion and transparency.
- Test keyboard navigation, screen readers, larger text, touch targets, and narrow phone layouts. Keep a list equivalent for map actions. Preserve the place someone came from after closing a sheet or going back.
- Design loading, empty, stale, offline, error, success, and permission states for each workflow. When a request fails, preserve the draft and offer recovery. For critical updates, say whether the change was saved.
- Restrict private records by role, chapter, and specific assignment. Keep food-access locations separate from private addresses, and exclude recipient identities from rescue data. Define retention and deletion for verification documents, contact details, location, and delivery proof.
- Enforce authorization at the service and database layer. Use retry-safe transitions, audit records, and notifications that can be reconciled. A hidden button does not protect the underlying action.

## What blocks a real pilot

1. **Lock down authorization.** In the current checkout, the Firestore rules allow signed-in reads of all user and pickup documents and allow a pickup update based on the incoming claimant field. User creation also relies on self identity without a field allowlist in that rule. Review those paths, test cross-role and cross-chapter access, and verify the deployed rules before relying on them.
2. **Add destination confirmation and custody.** Replace open-ended assignment with an approved receiving window and a custody record. The current handoff code can return a run to the available state while retaining restaurant confirmation. Close that path, and test cancellation before and after collection.
3. **Rehearse with the people doing the work.** Test volunteer acceptance races, no-show, late donor, partial loads, rejected food, closed receiver, lost signal, and recall. Verify who answers, who makes the next decision, and what each party sees. Verify retry behavior and receipt accuracy against real pilot records.
4. **Run a narrow pilot.** Track accepted and usable food, no-shows, missed windows, unresolved exceptions, and time spent coordinating. Hold broader dispatch, fridge expansion, and automated outreach matching until the relevant workflows have been proven.

The local app already has account and role flows, a Rescue map and list, route review, next-stop directions, donor screens, chapter tools, and giving. Receiving confirmation, custody resolution, and operational acceptance checks are implementation work. The screen-by-screen blueprint defines how those pieces should fit together.
