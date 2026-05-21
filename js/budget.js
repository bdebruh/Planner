// ── Research Budget Module ─────────────────────────────────────
const Budget = (() => {

  // ── State ─────────────────────────────────────────────────────
  let _projectId   = null;
  let _grants      = [];   // [{...grant, budget_categories:[...]}]
  let _expenses    = [];
  let _projects    = [];   // all projects for "all grants" mode
  let _view        = 'overview';  // 'overview' | 'expenses' | 'grants'
  let _filterGrant = 'all';
  let _container   = null;

  // ── Number helpers ────────────────────────────────────────────
  const fmt  = n => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }));
  const pct  = (spent, total) => total > 0 ? Math.min(100, (spent / total) * 100).toFixed(1) : '0.0';
  const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ── Entry point ───────────────────────────────────────────────
  async function render(container, projectId) {
    _container  = container;
    _projectId  = projectId || null;
    container.innerHTML = '<div class="budget-loading" style="padding:60px;text-align:center;color:#80868b;font-size:13.5px;">Loading budget data…</div>';

    try {
      // Load grants + expenses (across all projects or specific one)
      if (_projectId) {
        _grants   = await DB.getGrants(_projectId);
        _expenses = await DB.getExpenses(_projectId);
      } else {
        // All projects mode
        _projects  = await DB.getProjects();
        _grants    = [];
        _expenses  = [];
        for (const p of _projects) {
          const g = await DB.getGrants(p.id);
          const e = await DB.getExpenses(p.id);
          _grants.push(...g.map(gr => ({ ...gr, _projectName: p.name, _projectColor: p.color })));
          _expenses.push(...e.map(ex => ({ ...ex, _projectName: p.name, _projectColor: p.color })));
        }
      }
      renderShell();
    } catch(e) {
      container.innerHTML = `<div style="padding:40px;color:#b91c1c;font-size:13.5px;">Error loading budget: ${esc(e.message)}</div>`;
    }
  }

  // ── Shell layout ──────────────────────────────────────────────
  function renderShell() {
    _container.innerHTML = `
      <div class="budget-wrap" style="padding:28px 32px;max-width:1100px;margin:0 auto;">

        <!-- Header row -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:22px;font-weight:700;color:#0f2d6b;letter-spacing:-.3px;margin-bottom:2px;">Research Budget</h1>
            <p style="font-size:13px;color:#80868b;">${_projectId ? 'Project budget overview' : 'All projects — combined view'}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="bud-tab ${_view==='overview'?'active':''}" onclick="Budget._setView('overview')">Overview</button>
            <button class="bud-tab ${_view==='expenses'?'active':''}" onclick="Budget._setView('expenses')">Expenses</button>
            <button class="bud-tab ${_view==='grants'?'active':''}" onclick="Budget._setView('grants')">Grants</button>
            <button class="btn-add-exp" onclick="Budget._openExpenseModal()">+ Add Expense</button>
          </div>
        </div>

        <!-- Content area -->
        <div id="budContent"></div>
      </div>

      <!-- Expense modal -->
      <div class="bud-overlay" id="budOverlay" style="display:none" onclick="if(event.target===this)Budget._closeModal()"></div>
      <div class="bud-modal" id="budModal" style="display:none"></div>
    `;

    // Inject local styles
    injectStyles();

    renderContent();
  }

  function renderContent() {
    const el = document.getElementById('budContent');
    if (!el) return;
    if (_view === 'overview') renderOverview(el);
    else if (_view === 'expenses') renderExpenses(el);
    else if (_view === 'grants') renderGrants(el);
  }

  // ── Overview ──────────────────────────────────────────────────
  function renderOverview(el) {
    const totalBudget  = _grants.reduce((s, g) => s + Number(g.total_budget || 0), 0);
    const totalSpent   = _expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalIndirect = _expenses.reduce((s, e) => s + Number(e.indirect_amount || 0), 0);
    const irbTotal     = _expenses.filter(e => e.is_irb_related).reduce((s, e) => s + Number(e.amount || 0), 0);
    const remaining    = totalBudget - totalSpent;
    const pctSpent     = pct(totalSpent, totalBudget);

    // Build grant breakdown rows
    const grantRows = _grants.map(g => {
      const spent = _expenses.filter(e => e.grant_id === g.id).reduce((s, e) => s + Number(e.amount || 0), 0);
      const rem   = Number(g.total_budget || 0) - spent;
      const p     = pct(spent, Number(g.total_budget || 0));
      return { g, spent, rem, p };
    });

    // Category breakdown (all grants)
    const catMap = {};
    _expenses.forEach(e => {
      const cat = e.category_id ? (getCategoryName(e.category_id) || 'Uncategorized') : 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += Number(e.amount || 0);
    });
    const catRows = Object.entries(catMap).sort((a,b) => b[1]-a[1]);

    el.innerHTML = `
      <!-- Summary cards -->
      <div class="budget-summary">
        <div class="budget-card">
          <div class="budget-card-label">Total Budget</div>
          <div class="budget-card-value">${fmt(totalBudget)}</div>
          <div class="budget-card-sub">${_grants.length} grant${_grants.length!==1?'s':''}</div>
        </div>
        <div class="budget-card">
          <div class="budget-card-label">Total Spent</div>
          <div class="budget-card-value" style="color:${totalSpent > totalBudget ? '#b91c1c' : '#0f2d6b'}">${fmt(totalSpent)}</div>
          <div class="budget-card-sub">${pctSpent}% of budget</div>
        </div>
        <div class="budget-card">
          <div class="budget-card-label">Remaining</div>
          <div class="budget-card-value" style="color:${remaining < 0 ? '#b91c1c' : '#1e8e3e'}">${fmt(remaining)}</div>
          <div class="budget-card-sub">${remaining < 0 ? 'Over budget' : 'Available'}</div>
        </div>
        <div class="budget-card">
          <div class="budget-card-label">F&A / Indirect</div>
          <div class="budget-card-value">${fmt(totalIndirect)}</div>
          <div class="budget-card-sub">Facilities &amp; Admin</div>
        </div>
        <div class="budget-card">
          <div class="budget-card-label">IRB Expenses</div>
          <div class="budget-card-value">${fmt(irbTotal)}</div>
          <div class="budget-card-sub">${_expenses.filter(e=>e.is_irb_related).length} item${_expenses.filter(e=>e.is_irb_related).length!==1?'s':''}</div>
        </div>
        <div class="budget-card">
          <div class="budget-card-label">Transactions</div>
          <div class="budget-card-value">${_expenses.length}</div>
          <div class="budget-card-sub">Expense records</div>
        </div>
      </div>

      <!-- Overall progress bar -->
      ${totalBudget > 0 ? `
      <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:13px;font-weight:600;color:#0f2d6b;">Budget Utilization</span>
          <span style="font-size:13px;color:#5f6368;">${fmt(totalSpent)} / ${fmt(totalBudget)}</span>
        </div>
        <div style="height:10px;background:#f1f3f4;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100,pctSpent)}%;background:${Number(pctSpent)>90?'#ef4444':Number(pctSpent)>75?'#f59e0b':'#1a5aa8'};border-radius:999px;transition:width .4s;"></div>
        </div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
        <!-- By Grant -->
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #f1f3f4;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;">By Grant</div>
          ${grantRows.length === 0 ? '<div style="padding:20px;font-size:13px;color:#80868b;text-align:center;">No grants set up yet.<br><button onclick="Budget._setView(\'grants\')" style="margin-top:8px;color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13px;">Add a grant →</button></div>' : `
          <div style="padding:12px 20px;">
            ${grantRows.map(({ g, spent, rem, p }) => `
              <div style="margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <div>
                    <span style="font-size:13px;font-weight:600;color:#0f2d6b;">${esc(g.grant_code)}</span>
                    ${g.funding_agency ? `<span style="font-size:12px;color:#80868b;margin-left:6px;">${esc(g.funding_agency)}</span>` : ''}
                  </div>
                  <span style="font-size:12px;color:#5f6368;">${p}%</span>
                </div>
                <div style="height:6px;background:#f1f3f4;border-radius:999px;overflow:hidden;margin-bottom:3px;">
                  <div style="height:100%;width:${Math.min(100,Number(p))}%;background:${Number(p)>90?'#ef4444':Number(p)>75?'#f59e0b':'#1a5aa8'};border-radius:999px;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#80868b;">
                  <span>${fmt(spent)} spent</span><span>${fmt(rem)} remaining</span>
                </div>
              </div>`).join('')}
          </div>`}
        </div>

        <!-- By Category -->
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #f1f3f4;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;">By Category</div>
          ${catRows.length === 0 ? '<div style="padding:20px;font-size:13px;color:#80868b;text-align:center;">No expenses recorded yet.<br><button onclick="Budget._openExpenseModal()" style="margin-top:8px;color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13px;">Add an expense →</button></div>' : `
          <div style="padding:12px 20px;">
            ${catRows.map(([cat, amt]) => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f9f9f9;">
                <span style="font-size:13px;color:#0f2d6b;">${esc(cat)}</span>
                <span style="font-size:13px;font-weight:500;color:#0f2d6b;font-variant-numeric:tabular-nums;">${fmt(amt)}</span>
              </div>`).join('')}
          </div>`}
        </div>
      </div>

      <!-- Recent expenses -->
      ${_expenses.length > 0 ? `
      <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">
        <div style="padding:16px 20px;border-bottom:1px solid #f1f3f4;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;">Recent Expenses</span>
          <button onclick="Budget._setView('expenses')" style="font-size:12px;color:#1a5aa8;background:none;border:none;cursor:pointer;">View all →</button>
        </div>
        <table class="budget-table">
          <thead><tr>
            <th>Date</th><th>Description</th><th>Vendor</th><th>Grant</th><th>Category</th><th style="text-align:right">Amount</th><th></th>
          </tr></thead>
          <tbody>
            ${[..._expenses].sort((a,b) => b.expense_date.localeCompare(a.expense_date)).slice(0, 8).map(e => expenseRow(e)).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `;
  }

  // ── Expenses view ─────────────────────────────────────────────
  function renderExpenses(el) {
    const filtered = _filterGrant === 'all'
      ? _expenses
      : _expenses.filter(e => e.grant_id === _filterGrant);

    const sorted = [...filtered].sort((a,b) => b.expense_date.localeCompare(a.expense_date));

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <label style="font-size:12.5px;font-weight:500;color:#5f6368;">Filter by grant:</label>
        <select class="bud-select" onchange="Budget._filterByGrant(this.value)">
          <option value="all">All grants</option>
          ${_grants.map(g => `<option value="${g.id}" ${_filterGrant===g.id?'selected':''}>${esc(g.grant_code)} — ${esc(g.name)}</option>`).join('')}
        </select>
        <span style="font-size:12.5px;color:#80868b;">${sorted.length} record${sorted.length!==1?'s':''} · ${fmt(sorted.reduce((s,e)=>s+Number(e.amount||0),0))} total</span>
        <div style="flex:1"></div>
        <button class="btn-add-exp" onclick="Budget._openExpenseModal()">+ Add Expense</button>
      </div>

      ${sorted.length === 0 ? `
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:60px;text-align:center;color:#80868b;font-size:13.5px;">
          No expenses yet.
          <div style="margin-top:10px;"><button onclick="Budget._openExpenseModal()" style="color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13.5px;">Add your first expense →</button></div>
        </div>` : `
      <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">
        <table class="budget-table">
          <thead><tr>
            <th>Date</th>
            <th>Description</th>
            <th>Vendor</th>
            <th>Grant</th>
            <th>Category</th>
            <th>Period</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right">F&A</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${sorted.map(e => expenseRow(e, true)).join('')}
          </tbody>
        </table>
      </div>`}
    `;
  }

  // ── Grants view ───────────────────────────────────────────────
  function renderGrants(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
        <button class="btn-add-exp" onclick="Budget._openGrantModal()">+ Add Grant</button>
      </div>

      ${_grants.length === 0 ? `
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:60px;text-align:center;color:#80868b;font-size:13.5px;">
          No grants set up yet.<br>
          <div style="margin-top:10px;"><button onclick="Budget._openGrantModal()" style="color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13.5px;">Add your first grant →</button></div>
        </div>` :
        _grants.map(g => grantCard(g)).join('')}
    `;
  }

  function grantCard(g) {
    const spent    = _expenses.filter(e => e.grant_id === g.id).reduce((s, e) => s + Number(e.amount || 0), 0);
    const budget   = Number(g.total_budget || 0);
    const rem      = budget - spent;
    const p        = pct(spent, budget);
    const cats     = g.budget_categories || [];

    return `
      <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <!-- Grant header -->
        <div style="padding:18px 22px;border-bottom:1px solid #f1f3f4;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#0f2d6b;margin-bottom:3px;">${esc(g.name)}</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <span class="bud-tag">${esc(g.grant_code)}</span>
              ${g.funding_agency ? `<span style="font-size:12.5px;color:#5f6368;">${esc(g.funding_agency)}</span>` : ''}
              ${g.start_date ? `<span style="font-size:12.5px;color:#80868b;">${fmtDate(g.start_date)} – ${fmtDate(g.end_date || '')}</span>` : ''}
              ${g.indirect_rate ? `<span class="bud-tag bud-tag-blue">F&A ${g.indirect_rate}%</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="bud-btn-sm" onclick="Budget._openGrantModal('${g.id}')">Edit</button>
            <button class="bud-btn-sm danger" onclick="Budget._deleteGrant('${g.id}')">Delete</button>
          </div>
        </div>

        <!-- Financials -->
        <div style="padding:18px 22px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:18px;">
            <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:4px;">Total Budget</div><div style="font-size:17px;font-weight:700;color:#0f2d6b;">${fmt(budget)}</div></div>
            <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:4px;">Spent</div><div style="font-size:17px;font-weight:700;color:${spent>budget?'#b91c1c':'#0f2d6b'};">${fmt(spent)}</div></div>
            <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:4px;">Remaining</div><div style="font-size:17px;font-weight:700;color:${rem<0?'#b91c1c':'#1e8e3e'};">${fmt(rem)}</div></div>
            <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:4px;">Utilization</div><div style="font-size:17px;font-weight:700;color:#0f2d6b;">${p}%</div></div>
          </div>

          <div style="height:8px;background:#f1f3f4;border-radius:999px;overflow:hidden;margin-bottom:18px;">
            <div style="height:100%;width:${Math.min(100,Number(p))}%;background:${Number(p)>90?'#ef4444':Number(p)>75?'#f59e0b':'#1a5aa8'};border-radius:999px;transition:width .4s;"></div>
          </div>

          <!-- Budget categories table -->
          ${cats.length > 0 ? `
            <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:10px;">Budget Categories</div>
            <table class="budget-table" style="margin-bottom:12px;">
              <thead><tr>
                <th>Category</th><th>Period</th><th style="text-align:right">Budgeted</th><th style="text-align:right">Spent</th><th style="text-align:right">Remaining</th>
              </tr></thead>
              <tbody>
                ${cats.map(c => {
                  const catSpent = _expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + Number(e.amount || 0), 0);
                  const catRem   = Number(c.budgeted || 0) - catSpent;
                  return `<tr>
                    <td style="font-weight:500;">${esc(c.name)}</td>
                    <td style="color:#80868b;">${esc(c.period)}</td>
                    <td class="amount" style="text-align:right;">${fmt(c.budgeted)}</td>
                    <td class="amount" style="text-align:right;color:${catSpent > Number(c.budgeted) ? '#b91c1c' : 'inherit'}">${fmt(catSpent)}</td>
                    <td class="amount" style="text-align:right;color:${catRem < 0 ? '#b91c1c' : '#1e8e3e'}">${fmt(catRem)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          ` : ''}

          <button class="bud-btn-sm" onclick="Budget._openCategoryModal('${g.id}')">+ Add Budget Category</button>
        </div>
      </div>
    `;
  }

  // ── Expense row helper ────────────────────────────────────────
  function expenseRow(e, full = false) {
    const grant = _grants.find(g => g.id === e.grant_id);
    const catName = getCategoryName(e.category_id);
    return `
      <tr>
        <td style="white-space:nowrap;color:#80868b;">${fmtDate(e.expense_date)}</td>
        <td>
          <div style="font-weight:500;color:#0f2d6b;">${esc(e.description)}</div>
          ${e.notes ? `<div style="font-size:11.5px;color:#80868b;margin-top:1px;">${esc(e.notes)}</div>` : ''}
          ${e.is_irb_related ? '<span class="irb-badge" style="margin-top:3px;display:inline-block;">IRB</span>' : ''}
          ${e.receipt_url ? `<a href="${esc(e.receipt_url)}" target="_blank" style="font-size:11.5px;color:#1a5aa8;margin-left:6px;">Receipt ↗</a>` : ''}
        </td>
        <td style="color:#5f6368;">${esc(e.vendor)}</td>
        <td>${grant ? `<span class="bud-tag">${esc(grant.grant_code)}</span>` : '<span style="color:#80868b;font-size:12px;">—</span>'}</td>
        ${full ? `
          <td style="color:#5f6368;">${esc(catName || '—')}</td>
          <td style="color:#5f6368;">${esc(e.budget_period || '—')}</td>
        ` : `
          <td style="color:#5f6368;">${esc(catName || '—')}</td>
        `}
        <td class="amount" style="text-align:right;font-weight:600;">${fmt(e.amount)}</td>
        ${full ? `<td class="amount" style="text-align:right;color:#80868b;font-size:12px;">${e.indirect_amount > 0 ? fmt(e.indirect_amount) : '—'}</td>` : ''}
        <td style="text-align:right;white-space:nowrap;">
          <button class="bud-btn-sm" onclick="Budget._openExpenseModal('${e.id}')" style="margin-right:4px;">Edit</button>
          <button class="bud-btn-sm danger" onclick="Budget._deleteExpense('${e.id}')">Del</button>
        </td>
      </tr>`;
  }

  // ── Expense Modal ─────────────────────────────────────────────
  function _openExpenseModal(expenseId) {
    const expense = expenseId ? _expenses.find(e => e.id === expenseId) : null;
    const isNew   = !expense;

    // Period options
    const periods = ['Year 1','Year 2','Year 3','Year 4','Year 5','No-cost Extension'];

    // Gather categories (flat list across all grants)
    const allCats = _grants.flatMap(g => (g.budget_categories || []).map(c => ({ ...c, grantCode: g.grant_code })));

    const modal = document.getElementById('budModal');
    const overlay = document.getElementById('budOverlay');

    modal.innerHTML = `
      <div class="bud-modal-header">
        <span>${isNew ? 'Add Expense' : 'Edit Expense'}</span>
        <button class="bud-modal-close" onclick="Budget._closeModal()">✕</button>
      </div>
      <div class="bud-modal-body">
        <div class="bud-form-grid">
          <div class="bud-field bud-field-wide">
            <label>Description *</label>
            <input type="text" id="ef-desc" class="bud-input" placeholder="e.g. Participant incentive payment" value="${esc(expense?.description||'')}">
          </div>
          <div class="bud-field">
            <label>Date *</label>
            <input type="date" id="ef-date" class="bud-input" value="${expense?.expense_date || today()}">
          </div>
          <div class="bud-field">
            <label>Amount ($) *</label>
            <input type="number" id="ef-amount" class="bud-input" step="0.01" min="0" placeholder="0.00" value="${expense?.amount||''}">
          </div>
          <div class="bud-field">
            <label>Vendor / Payee</label>
            <input type="text" id="ef-vendor" class="bud-input" placeholder="e.g. Amazon, USC Bookstore" value="${esc(expense?.vendor||'')}">
          </div>
          <div class="bud-field">
            <label>Grant</label>
            <select id="ef-grant" class="bud-input" onchange="Budget._onGrantChange()">
              <option value="">— Select grant —</option>
              ${_grants.map(g => `<option value="${g.id}" ${expense?.grant_id===g.id?'selected':''}>${esc(g.grant_code)} — ${esc(g.name)}</option>`).join('')}
            </select>
          </div>
          <div class="bud-field">
            <label>Budget Category</label>
            <select id="ef-cat" class="bud-input">
              <option value="">— Select category —</option>
              ${allCats.map(c => `<option value="${c.id}" ${expense?.category_id===c.id?'selected':''}>[${esc(c.grantCode)}] ${esc(c.name)} (${esc(c.period)})</option>`).join('')}
            </select>
          </div>
          <div class="bud-field">
            <label>Budget Period</label>
            <select id="ef-period" class="bud-input">
              ${periods.map(p => `<option value="${p}" ${expense?.budget_period===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="bud-field">
            <label>Receipt URL</label>
            <input type="url" id="ef-receipt" class="bud-input" placeholder="https://drive.google.com/…" value="${esc(expense?.receipt_url||'')}">
          </div>
          <div class="bud-field bud-field-wide">
            <label>Notes</label>
            <textarea id="ef-notes" class="bud-input" rows="2" placeholder="Optional notes or justification">${esc(expense?.notes||'')}</textarea>
          </div>

          <!-- Flags -->
          <div class="bud-field bud-field-wide" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
            <label class="bud-check">
              <input type="checkbox" id="ef-irb" ${expense?.is_irb_related ? 'checked' : ''}>
              <span>IRB-related expense</span>
            </label>
            <label class="bud-check">
              <input type="checkbox" id="ef-indirect" ${expense?.is_indirect ? 'checked' : ''} onchange="Budget._onIndirectChange()">
              <span>Indirect / F&A cost</span>
            </label>
          </div>

          <!-- F&A amount (shown when indirect checked) -->
          <div class="bud-field" id="ef-fa-wrap" style="${expense?.is_indirect ? '' : 'display:none'}">
            <label>F&A Amount ($)</label>
            <input type="number" id="ef-fa" class="bud-input" step="0.01" min="0" placeholder="0.00" value="${expense?.indirect_amount||''}">
            <div id="ef-fa-hint" style="font-size:11.5px;color:#80868b;margin-top:3px;"></div>
          </div>
        </div>
      </div>
      <div class="bud-modal-footer">
        <button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>
        <button class="bud-btn-save" onclick="Budget._saveExpense('${expenseId||''}')">
          ${isNew ? 'Add Expense' : 'Save Changes'}
        </button>
      </div>
    `;

    modal.style.display = '';
    overlay.style.display = '';
    document.getElementById('ef-desc').focus();

    // Auto-calc F&A hint when grant selected
    _onGrantChange();
  }

  function _onGrantChange() {
    const grantId  = document.getElementById('ef-grant')?.value;
    const grant    = _grants.find(g => g.id === grantId);
    const hint     = document.getElementById('ef-fa-hint');
    const amount   = parseFloat(document.getElementById('ef-amount')?.value || 0);
    if (hint && grant && grant.indirect_rate > 0) {
      const fa = (amount * grant.indirect_rate / 100).toFixed(2);
      hint.textContent = `Based on ${grant.indirect_rate}% F&A rate = ${fmt(fa)}`;
      const faInput = document.getElementById('ef-fa');
      if (faInput && !faInput.value) faInput.value = fa;
    } else if (hint) {
      hint.textContent = '';
    }
  }

  function _onIndirectChange() {
    const cb   = document.getElementById('ef-indirect');
    const wrap = document.getElementById('ef-fa-wrap');
    if (wrap) wrap.style.display = cb?.checked ? '' : 'none';
  }

  async function _saveExpense(expenseId) {
    const desc    = document.getElementById('ef-desc')?.value.trim();
    const date    = document.getElementById('ef-date')?.value;
    const amount  = document.getElementById('ef-amount')?.value;
    const vendor  = document.getElementById('ef-vendor')?.value.trim();
    const grantId = document.getElementById('ef-grant')?.value || null;
    const catId   = document.getElementById('ef-cat')?.value || null;
    const period  = document.getElementById('ef-period')?.value;
    const receipt = document.getElementById('ef-receipt')?.value.trim();
    const notes   = document.getElementById('ef-notes')?.value.trim();
    const isIrb   = document.getElementById('ef-irb')?.checked;
    const isInd   = document.getElementById('ef-indirect')?.checked;
    const faAmt   = document.getElementById('ef-fa')?.value || '0';

    if (!desc) { alert('Description is required.'); return; }
    if (!date) { alert('Date is required.'); return; }
    if (!amount || isNaN(parseFloat(amount))) { alert('Amount is required.'); return; }

    const projectId = _projectId || (grantId ? _grants.find(g => g.id === grantId)?.project_id : null);

    const payload = {
      project_id:      projectId,
      grant_id:        grantId,
      category_id:     catId,
      description:     desc,
      vendor:          vendor,
      amount:          parseFloat(amount),
      expense_date:    date,
      is_irb_related:  isIrb,
      is_indirect:     isInd,
      indirect_amount: isInd ? parseFloat(faAmt) || 0 : 0,
      receipt_url:     receipt,
      budget_period:   period,
      notes:           notes,
    };

    if (expenseId) payload.id = expenseId;

    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (expenseId) {
        await DB.updateExpense(expenseId, payload);
        const idx = _expenses.findIndex(e => e.id === expenseId);
        if (idx >= 0) _expenses[idx] = { ..._expenses[idx], ...payload };
      } else {
        const newExp = await DB.createExpense(payload);
        _expenses.unshift(newExp);
      }
      _closeModal();
      toast(expenseId ? 'Expense updated.' : 'Expense added.', 'success');
      renderContent();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = expenseId ? 'Save Changes' : 'Add Expense'; }
    }
  }

  async function _deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await DB.deleteExpense(id);
      _expenses = _expenses.filter(e => e.id !== id);
      toast('Expense deleted.', '');
      renderContent();
    } catch(e) {
      alert('Delete failed: ' + e.message);
    }
  }

  // ── Grant Modal ───────────────────────────────────────────────
  function _openGrantModal(grantId) {
    const grant = grantId ? _grants.find(g => g.id === grantId) : null;
    const isNew = !grant;

    const modal   = document.getElementById('budModal');
    const overlay = document.getElementById('budOverlay');

    modal.innerHTML = `
      <div class="bud-modal-header">
        <span>${isNew ? 'Add Grant' : 'Edit Grant'}</span>
        <button class="bud-modal-close" onclick="Budget._closeModal()">✕</button>
      </div>
      <div class="bud-modal-body">
        <div class="bud-form-grid">
          <div class="bud-field bud-field-wide">
            <label>Grant Name *</label>
            <input type="text" id="gf-name" class="bud-input" placeholder="e.g. NSF Dissertation Improvement Grant" value="${esc(grant?.name||'')}">
          </div>
          <div class="bud-field">
            <label>Grant Code *</label>
            <input type="text" id="gf-code" class="bud-input" placeholder="e.g. NSF-2301234" value="${esc(grant?.grant_code||'')}">
          </div>
          <div class="bud-field">
            <label>Funding Agency</label>
            <input type="text" id="gf-agency" class="bud-input" placeholder="e.g. National Science Foundation" value="${esc(grant?.funding_agency||'')}">
          </div>
          <div class="bud-field">
            <label>Total Budget ($)</label>
            <input type="number" id="gf-budget" class="bud-input" step="0.01" min="0" placeholder="0.00" value="${grant?.total_budget||''}">
          </div>
          <div class="bud-field">
            <label>F&A / Indirect Rate (%)</label>
            <input type="number" id="gf-rate" class="bud-input" step="0.01" min="0" max="100" placeholder="e.g. 52.5" value="${grant?.indirect_rate||''}">
            <div style="font-size:11.5px;color:#80868b;margin-top:3px;">Facilities &amp; Administrative (overhead) rate</div>
          </div>
          <div class="bud-field">
            <label>Start Date</label>
            <input type="date" id="gf-start" class="bud-input" value="${grant?.start_date||''}">
          </div>
          <div class="bud-field">
            <label>End Date</label>
            <input type="date" id="gf-end" class="bud-input" value="${grant?.end_date||''}">
          </div>
        </div>
      </div>
      <div class="bud-modal-footer">
        <button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>
        <button class="bud-btn-save" onclick="Budget._saveGrant('${grantId||''}')">
          ${isNew ? 'Add Grant' : 'Save Changes'}
        </button>
      </div>
    `;

    modal.style.display = '';
    overlay.style.display = '';
    document.getElementById('gf-name').focus();
  }

  async function _saveGrant(grantId) {
    const name   = document.getElementById('gf-name')?.value.trim();
    const code   = document.getElementById('gf-code')?.value.trim();
    const agency = document.getElementById('gf-agency')?.value.trim();
    const budget = document.getElementById('gf-budget')?.value;
    const rate   = document.getElementById('gf-rate')?.value;
    const start  = document.getElementById('gf-start')?.value;
    const end    = document.getElementById('gf-end')?.value;

    if (!name) { alert('Grant name is required.'); return; }
    if (!code) { alert('Grant code is required.'); return; }

    const payload = {
      project_id:     _projectId,
      name,
      grant_code:     code,
      funding_agency: agency,
      total_budget:   budget ? parseFloat(budget) : 0,
      indirect_rate:  rate   ? parseFloat(rate)   : 0,
      start_date:     start  || null,
      end_date:       end    || null,
    };
    if (grantId) payload.id = grantId;

    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (grantId) {
        await DB.updateGrant(grantId, payload);
        const idx = _grants.findIndex(g => g.id === grantId);
        if (idx >= 0) _grants[idx] = { ..._grants[idx], ...payload };
      } else {
        const newGrant = await DB.createGrant(payload);
        _grants.push({ ...newGrant, budget_categories: [] });
      }
      _closeModal();
      toast(grantId ? 'Grant updated.' : 'Grant added.', 'success');
      renderContent();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = grantId ? 'Save Changes' : 'Add Grant'; }
    }
  }

  async function _deleteGrant(id) {
    if (!confirm('Delete this grant and all its categories? Expenses will be unlinked but not deleted.')) return;
    try {
      // Supabase will cascade-delete categories; expenses have on delete set null
      const { error } = await DB.client.from('grants').delete().eq('id', id);
      if (error) throw error;
      _grants = _grants.filter(g => g.id !== id);
      _expenses = _expenses.map(e => e.grant_id === id ? { ...e, grant_id: null } : e);
      toast('Grant deleted.', '');
      renderContent();
    } catch(e) {
      alert('Delete failed: ' + e.message);
    }
  }

  // ── Category Modal ────────────────────────────────────────────
  function _openCategoryModal(grantId) {
    const grant = _grants.find(g => g.id === grantId);
    const modal   = document.getElementById('budModal');
    const overlay = document.getElementById('budOverlay');
    const categories = ['Personnel','Fringe Benefits','Equipment','Travel','Participant Support','Materials & Supplies','Consultants','Indirect/F&A','Other'];
    const periods    = ['Year 1','Year 2','Year 3','Year 4','Year 5','No-cost Extension'];

    modal.innerHTML = `
      <div class="bud-modal-header">
        <span>Add Budget Category — ${esc(grant?.grant_code)}</span>
        <button class="bud-modal-close" onclick="Budget._closeModal()">✕</button>
      </div>
      <div class="bud-modal-body">
        <div class="bud-form-grid">
          <div class="bud-field">
            <label>Category *</label>
            <select id="cf-name" class="bud-input">
              ${categories.map(c => `<option>${c}</option>`).join('')}
              <option value="__custom">Custom…</option>
            </select>
          </div>
          <div class="bud-field" id="cf-custom-wrap" style="display:none">
            <label>Custom Category Name</label>
            <input type="text" id="cf-custom" class="bud-input" placeholder="Enter category name">
          </div>
          <div class="bud-field">
            <label>Budget Period</label>
            <select id="cf-period" class="bud-input">
              ${periods.map(p => `<option>${p}</option>`).join('')}
            </select>
          </div>
          <div class="bud-field">
            <label>Budgeted Amount ($)</label>
            <input type="number" id="cf-budget" class="bud-input" step="0.01" min="0" placeholder="0.00">
          </div>
        </div>
      </div>
      <div class="bud-modal-footer">
        <button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>
        <button class="bud-btn-save" onclick="Budget._saveCategory('${grantId}')">Add Category</button>
      </div>
    `;

    // Custom category toggle
    document.getElementById('cf-name').addEventListener('change', function() {
      document.getElementById('cf-custom-wrap').style.display = this.value === '__custom' ? '' : 'none';
    });

    modal.style.display = '';
    overlay.style.display = '';
  }

  async function _saveCategory(grantId) {
    const nameEl   = document.getElementById('cf-name');
    const customEl = document.getElementById('cf-custom');
    const name     = nameEl?.value === '__custom' ? customEl?.value.trim() : nameEl?.value;
    const period   = document.getElementById('cf-period')?.value;
    const budgeted = document.getElementById('cf-budget')?.value;

    if (!name) { alert('Category name is required.'); return; }

    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    try {
      const { data, error } = await DB.client.from('budget_categories')
        .insert({ grant_id: grantId, name, period, budgeted: parseFloat(budgeted) || 0 })
        .select().single();
      if (error) throw error;
      const grant = _grants.find(g => g.id === grantId);
      if (grant) { grant.budget_categories = grant.budget_categories || []; grant.budget_categories.push(data); }
      _closeModal();
      toast('Category added.', 'success');
      renderContent();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Add Category'; }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _closeModal() {
    document.getElementById('budModal').style.display   = 'none';
    document.getElementById('budOverlay').style.display = 'none';
  }

  function _setView(view) {
    _view = view;
    // Update tab buttons
    document.querySelectorAll('.bud-tab').forEach(b => b.classList.remove('active'));
    const tabs = document.querySelectorAll('.bud-tab');
    const idx  = ['overview','expenses','grants'].indexOf(view);
    if (tabs[idx]) tabs[idx].classList.add('active');
    renderContent();
  }

  function _filterByGrant(val) {
    _filterGrant = val;
    renderContent();
  }

  function getCategoryName(catId) {
    if (!catId) return null;
    for (const g of _grants) {
      const cat = (g.budget_categories || []).find(c => c.id === catId);
      if (cat) return cat.name;
    }
    return null;
  }

  function fmtDate(d) {
    if (!d) return '—';
    const parts = d.slice(0, 10).split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;
  }

  function today() {
    return new Date().toISOString().slice(0,10);
  }

  // ── Inject component styles ───────────────────────────────────
  function injectStyles() {
    if (document.getElementById('bud-styles')) return;
    const s = document.createElement('style');
    s.id = 'bud-styles';
    s.textContent = `
      .bud-tab {
        padding: 7px 18px; border-radius: 999px; border: 1.5px solid #dadce0;
        background: #fff; cursor: pointer; font-size: 13px; font-weight: 500;
        font-family: inherit; color: #0f2d6b; transition: all .15s;
      }
      .bud-tab:hover { border-color: #1a5aa8; color: #1a5aa8; }
      .bud-tab.active { background: #0f3460; color: #fff; border-color: #0f3460; }

      .btn-add-exp {
        padding: 8px 20px; border-radius: 999px; border: none;
        background: #0f3460; color: #fff; cursor: pointer;
        font-size: 13px; font-weight: 600; font-family: inherit;
        transition: background .15s, transform .12s;
      }
      .btn-add-exp:hover { background: #16407a; transform: translateY(-1px); }

      .bud-select {
        padding: 7px 12px; border-radius: 8px; border: 1.5px solid #dadce0;
        font-size: 13px; font-family: inherit; color: #0f2d6b;
        background: #fff; outline: none; cursor: pointer;
      }
      .bud-select:focus { border-color: #1a5aa8; box-shadow: 0 0 0 3px rgba(26,90,168,.1); }

      .bud-tag {
        display: inline-block; font-size: 11.5px; padding: 2px 9px;
        border-radius: 999px; background: #e8f0fe; color: #1a5aa8; font-weight: 600;
      }
      .bud-tag-blue { background: #e8f0fe; color: #1a5aa8; }

      .bud-btn-sm {
        padding: 4px 12px; border-radius: 999px; border: 1.5px solid #dadce0;
        background: #fff; cursor: pointer; font-size: 12px; font-family: inherit;
        color: #0f2d6b; transition: all .12s;
      }
      .bud-btn-sm:hover { border-color: #1a5aa8; color: #1a5aa8; }
      .bud-btn-sm.danger { color: #b91c1c; border-color: rgba(185,28,28,.25); }
      .bud-btn-sm.danger:hover { background: #fef2f2; }

      /* Modal */
      .bud-overlay {
        position: fixed; inset: 0; background: rgba(15,45,107,.18);
        z-index: 1000; backdrop-filter: blur(2px);
      }
      .bud-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        width: 560px; max-width: calc(100vw - 32px);
        max-height: 90vh; overflow: hidden;
        background: #fff; border-radius: 16px;
        box-shadow: 0 8px 48px rgba(15,45,107,.18);
        z-index: 1001; display: flex; flex-direction: column;
      }
      .bud-modal-header {
        padding: 18px 22px 16px;
        font-size: 16px; font-weight: 700; color: #0f2d6b;
        border-bottom: 1px solid #f1f3f4;
        display: flex; justify-content: space-between; align-items: center;
        flex-shrink: 0;
      }
      .bud-modal-close {
        background: none; border: none; cursor: pointer; font-size: 17px;
        color: #80868b; line-height: 1; padding: 4px;
        border-radius: 6px; transition: background .12s;
      }
      .bud-modal-close:hover { background: #f1f3f4; color: #0f2d6b; }
      .bud-modal-body {
        padding: 20px 22px; overflow-y: auto; flex: 1;
      }
      .bud-modal-footer {
        padding: 14px 22px; border-top: 1px solid #f1f3f4;
        display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
      }
      .bud-btn-cancel {
        padding: 9px 22px; border-radius: 999px; border: 1.5px solid #dadce0;
        background: #fff; cursor: pointer; font-size: 13.5px; font-family: inherit; color: #0f2d6b;
      }
      .bud-btn-save {
        padding: 9px 22px; border-radius: 999px; border: none;
        background: #0f3460; color: #fff;
        cursor: pointer; font-size: 13.5px; font-weight: 600; font-family: inherit;
        transition: background .15s;
      }
      .bud-btn-save:hover { background: #16407a; }
      .bud-btn-save:disabled { opacity: .55; cursor: not-allowed; }

      /* Form grid */
      .bud-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .bud-field { display: flex; flex-direction: column; gap: 5px; }
      .bud-field-wide { grid-column: 1 / -1; }
      .bud-field label { font-size: 12.5px; font-weight: 500; color: #5f6368; }
      .bud-input {
        padding: 9px 12px; border-radius: 8px; border: 1.5px solid #dadce0;
        font-size: 13.5px; font-family: inherit; color: #0f2d6b;
        background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
        width: 100%;
      }
      .bud-input:focus { border-color: #1a5aa8; box-shadow: 0 0 0 3px rgba(26,90,168,.1); }
      textarea.bud-input { resize: vertical; min-height: 60px; }

      .bud-check { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 13px; color: #0f2d6b; }
      .bud-check input[type=checkbox] { width: 15px; height: 15px; accent-color: #0f3460; cursor: pointer; }

      @media (max-width: 600px) {
        .bud-form-grid { grid-template-columns: 1fr; }
        .bud-field-wide { grid-column: 1; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    render,
    _setView,
    _filterByGrant,
    _openExpenseModal,
    _saveExpense,
    _deleteExpense,
    _openGrantModal,
    _saveGrant,
    _deleteGrant,
    _openCategoryModal,
    _saveCategory,
    _closeModal,
    _onGrantChange,
    _onIndirectChange,
  };
})();
