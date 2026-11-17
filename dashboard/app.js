// NIGHT RADAR — the dashboard. Reads window.RADAR (written by main.ts beside this folder) and renders
// the ranked pre-token board, a filterable/sortable table, per-protocol detail with the model's own
// arithmetic and farm plan, and a separate already-trading view. No framework, no network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fullUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  // Generic keyword rule over the snapshot's category field — the same rule main.ts applies, never a
  // list of protocol names. Returns 'conservative', 'speculative' or 'standard'.
  function riskTier(category) {
    var c = (category || '').toLowerCase();
    if (/liquid staking|liquid restaking|restaked|staking|stable|bridge|canonical|cex|basis|insurance|rwa|wrapped/.test(c)) return 'conservative';
    if (/derivat|leveraged|perpetual|options|prediction|curator|allocator|onchain capital|risk/.test(c)) return 'speculative';
    return 'standard';
  }

  // The whole model in one local function. Every input is a snapshot figure carried by the row; the
  // page recomputes the number and shows the comparison, so code and board.json visibly agree.
  function impliedOf(row, m) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, -m.growth_clamp, m.growth_clamp);
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chain = 1 + m.chain_weight * Math.log(1 + row.chain_count);
    var tier = riskTier(row.category);
    var cat = tier === 'conservative' ? m.risk_low : tier === 'speculative' ? m.risk_high : m.risk_mid;
    return Math.max(1, Math.round(row.tvl_usd * m.base_multiple * growthMult * maturity * chain * cat));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'on') node.addEventListener(attrs[k][0], attrs[k][1]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function onClick(fn) { return { on: ['click', fn] }; }

  // ---- farm plan: the same eight derivations main.ts writes into board.json ----
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
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
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of two-sided liquidity to ' + name + "'s main pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in one of its apps.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's liquid staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('derivat') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small, fully collateralised position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position on ' + name + ', then let it settle before exiting.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and record the share price on entry.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the position.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s onchain yield asset on " + chain + ' and hold it to accrue yield.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Budget $0 and check the protocol own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var small = Math.max(5, Math.round(capital / 5));
    var gas = capital >= 150 ? 8 : 4;
    var steps = [
      { text: 'Open a dedicated wallet for this farm on ' + chain + ', fund it with $' + capital + ' of USDC plus about $' + gas + ' for gas, and store its seed phrase offline.', cost: '$' + capital + ' of USDC and about $' + gas + ' of gas', time: '6 minutes' },
      { text: "Confirm the official " + p.name + " app and contract address from the protocol's own documentation before you approve any token spend.", cost: '$0 to verify, plus a $1 gas test approval', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes' },
      { text: 'Repeat one small $' + small + ' action each week, such as a deposit, a borrow, a swap or a governance vote, so the wallet shows sustained use.', cost: 'about $2 of gas a week on ' + chain, time: '10 minutes a week' }
    ];
    if (p.chains.length > 1) {
      steps.push({ text: p.name + ' runs on ' + p.chains.length + ' chains. Bridge $' + small + ' to ' + p.chains[1] + ' and repeat one action there so activity is not limited to ' + chain + '.', cost: '$' + small + ' of capital and about $3 of bridge fees', time: '12 minutes' });
    } else {
      steps.push({ text: 'Keep all farm activity on ' + chain + ', the only chain ' + p.name + ' records in the snapshot, and avoid third-party wrappers that add counterparty risk.', cost: '$0 extra, using the gas already budgeted', time: '2 minutes' });
    }
    steps.push(
      { text: 'Hold the position for at least ' + hold + ' days so the activity lands in more than one eligibility snapshot rather than a single day.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: 'When you are ready to exit, open ' + p.name + "'s own points or rewards page and claim only from the link the protocol publishes, never from a message.", cost: '$0 to check, and pay no claim fee at all', time: '10 minutes' },
      { text: 'Log the wallet address, the dates, each transaction hash and the gas spent so the position can be repeated or unwound with an exact record.', cost: '$0 for the log itself', time: '5 minutes' }
    );
    return steps.map(stepText);
  }

  // ---- URL hash holds view state so any view is linkable (and screenshot-able) ----
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category') && params.get('category') !== 'all') state.category = params.get('category');
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) < 0 ? -1 : 1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = a.chain_count; bv = b.chain_count; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('div', { class: 'sweep', 'aria-hidden': 'true' }),
        el('div', null, el('div', { class: 'brand-name', text: 'Night Radar' }), el('div', { class: 'brand-sub', text: 'pre-token protocol board' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'tag hot', text: 'SNAPSHOT ' + DATA.as_of }),
        el('span', { class: 'tag', text: DATA.model_version.toUpperCase() + ' MODEL' }),
        el('span', { class: 'tag warn', text: 'IMPLIED VALUE IS A CLAIM' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Signal / pre-token' }),
        el('h1', { text: 'What a token would be worth if the record stayed still.' }),
        el('p', null, 'A ranked radar of ', el('b', { text: String(DATA.board_size) }), ' protocols with no token on record. All ', el('b', { text: DATA.watchlist_size }), ' watchlist slugs are covered, plus ', el('b', { text: String(DATA.early_size) }), ' early protocols below the floor. The model uses only the snapshot’s TVL, seven-day change, listed age, chains and category. Already-trading tokens sit in their own view.', el('b', { text: ' Implied value is an estimate, not a prediction of a launch.' }))
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat hi' }, el('div', { class: 'v', text: String(DATA.board_size) }), el('div', { class: 'k', text: 'pre-token rows' })),
        el('div', { class: 'stat' }, el('div', { class: 'v', text: DATA.watchlist_size + '/' + DATA.watchlist_size }), el('div', { class: 'k', text: 'watchlist covered' })),
        el('div', { class: 'stat fl' }, el('div', { class: 'v', text: String(DATA.early_size) }), el('div', { class: 'k', text: 'early, below floor' })),
        el('div', { class: 'stat' }, el('div', { class: 'v', text: String(DATA.live_size) }), el('div', { class: 'k', text: 'already trading' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board', on: ['input', function () { state.q = search.value; writeHash(); render(); }] });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category', on: ['change', function () { state.category = select.value; writeHash(); render(); }] },
      el('option', { value: 'all', text: 'All categories', selected: state.category === 'all' ? 'selected' : null }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', on: onClick(function () { state.tab = 'pre-token'; writeHash(); render(); }) });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading', on: onClick(function () { state.tab = 'live'; writeHash(); render(); }) });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Filter text' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'field-lbl', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' / ' + DATA.board_size + ' ROWS' : DATA.live.length + ' LIVE' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', on: onClick(function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); }) },
        label, state.sort === key ? el('span', { class: 'arrow', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  var SORT_CAPTION = {
    rank: 'Back to the model ranking, strongest first.',
    name: 'Sorted by protocol name, A to Z.',
    tvl: 'Sorted by TVL, largest first.',
    growth: 'Sorted by seven-day TVL change.',
    age: 'Sorted by time with no token on record.',
    chains: 'Sorted by number of chains.',
    implied: 'Implied value, strongest first.'
  };
  function boardTable() {
    var list = sortedRows(rows());
    if (!list.length) return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or choose another category to bring the board back.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', on: onClick(function () { state.q = ''; state.category = 'all'; writeHash(); render(); }) })
    ));
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        on: onClick(function () { openDetail(r.slug); })
      },
        el('td', { class: 'num rank ' + (r.rank <= 10 ? 'top' : ''), text: String(r.rank).padStart(2, '0') }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 2).join(', ') || 'chain unrecorded') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String(r.chain_count) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })), el('b', { text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'chip', text: 'no token' }))
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', null, el('b', { text: 'PRE-TOKEN RANKING. ' }), (SORT_CAPTION[state.sort] || SORT_CAPTION.implied) + ' Select any row for its model inputs and farm plan.'),
        el('thead', null, el('tr', null,
          sortHeader('rank', '#'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
          sortHeader('age', 'Age'), sortHeader('chains', 'Chains'), sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Token' })
        )),
        tbody
      )
    ));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num rank', text: '—' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 2).join(', ') || 'chain unrecorded') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', { class: 'num', text: '—' }),
        el('td', null, el('span', { class: 'chip live', text: 'trades' }))
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', null, el('b', { text: 'ALREADY TRADING. ' }), 'These protocols already have a token, so their market cap is a fact rather than an implied value. Set aside from the ranking.'),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: '#' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Chains' }), el('th', { scope: 'col', text: 'Implied' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody
      )
    ));
  }

  function modelPanel() {
    var m = DATA.model;
    var formula = 'implied = max(1, round( tvl × ' + m.base_multiple +
      ' × (1 + clamp(7d, ±' + m.growth_clamp + ')% × ' + m.growth_weight + ')' +
      ' × (' + m.maturity_floor + ' + min(age,' + m.maturity_days + ')/' + m.maturity_days + ' × ' + m.maturity_range + ')' +
      ' × (1 + ' + m.chain_weight + ' × ln(1 + chains)) × categoryRisk ))';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'The model, in full' }),
      el('p', { class: 'sub', text: 'One pure function scores every row. Every input is a snapshot field; no protocol name is special-cased and no row is hand-picked. Category risk is a keyword rule on the category field: commodity-like activity (staking, bridges, RWA) gets a conservative multiplier, speculative capital-intensive activity (derivatives, curators, leveraged farming) a premium.' }),
      el('pre', { class: 'formula', text: formula }),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: String(m.base_multiple) }), el('span', { text: 'base × TVL' })),
        el('div', { class: 'factor' }, el('b', { text: '±' + (m.growth_clamp * m.growth_weight).toFixed(0) + '%' }), el('span', { text: '7d growth band' })),
        el('div', { class: 'factor' }, el('b', { text: m.maturity_floor + '–' + (m.maturity_floor + m.maturity_range).toFixed(2) }), el('span', { text: 'maturity ' + m.maturity_days + 'd' })),
        el('div', { class: 'factor' }, el('b', { text: m.risk_low + ' / ' + m.risk_mid + ' / ' + m.risk_high }), el('span', { text: 'risk: low / mid / high' }))
      ),
      el('p', { class: 'sub', text: 'Age is the time since DefiLlama first listed the protocol — the record’s best proxy for how long it has run with no token on file; an unlisted age uses ' + m.unknown_age_days + ' days. Chain diversity uses ln(1 + chains). The early radar adds the largest pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-label': 'Protocol detail' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var m = DATA.model;
    var recomputed = impliedOf(row, m);
    var steps = farmSteps(row);
    var tier = riskTier(row.category);
    var cat = tier === 'conservative' ? m.risk_low : tier === 'speculative' ? m.risk_high : m.risk_mid;
    var growth = clamp(row.change_7d === null ? 0 : row.change_7d, -m.growth_clamp, m.growth_clamp);
    var age = row.age_days === null ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (clamp(age, 0, m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chain = 1 + m.chain_weight * Math.log(1 + row.chain_count);

    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-scroll' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'tag hot', text: 'RANK ' + String(row.rank).padStart(2, '0') + ' / ' + DATA.board_size }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + ((row.chains || []).join(', ') || 'chain unrecorded') + ' · ' + row.slug })
        ),
        el('button', { class: 'close', type: 'button', text: 'Close', 'aria-label': 'Close detail', on: onClick(function () { dialog.close(); }) })
      ),
      el('div', { class: 'hero-value' }, el('b', { text: fullUsd(row.implied_value_usd) }), el('span', { text: 'implied value · model ' + DATA.model_version })),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Model inputs & breakdown' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fullUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: '7d change (snapshot)' }), el('b', { class: row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Clamped growth' }), el('b', { text: fmtPct(growth) })),
          el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { text: fmtAge(row.age_days) + ' (' + age + 'd used)' })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: '× ' + growth.toFixed(4) + ' → ' + (1 + growth / 100 * m.growth_weight).toFixed(4) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: '× ' + maturity.toFixed(4) })),
          el('div', null, el('span', { text: 'Chain diversity (' + row.chain_count + ' chains)' }), el('b', { text: '× ' + chain.toFixed(4) })),
          el('div', null, el('span', { text: 'Category risk (' + tier + ')' }), el('b', { text: '× ' + cat.toFixed(2) })),
          el('div', { class: 'total' }, el('span', { text: 'Round(TVL × base × factors)' }), el('b', { text: fullUsd(row.implied_value_usd) }))
        ),
        el('div', { class: 'check ' + (recomputed === row.implied_value_usd ? 'ok' : 'bad'), text: (recomputed === row.implied_value_usd ? '✓ CHECK — the page recomputed ' + fullUsd(recomputed) + ', exactly the number board.json carries.' : '✗ MISMATCH — page ' + fullUsd(recomputed) + ' vs board ' + fullUsd(row.implied_value_usd)) })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan · 8 concrete steps' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      ),
      el('div', { class: 'foot', text: 'Implied value is this entry’s claim from the sealed snapshot, not a price target or a promise of a token. Farming carries risk; verify every contract yourself.' })
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' }, header(), lede(), controls(), state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('div', { class: 'foot', text: 'Night Radar · 758 protocols read · data from the sealed DefiLlama snapshot · no network requests' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
