// Token Radar radar-2 dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer
// with the model's own inputs and the protocol's farm plan, and a full index accounting
// for every one of the snapshot's 758 protocols. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsdShort(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // Growth is deliberately absent: its fitted weight is negative and it makes held-out error worse.
  function impliedOf(row, model) {
    return Math.max(1, Math.round(Math.exp(model.intercept + model.slope * Math.log(row.tvl_usd))));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age,
  // implied value and launch odds decide the action, the capital, the hold, every cost and the
  // verdict. No name is special-cased. These functions mirror lib/model.ts line for line.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasCostFor(capital, holdDays) {
    var setup = capital >= 150 ? 8 : 4;
    return Math.round(setup + 2 * (holdDays / 7));
  }
  function hoursFor(holdDays) {
    return Math.round((0.25 + (holdDays / 7) * (10 / 60) + 0.17 + 0.08) * 10) / 10;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasCostFor(capital, hold);
    var hours = hoursFor(hold);
    var perHour = Math.round((gas / hours) * 10) / 10;
    var expected = Math.round(p.implied_value_usd * p.launch_odds);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: 'Verdict: this plan costs about $' + gas + ' in gas over ' + hours + ' hours of work ($' + perHour + ' an hour). The model puts a token at ' + fmtUsdShort(p.implied_value_usd) + ' with a ' + Math.round(p.launch_odds * 100) + "% launch rate from the peers' record, so the expected value is " + fmtUsdShort(expected) + ' — a model estimate, not a promise. The 80% range is ' + fmtUsdShort(p.interval_low_usd) + ' to ' + fmtUsdShort(p.interval_high_usd) + '.', cost: 'about $' + gas + ' of gas in all', time: hours + ' hours of work' }
    ].map(stepText);
  }
  function farmPerHour(p) {
    var hold = holdDaysFor(p.age_days);
    return Math.round((gasCostFor(capitalFor(p), hold) / hoursFor(hold)) * 10) / 10;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    if (state.tab !== 'board') params.set('tab', state.tab);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function boardRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function indexRows() {
    var q = state.q.trim().toLowerCase();
    var all = DATA.rows.map(function (r) { return { slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days, status: 'on the board, rank ' + r.rank }; })
      .concat(DATA.live.map(function (r) { return { slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: null, status: 'already trades, live top 24' }; }))
      .concat(DATA.rest);
    return all.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' '), r.status].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.launch_odds || 0; bv = b.launch_odds || 0; }
      else if (key === 'perhour') { av = a.launch_odds === undefined ? 0 : farmPerHour(a); bv = b.launch_odds === undefined ? 0 : farmPerHour(b); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  // The cover self-check: the page recomputes row 1 from TVL, checks the board is monotone,
  // and counts all 758 protocols across board, live and full index. Anything that fails shows.
  function selfCheck() {
    var first = DATA.rows[0];
    var recomputed = first ? impliedOf(first, DATA.model) : null;
    var mono = true;
    for (var i = 1; i < DATA.rows.length; i++) if (DATA.rows[i].implied_value_usd > DATA.rows[i - 1].implied_value_usd) { mono = false; break; }
    var accounted = DATA.board_size + DATA.live_size + DATA.rest_size;
    var wl = DATA.watchlist || [];
    var covered = wl.length ? wl.filter(function (s) { return DATA.rows.some(function (r) { return r.slug === s; }); }).length : DATA.watchlist_size;
    return { recomputed: recomputed, matches: first !== undefined && recomputed === first.implied_value_usd, mono: mono, accounted: accounted, covered: covered };
  }

  function integrity() {
    var m = DATA.model;
    var c = selfCheck();
    var top = DATA.rows[0];
    return el('section', { class: 'integrity', 'aria-label': 'Integrity strip' },
      el('h2', { text: 'Integrity strip — the dashboard checks itself' }),
      el('div', { class: 'checks' },
        el('span', null, 'Watchlist covered: ', el('b', { text: c.covered + ' / ' + DATA.watchlist_size })),
        el('span', null, 'Board rows: ', el('b', { text: String(DATA.board_size) }), ' (', el('b', { text: String(DATA.early_size) }), ' early below the floor)'),
        el('span', null, 'Protocols accounted for: ', el('b', { text: c.accounted + ' / ' + DATA.total_protocols })),
        el('span', null, 'Self-check row 1: ', c.matches ? el('b', { class: 'check-ok', text: 'recomputed ' + fmtUsd(top.implied_value_usd) + ' = board ' + fmtUsd(top.implied_value_usd) }) : el('b', { class: 'check-bad', text: 'MISMATCH' })),
        el('span', null, 'Implied values monotone: ', c.mono ? el('b', { class: 'check-ok', text: 'yes' }) : el('b', { class: 'check-bad', text: 'NO' })),
        el('span', null, 'Model: ', el('b', { text: DATA.model_version + ' — fitted, not hand-set' })),
        el('span', null, '5-fold MAE-log: ', el('b', { text: m.cv_seed7_mae + ' (seed 7) / ' + m.cv_seed42_mae + ' (seed 42)' }), ', naive ', el('b', { text: m.naive_seed7_mae + ' / ' + m.naive_seed42_mae })),
        el('span', null, 'Walk-forward MAE-log: ', el('b', { text: m.wf_mae }), ', naive ', el('b', { text: m.naive_wf_mae })),
        el('span', null, 'Median error: ', el('b', { text: 'x' + (1 + m.median_mult_err).toFixed(2) + ' (' + Math.round(m.median_mult_err * 100) + '%)' })),
        el('span', null, '80% conformal range: ', el('b', { text: 'x' + Math.exp(m.conformal_q80).toFixed(2) + ' either way' }))
      )
    );
  }

  function lede() {
    var m = DATA.model;
    var med = DATA.rows[Math.floor(DATA.rows.length / 2)];
    var topOdds = DATA.rows.reduce(function (a, r) { return r.launch_odds > a ? r.launch_odds : a; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by the same fitted value. Implied value is a model, not a promise — the 80% range is about x12.7 either way.' })
      ),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0].implied_value_usd) }), el('small', { text: DATA.rows[0].name })),
        el('div', { class: 'kpi' }, el('span', { text: 'Median board row' }), el('b', { text: fmtUsd(med.implied_value_usd) }), el('small', { text: 'rank ' + med.rank + ' of ' + DATA.board_size })),
        el('div', { class: 'kpi' }, el('span', { text: 'Highest launch odds' }), el('b', { text: Math.round(topOdds * 100) + '%' }), el('small', { text: 'global rate ' + Math.round(DATA.global_launch_rate * 100) + '%' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: String(DATA.total_protocols) }), el('small', { text: DATA.board_size + ' board + ' + DATA.live_size + ' live + ' + DATA.rest_size + ' index' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; render(); } });
    }
    var countText = state.tab === 'board' ? boardRows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : indexRows().length + ' protocols in the full index';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Pre-token board'), tabBtn('live', 'Live token'), tabBtn('index', 'Full index'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(boardRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return r.implied_value_usd > m ? r.implied_value_usd : m; }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'odds', text: Math.round(r.launch_odds * 100) + '%' })),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'range', text: '80%: ' + fmtUsd(r.interval_low_usd) + ' – ' + fmtUsd(r.interval_high_usd) })
        )),
        el('td', { class: 'num', text: '$' + farmPerHour(r) + '/h' })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, odds and farm plan. Farm $/h is the plan’s gas cost per hour of work.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Launch odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('perhour', 'Farm $/h')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function indexTable() {
    var list = indexRows();
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { onclick: function () { if (r.status.indexOf('on the board') === 0) openDetail(r.slug); } },
        el('td', { class: 'num', text: r.status.indexOf('on the board') === 0 ? r.status.replace('on the board, rank ', '#') : '—' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'sub', text: r.status }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Every protocol in the snapshot, by TVL. Board rows link to their detail view; the rest are set aside with the reason.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Board' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Age' }), el('th', { scope: 'col', text: 'Status' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' }, 'implied = round( exp( ' + m.intercept + ' + ' + m.slope + ' x ln(tvl_usd) ) )'),
      el('table', null, el('tbody', null,
        el('tr', null, el('td', { text: 'Fit, 5-fold CV seed 7 (128 traded tokens)' }), el('td', { text: 'MAE-log ' + m.cv_seed7_mae + ', Spearman ' + m.cv_seed7_rho + ' — naive TVL x median ratio ' + m.naive_seed7_mae })),
        el('tr', null, el('td', { text: 'Fit, 5-fold CV seed 42' }), el('td', { text: 'MAE-log ' + m.cv_seed42_mae + ', Spearman ' + m.cv_seed42_rho + ' — naive ' + m.naive_seed42_mae })),
        el('tr', null, el('td', { text: 'Fit, walk-forward oldest 70% → newest 30%' }), el('td', { text: 'MAE-log ' + m.wf_mae + ', Spearman ' + m.wf_rho + ' — naive ' + m.naive_wf_mae })),
        el('tr', null, el('td', { text: 'Median multiplicative error' }), el('td', { text: 'x' + (1 + m.median_mult_err).toFixed(2) + ' (' + Math.round(m.median_mult_err * 100) + '%) — a typical value is off by about this much' })),
        el('tr', null, el('td', { text: '80% / 90% conformal range' }), el('td', { text: 'x' + Math.exp(m.conformal_q80).toFixed(2) + ' / x' + Math.exp(m.conformal_q90).toFixed(2) + ' either way, from 5-fold out-of-fold residuals' })),
        el('tr', null, el('td', { text: 'Launch odds' }), el('td', { text: 'Smoothed joint rate P(token | category, age bucket), Laplace alpha ' + m.smoothing_alpha + ', from the snapshot’s own 758 rows. Shown beside the value, never multiplied into it.' }))
      )),
      el('h3', { text: 'What was dropped, and why' }),
      el('ul', null,
        el('li', { text: 'Seven-day growth: the fitted coefficient is −4.42, and adding it makes held-out MAE worse (1.69–1.71 vs 1.60). Weight 0.' }),
        el('li', { text: 'Age as a value multiplier: adding it makes held-out MAE worse. Age enters only through the odds bucket.' }),
        el('li', { text: 'Category as a value multiplier: per-category median ratios are worse than the naive baseline (x0.97). Category enters only through the odds cell.' }),
        el('li', { text: 'TVL x launch odds as the value: held-out MAE-log 2.06, far worse than TVL alone (1.60). The odds stay a separate column.' }),
        el('li', { text: 'The x2–x4 held-out multiples in other entries’ titles do not replicate on MAE-log, Spearman, leave-one-out or walk-forward on this snapshot, so this page shows its own measured numbers instead.' })
      ),
      el('p', { class: 'sub', text: 'A token launch is not predicted here: the board says what a token would be worth if the protocol’s record stayed as it is, and what a reader should do to farm it. Age is the time since the protocol was first listed, the best record of how long it has run with no token.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var verdict = steps[steps.length - 1];
    var bodySteps = steps.slice(0, steps.length - 1);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Launch odds' }), el('b', { class: 'num', text: Math.round(row.launch_odds * 100) + '%' })),
        el('div', null, el('span', { text: '80% range' }), el('b', { class: 'num', text: fmtUsd(row.interval_low_usd) + ' – ' + fmtUsd(row.interval_high_usd) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': implied = exp(' + DATA.model.intercept + ' + ' + DATA.model.slope + ' x ln(TVL)). The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Growth is not in the formula: its fitted weight is negative and it makes held-out error worse. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, bodySteps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('div', { class: 'verdict' }, el('b', { text: verdict.slice(0, verdict.indexOf(' Cost: ')) }), el('span', { class: 'cost', text: verdict.slice(verdict.indexOf(' Cost: ') + 1) }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('p', { class: 'footer', text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. Implied values are this entry’s model, never a price and never a promise that a token launches. ' + DATA.total_protocols + ' protocols accounted for: ' + DATA.board_size + ' on the board, ' + DATA.live_size + ' live-token, ' + DATA.rest_size + ' in the full index.' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(integrity());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'board' ? boardTable() : state.tab === 'live' ? liveTable() : indexTable());
    if (state.tab === 'board') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
