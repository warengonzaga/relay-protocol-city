# Ethereum skyline attribution

Ethereum's five named buildings use a fixed ranking snapshot checked on September 30, 2026. Heights follow the ranking, with the first building tallest. They do not resize when the recent activity sample changes.

| Order | Building | Recognized referrer namespace                            |
| ----- | -------- | -------------------------------------------------------- |
| 1     | Fun      | `funxyz` (including pipe-separated correlation suffixes) |
| 2     | LI.FI    | `lifi`                                                   |
| 3     | Fomo     | `fomo`                                                   |
| 4     | MetaMask | `metamask`, `metamaskpay`                                |
| 5     | OKX      | `okx`                                                    |

Scout ranked named external integrators by successful-request input USD volume across the available warehouse history. A request qualifies when Ethereum (chain ID 1) is its origin or destination, and is counted once, including same-chain swaps. The other endpoint is unrestricted. First-party Relay and unattributed requests are excluded from the external-integrator ranking.

The observed history spans **January 1, 2025 through September 30, 2026, 11:59:47 UTC**, queried at 15:52:59 UTC. This implements an all-available-history snapshot; complete lifetime coverage before January 2025 was not established. Exact volumes, private request IDs, logs, and API credentials are intentionally absent from this repository.

The namespaces and MetaMask alias grouping were verified through Scout's warehouse attribution. One representative request for each integrator was independently fetched from `/requests/v3` with authenticated data requested. All five were successful and their actual origin/destination currency chain fields were compatible with this app's adapter. **The API omitted `referrer` for all five under the available key.** This check verifies those routes and statuses, not public access to attribution. Creator-integrator restrictions are described in the [Requests API reference](https://docs.relay.link/references/api/get-requests).

The city uses a named building only when the returned referrer normalizes to its verified namespace. Pipe-separated private suffixes are discarded. Missing attribution stays **Unknown app**, never guessed from amounts, chains, wallets, or the skyline ranking. Other integrators use the labeled app commons in Ethereum; Base retains one observed app site until its own design pass.

Relay pedestrians use homes without garages; Relay cars use homes with garages. Integrator pedestrians and cars use their app address. Buses use district terminals regardless of app. Same-chain ground journeys return to their exact starting address. The two-chain map still excludes requests whose other endpoint is outside Ethereum/Base, even when their integrator has a named Ethereum building. Fomo's verified sample had a different destination chain and was excluded accordingly.

These labels represent reported request attribution, not authentication of an app's ownership. Demo trips remain clearly labeled simulations.
