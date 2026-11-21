# IRIS rescue scenarios

The volunteer map shows where rescues are open. A route sheet shows the commitment before acceptance. The active trip focuses on the next stop. The coordinator view handles anything that needs a decision.

| Scenario | Volunteer experience | Operational behavior |
| --- | --- | --- |
| Several pickups in one area | Open the area, then compare routes by pickup cutoff, both stops and cargo. | H3 groups pickups by location. Use road travel times and verified receiving windows to judge feasibility. |
| No open pickups | Show a quiet state and a way to refresh. Keep any active run available. | Distinguish an empty result from a failed or incomplete feed. |
| Missing coordinates | Route remains in List and shows the address if known. | Flag missing coordinates for review. Exclude it from location-based offers until resolved. |
| Location denied or inaccurate | Browse by chapter. Let the volunteer set a starting area if they want estimates. | Withhold personalized ETA when its starting point is unknown. |
| No feasible volunteer or receiving site | Keep the volunteer view factual about the route. | Coordinator sees the reason, time remaining and eligible alternatives. Never send an infeasible offer. |
| Approaching cutoff | Show a clock with a written deadline. Use “Start by” only when feasibility produced it. | Keep pickup cutoff separate from latest feasible start. Expire targeted offers at the latter. |
| Another volunteer accepts or donor cancels | Update the offer sheet. Show what changed and how to return to open routes. | Recheck status in the acceptance transaction. Do not overwrite someone else’s claim. |
| Volunteer accepts but hasn't left | Keep “Continue pickup” prominent and show the first stop. | Remind the claimant before margin runs out. Release only if the food remains with the donor. |
| Donor delayed, missing, or load changed | Show pickup contact and a way to report the actual situation. | Recalculate feasibility. Keep package count and custody accurate. Use coordinator review for any split. |
| Handoff is confirmed | Move directions and instructions to the receiving site. | Persist custody and notify the receiving site once. |
| Receiving site closes, is full, or declines | Give a single way to get help, with current instructions still available. | Coordinator confirms an approved alternate or return. Keep current custodian until another handoff is confirmed. |
| Vehicle issue or volunteer must leave | Offer release before collection and help with custody transfer afterward. | Never return collected food to the general pickup queue automatically. |
| Connection drops during a run | Keep previously loaded instructions available. Distinguish pending sync from confirmed. | Use idempotent transitions and reconcile conflicts before confirming the result. |
| Delivery done, weight pending | Show delivered immediately after confirmed handoff. Show weight as pending until verified. | Record delivery and verified weight separately. Count impact once. |

Current implementation covers map and list discovery, grouped pickup counts, deadline indicators, route review, and the existing volunteer acceptance path. The rest of the table defines pilot behavior to verify before enabling live matching.
