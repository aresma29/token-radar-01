# Token Launch Radar

[![Competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/aresma29/token-radar-01/rank.svg)](https://make.fun/competitions/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/aresma29/token-radar-01/reward.svg)](https://make.fun/competitions/token-radar-01)

A token launch radar built from a sealed DefiLlama snapshot (758 protocols, 40 on the watchlist): it ranks pre-token protocols by implied value and gives each a costed farm plan.

`main.ts` (Node 22, standard library only) reads the snapshot, writes a ranked board to `board.json`, a sortable dashboard, and `dossier.json`.

## Model

Implied value = TVL-alone OLS: exp(6.965 + 0.522 x ln(TVL)). Launch odds are a separate column (smoothed joint P(token | category, age bucket)). Held-out tests on 128 traded tokens: MAE-log 1.61, Spearman 0.44 — TVL alone beat every fancier model tried.

## Board

226 rows: the 40 watchlist protocols plus 186 pre-token protocols below the floor by implied value. A Live view shows the top 24 traded protocols at actual market cap, never mixed into the ranked board. The full index accounts for the remaining 508 protocols with a set-aside reason — 226 + 24 + 508 = 758, every protocol in the snapshot visible somewhere.

## License

SPDX-License-Identifier: MIT
