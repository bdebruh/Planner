// ── Research Budget ────────────────────────────────────────────
const Budget = (() => {
  let _container    = null;
  let _budgets      = [];
  let _activeBudget = null;
  let _transactions = [];

  const fmt = n => '$' + Math.abs(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const today = () => new Date().toISOString().slice(0,10);
  const fmtDate = d => {
    if (!d) return '—';
    const [y,m,day] = d.slice(0,10).split('-');
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+parseInt(day)+', '+y;
  };

  // ── Entry point ───────────────────────────────────────────────
  async function render(container) {
    _container = container;
    injectStyles();
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';
    try {
      const projects = await DB.getProjects();
      _budgets = [];
      for (const p of projects) {
        const grants = await DB.getGrants(p.id);
        grants.forEach(g => _budgets.push({ ...g, _projectName: p.name, _projectColor: p.color, _projectId: p.id }));
      }
      if (_activeBudget) {
        const found = _budgets.find(b => b.id === _activeBudget.id);
        if (found) {
          _activeBudget = found;
          _transactions = await DB.getExpenses(_activeBudget.project_id);
          _transactions = _transactions.filter(t => t.grant_id === _activeBudget.id);
          renderDetail();
        } else {
          _activeBudget = null;
          renderList();
        }
      } else {
        renderList();
      }
    } catch(e) {
      container.innerHTML = '<div style="padding:40px;color:#b91c1c;">Error: ' + esc(e.message) + '</div>';
    }
  }

  // ── List view ─────────────────────────────────────────────────
  function renderList() {
    let html = '<div class="bud-page">';
    html += '<div class="bud-header">';
    html += '<div><h1 class="bud-title">Research Budget</h1>';
    html += '<p class="bud-subtitle">' + _budgets.length + ' budget' + (_budgets.length!==1?'s':'') + ' across all projects</p></div>';
    html += '<button class="bud-btn-primary" onclick="Budget._openBudgetModal()">+ New Budget</button>';
    html += '</div>';

    if (_budgets.length === 0) {
      html += '<div class="bud-empty"><div style="font-size:32px;margin-bottom:12px;">💰</div>';
      html += '<div style="font-size:15px;font-weight:600;color:#0f2d6b;margin-bottom:6px;">No budgets yet</div>';
      html += '<button class="bud-btn-primary" onclick="Budget._openBudgetModal()">Create your first budget</button></div>';
    } else {
      html += '<div class="bud-grid">';
      _budgets.forEach(b => { html += budgetCard(b); });
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="bud-overlay" id="budOverlay" style="display:none" onclick="if(event.target===this)Budget._closeModal()"></div>';
    html += '<div class="bud-modal" id="budModal" style="display:none"></div>';
    _container.innerHTML = html;
  }

  function budgetCard(b) {
    const alloc   = Number(b.total_budget||0);
    const pctUsed = 0;
    return '<div class="bud-card" onclick="Budget._openBudget(\'' + b.id + '\')">'
      + '<div class="bud-card-top">'
      + '<div><div class="bud-card-name">' + esc(b.name) + '</div>'
      + '<div class="bud-card-meta"><span class="bud-tag">' + esc(b.grant_code) + '</span>'
      + (b.funding_agency ? '<span style="color:#80868b;font-size:12px;margin-left:6px;">' + esc(b.funding_agency) + '</span>' : '')
      + '</div></div>'
      + '<div style="text-align:right"><div style="font-size:11px;color:#80868b;text-transform:uppercase;letter-spacing:.05em;">Allocated</div>'
      + '<div style="font-size:20px;font-weight:700;color:#0f2d6b;">' + fmt(alloc) + '</div></div>'
      + '</div>'
      + '<div class="bud-progress-bar"><div style="width:0%;background:#1a5aa8;"></div></div>'
      + '<div class="bud-card-stats">'
      + '<div><span style="color:#80868b;">Agency</span><strong>' + esc(b.funding_agency||'—') + '</strong></div>'
      + '<div><span style="color:#80868b;">Project</span><strong>' + esc(b._projectName||'—') + '</strong></div>'
      + '</div></div>';
  }

  // ── Detail view ───────────────────────────────────────────────
  function renderDetail() {
    const b    = _activeBudget;
    const cats = b.budget_categories || [];

    // Group debits by category
    const debits = _transactions.filter(t => t.transaction_type !== 'income');
    const credits = _transactions.filter(t => t.transaction_type === 'income');
    const expByCat = {};
    debits.forEach(t => {
      const key = t.category_id || '__none';
      if (!expByCat[key]) expByCat[key] = [];
      expByCat[key].push(t);
    });

    const totalBudgeted = cats.reduce((s,c) => s+Number(c.budgeted||0), 0) || Number(b.total_budget||0);
    const totalActual   = debits.reduce((s,t) => s+Number(t.amount||0), 0);
    const totalCredits  = credits.reduce((s,t) => s+Number(t.amount||0), 0);
    const totalBalance  = totalBudgeted - totalActual + totalCredits;
    const pctUsed       = totalBudgeted > 0 ? Math.min(100, (totalActual/totalBudgeted)*100) : 0;

    let html = '<div class="bud-page">';

    // Back + header
    html += '<div style="margin-bottom:20px;">';
    html += '<button class="bud-back" onclick="Budget._backToList()" style="margin-bottom:10px;">← All Budgets</button>';
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">';
    html += '<div><h1 class="bud-title">' + esc(b.name) + '</h1>';
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;">';
    html += '<span class="bud-tag">' + esc(b.grant_code) + '</span>';
    if (b.funding_agency) html += '<span style="font-size:12.5px;color:#80868b;">' + esc(b.funding_agency) + '</span>';
    if (b._projectName) html += '<button onclick="openProject(\'' + esc(b._projectId) + '\')" style="background:none;border:none;cursor:pointer;font-size:12.5px;color:#1a5aa8;padding:0;font-family:inherit;">→ ' + esc(b._projectName) + '</button>';
    html += '</div></div>';
    html += '<div style="display:flex;gap:8px;flex-shrink:0;">';
    html += '<button class="bud-btn-outline" onclick="Budget._openBudgetModal(\'' + b.id + '\')">Edit Budget</button>';
    html += '<button class="bud-btn-outline" onclick="Budget._openCategoryModal(\'' + b.id + '\')">+ Budget Line</button>';
    html += '<button class="bud-btn-primary" onclick="Budget._openTxModal()">+ Transaction</button>';
    html += '</div></div></div>';

    // Summary cards
    html += '<div class="bud-summary-row" style="margin-bottom:20px;">';
    html += statCard('Total Budgeted', fmt(totalBudgeted), cats.length + ' line item' + (cats.length!==1?'s':''));
    html += statCard('Actual Spent', fmt(totalActual), pctUsed.toFixed(1) + '% of budget', totalActual > totalBudgeted ? '#b91c1c' : '#ef4444');
    html += statCard('Credits', fmt(totalCredits), credits.length + ' payment' + (credits.length!==1?'s':''), '#1e8e3e');
    html += statCard('Remaining', fmt(totalBalance), totalBalance < 0 ? 'Over budget' : 'Available', totalBalance < 0 ? '#b91c1c' : '#1e8e3e', true);
    html += '</div>';

    // Progress bar
    html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:16px 20px;margin-bottom:20px;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;font-weight:600;color:#0f2d6b;">Budget Utilization</span><span style="font-size:13px;color:#5f6368;">' + fmt(totalActual) + ' of ' + fmt(totalBudgeted) + '</span></div>';
    html += '<div class="bud-progress-bar" style="height:10px;"><div style="width:' + pctUsed + '%;background:' + (pctUsed>90?'#ef4444':pctUsed>75?'#f59e0b':'#1a5aa8') + ';"></div></div>';
    html += '</div>';

    // Budget vs Actual table
    html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;margin-bottom:20px;">';
    // Table header
    html += '<div style="display:grid;grid-template-columns:1fr 120px 120px 120px 90px;gap:8px;padding:12px 20px;border-bottom:2px solid #f1f3f4;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#80868b;background:#f8f9fa;">';
    html += '<div>Line Item</div><div style="text-align:right">Budgeted</div><div style="text-align:right">Actual</div><div style="text-align:right">Remaining</div><div></div>';
    html += '</div>';

    if (cats.length === 0 && !expByCat['__none']) {
      html += '<div style="padding:36px;text-align:center;color:#80868b;font-size:13.5px;">No budget line items yet. ';
      html += '<button onclick="Budget._openCategoryModal(\'' + b.id + '\')" style="color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13.5px;">+ Add a budget line →</button></div>';
    }

    // Category rows
    cats.forEach(function(cat) {
      const txs      = expByCat[cat.id] || [];
      const actual   = txs.reduce((s,t) => s+Number(t.amount||0), 0);
      const budgeted = Number(cat.budgeted||0);
      const rem      = budgeted - actual;
      const pct      = budgeted > 0 ? Math.min(100,(actual/budgeted)*100) : 0;
      const over     = rem < 0;

      html += '<div class="bud-line-item">';
      html += '<div onclick="Budget._toggleCat(\'' + cat.id + '\')" class="bud-line-header">';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<span id="tog-' + cat.id + '" style="font-size:10px;color:#80868b;display:inline-block;transition:transform .15s;">▶</span>';
      html += '<div><div style="font-size:13.5px;font-weight:600;color:#0f2d6b;">' + esc(cat.name) + '</div>';
      html += '<div style="font-size:11.5px;color:#80868b;">' + esc(cat.period||'') + ' · ' + txs.length + ' transaction' + (txs.length!==1?'s':'') + '</div></div></div>';
      html += '<div style="text-align:right;font-variant-numeric:tabular-nums;color:#5f6368;">' + fmt(budgeted) + '</div>';
      html += '<div style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:' + (over?'#b91c1c':'#0f2d6b') + ';">' + fmt(actual) + '</div>';
      html += '<div style="text-align:right;font-variant-numeric:tabular-nums;color:' + (over?'#b91c1c':'#1e8e3e') + ';font-weight:500;">' + fmt(rem) + '</div>';
      html += '<div style="text-align:right;"><button onclick="event.stopPropagation();Budget._openTxModal(null,\'' + cat.id + '\')" class="bud-row-btn">+ Add</button></div>';
      html += '</div>';
      html += '<div style="height:3px;background:#f1f3f4;margin:0 20px;"><div style="height:100%;width:' + pct + '%;background:' + (pct>90?'#ef4444':pct>75?'#f59e0b':'#1a5aa8') + ';border-radius:999px;"></div></div>';

      // Transaction sub-rows
      html += '<div id="rows-' + cat.id + '" style="display:none;">';
      if (txs.length === 0) {
        html += '<div style="padding:10px 20px 10px 44px;font-size:13px;color:#80868b;font-style:italic;">No transactions yet — ';
        html += '<button onclick="Budget._openTxModal(null,\'' + cat.id + '\')" style="color:#1a5aa8;background:none;border:none;cursor:pointer;font-family:inherit;font-size:13px;">add one</button></div>';
      } else {
        const sorted = txs.slice().sort((a,z) => z.expense_date.localeCompare(a.expense_date));
        sorted.forEach(function(t) {
          html += '<div style="display:grid;grid-template-columns:95px 1fr 100px 90px;gap:8px;padding:8px 20px 8px 44px;border-top:1px solid #f9f9f9;align-items:center;font-size:13px;">';
          html += '<div style="color:#80868b;">' + fmtDate(t.expense_date) + '</div>';
          html += '<div><span style="color:#0f2d6b;">' + esc(t.description) + '</span>';
          if (t.vendor) html += '<span style="color:#b0b0b5;font-size:11.5px;margin-left:6px;">' + esc(t.vendor) + '</span>';
          if (t.is_irb_related) html += '<span class="bud-irb-badge" style="margin-left:4px;">IRB</span>';
          if (t.receipt_url) html += '<a href="' + esc(t.receipt_url) + '" target="_blank" style="font-size:11.5px;color:#1a5aa8;margin-left:6px;">Receipt ↗</a>';
          html += '</div>';
          html += '<div style="text-align:right;color:#ef4444;font-weight:500;font-variant-numeric:tabular-nums;">' + fmt(t.amount) + '</div>';
          html += '<div style="text-align:right;white-space:nowrap;">';
          html += '<button class="bud-row-btn" onclick="Budget._openTxModal(\'' + t.id + '\')">Edit</button> ';
          html += '<button class="bud-row-btn danger" onclick="Budget._deleteTx(\'' + t.id + '\')">Del</button>';
          html += '</div></div>';
        });
      }
      html += '</div></div>';
    });

    // Uncategorized
    if (expByCat['__none'] && expByCat['__none'].length > 0) {
      const uncats = expByCat['__none'];
      const uncatTotal = uncats.reduce((s,t) => s+Number(t.amount||0), 0);
      html += '<div class="bud-line-item">';
      html += '<div onclick="Budget._toggleCat(\'__none\')" class="bud-line-header" style="border-top:1px solid #f1f3f4;">';
      html += '<div style="display:flex;align-items:center;gap:8px;"><span id="tog-__none" style="font-size:10px;color:#80868b;display:inline-block;transition:transform .15s;">▶</span>';
      html += '<div><div style="font-size:13.5px;font-weight:600;color:#80868b;">Uncategorized</div>';
      html += '<div style="font-size:11.5px;color:#b0b0b5;">' + uncats.length + ' transaction' + (uncats.length!==1?'s':'') + '</div></div></div>';
      html += '<div style="text-align:right;color:#b0b0b5;">—</div>';
      html += '<div style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:#80868b;">' + fmt(uncatTotal) + '</div>';
      html += '<div style="text-align:right;color:#b0b0b5;">—</div><div></div>';
      html += '</div>';
      html += '<div id="rows-__none" style="display:none;">';
      uncats.slice().sort((a,z)=>z.expense_date.localeCompare(a.expense_date)).forEach(function(t) {
        html += '<div style="display:grid;grid-template-columns:95px 1fr 100px 90px;gap:8px;padding:8px 20px 8px 44px;border-top:1px solid #f9f9f9;font-size:13px;align-items:center;">';
        html += '<div style="color:#80868b;">' + fmtDate(t.expense_date) + '</div>';
        html += '<div style="color:#0f2d6b;">' + esc(t.description) + (t.vendor?'<span style="color:#b0b0b5;font-size:11.5px;margin-left:6px;">'+esc(t.vendor)+'</span>':'') + '</div>';
        html += '<div style="text-align:right;color:#ef4444;font-weight:500;font-variant-numeric:tabular-nums;">' + fmt(t.amount) + '</div>';
        html += '<div style="text-align:right;white-space:nowrap;"><button class="bud-row-btn" onclick="Budget._openTxModal(\'' + t.id + '\')">Edit</button> <button class="bud-row-btn danger" onclick="Budget._deleteTx(\'' + t.id + '\')">Del</button></div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // Totals row
    html += '<div style="display:grid;grid-template-columns:1fr 120px 120px 120px 90px;gap:8px;padding:14px 20px;border-top:2px solid #f1f3f4;background:#f8f9fa;font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums;">';
    html += '<div style="color:#0f2d6b;">Total</div>';
    html += '<div style="text-align:right;color:#5f6368;">' + fmt(totalBudgeted) + '</div>';
    html += '<div style="text-align:right;color:' + (totalActual>totalBudgeted?'#b91c1c':'#0f2d6b') + ';">' + fmt(totalActual) + '</div>';
    html += '<div style="text-align:right;color:' + (totalBalance<0?'#b91c1c':'#1e8e3e') + ';">' + fmt(totalBalance) + '</div>';
    html += '<div></div></div></div>';

    // Credits section
    if (credits.length > 0) {
      html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;margin-top:20px;">';
      html += '<div style="padding:14px 20px;border-bottom:1px solid #f1f3f4;display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#1e8e3e;">Credits / Income</span>';
      html += '<span style="font-size:12.5px;color:#1e8e3e;font-weight:600;">' + fmt(totalCredits) + '</span></div>';
      credits.slice().sort((a,z)=>z.expense_date.localeCompare(a.expense_date)).forEach(function(t) {
        html += '<div style="display:grid;grid-template-columns:95px 1fr 110px 90px;gap:8px;padding:10px 20px;border-bottom:1px solid #f9f9f9;font-size:13px;align-items:center;">';
        html += '<div style="color:#80868b;">' + fmtDate(t.expense_date) + '</div>';
        html += '<div style="color:#0f2d6b;">' + esc(t.description) + (t.vendor?'<span style="color:#b0b0b5;font-size:11.5px;margin-left:6px;">'+esc(t.vendor)+'</span>':'') + '</div>';
        html += '<div style="text-align:right;color:#1e8e3e;font-weight:600;font-variant-numeric:tabular-nums;">' + fmt(t.amount) + '</div>';
        html += '<div style="text-align:right;white-space:nowrap;"><button class="bud-row-btn" onclick="Budget._openTxModal(\'' + t.id + '\')">Edit</button> <button class="bud-row-btn danger" onclick="Budget._deleteTx(\'' + t.id + '\')">Del</button></div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    html += '<div class="bud-overlay" id="budOverlay" style="display:none" onclick="if(event.target===this)Budget._closeModal()"></div>';
    html += '<div class="bud-modal" id="budModal" style="display:none"></div>';
    _container.innerHTML = html;
  }

  function statCard(label, value, sub, color, featured) {
    return '<div class="bud-stat-card' + (featured?' bud-stat-featured':'') + '">'
      + '<div class="bud-stat-label">' + label + '</div>'
      + '<div class="bud-stat-value"' + (color?' style="color:'+color+'"':'') + '>' + value + '</div>'
      + '<div class="bud-stat-sub">' + sub + '</div>'
      + '</div>';
  }

  function _toggleCat(id) {
    const rows = document.getElementById('rows-' + id);
    const tog  = document.getElementById('tog-' + id);
    if (!rows) return;
    const isOpen = rows.style.display !== 'none';
    rows.style.display = isOpen ? 'none' : '';
    if (tog) tog.style.transform = isOpen ? '' : 'rotate(90deg)';
  }

  // ── Budget modal ──────────────────────────────────────────────
  function _openBudgetModal(budgetId) {
    const b   = budgetId ? _budgets.find(x => x.id === budgetId) : null;
    const isNew = !b;
    let html = '<div class="bud-modal-header"><span>' + (isNew?'New Budget':'Edit Budget') + '</span>';
    html += '<button class="bud-modal-close" onclick="Budget._closeModal()">✕</button></div>';
    html += '<div class="bud-modal-body"><div class="bud-form-grid">';
    html += field('Budget Name *', '<input type="text" id="bf-name" class="bud-input" placeholder="e.g. NSF Dissertation Grant" value="' + esc(b?.name||'') + '">', true);
    html += field('Grant / Budget Code *', '<input type="text" id="bf-code" class="bud-input" placeholder="e.g. NSF-2301234" value="' + esc(b?.grant_code||'') + '">');
    html += field('Funding Agency', '<input type="text" id="bf-agency" class="bud-input" placeholder="e.g. National Science Foundation" value="' + esc(b?.funding_agency||'') + '">');
    html += field('Total Allocation ($)', '<input type="number" id="bf-total" class="bud-input" step="0.01" min="0" placeholder="0.00" value="' + (b?.total_budget||'') + '">');
    html += field('F&A / Indirect Rate (%)', '<input type="number" id="bf-rate" class="bud-input" step="0.01" min="0" max="100" placeholder="e.g. 52.5" value="' + (b?.indirect_rate||'') + '">');
    html += field('Start Date', '<input type="date" id="bf-start" class="bud-input" value="' + (b?.start_date||'') + '">');
    html += field('End Date', '<input type="date" id="bf-end" class="bud-input" value="' + (b?.end_date||'') + '">');
    html += '<div class="bud-field bud-field-wide"><label>Project</label><select id="bf-project" class="bud-input"><option value="">— Select project —</option></select></div>';
    html += '</div></div>';
    html += '<div class="bud-modal-footer"><button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>';
    html += '<button class="bud-btn-save" onclick="Budget._saveBudget(\'' + (budgetId||'') + '\')">' + (isNew?'Create Budget':'Save Changes') + '</button></div>';
    _showModal(html);
    // Populate project dropdown
    DB.getProjects().then(function(projects) {
      const sel = document.getElementById('bf-project');
      if (!sel) return;
      projects.forEach(function(p) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (b && b.project_id === p.id) opt.selected = true;
        sel.appendChild(opt);
      });
    });
    const nameEl = document.getElementById('bf-name');
    if (nameEl) nameEl.focus();
  }

  async function _saveBudget(budgetId) {
    const name   = document.getElementById('bf-name')?.value.trim();
    const code   = document.getElementById('bf-code')?.value.trim();
    const agency = document.getElementById('bf-agency')?.value.trim();
    const total  = document.getElementById('bf-total')?.value;
    const rate   = document.getElementById('bf-rate')?.value;
    const start  = document.getElementById('bf-start')?.value;
    const end    = document.getElementById('bf-end')?.value;
    const projId = document.getElementById('bf-project')?.value;
    if (!name) { alert('Budget name is required.'); return; }
    if (!code) { alert('Budget code is required.'); return; }
    if (!projId) { alert('Please select a project.'); return; }
    const payload = { project_id:projId, name, grant_code:code, funding_agency:agency,
      total_budget:total?parseFloat(total):0, indirect_rate:rate?parseFloat(rate):0,
      start_date:start||null, end_date:end||null };
    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Saving…'; }
    try {
      if (budgetId) {
        await DB.updateGrant(budgetId, payload);
        const idx = _budgets.findIndex(b => b.id === budgetId);
        if (idx >= 0) Object.assign(_budgets[idx], payload);
      } else {
        const g = await DB.createGrant(payload);
        _budgets.push({ ...g, budget_categories:[] });
      }
      _closeModal();
      toast('Budget saved.', 'success');
      _activeBudget = null;
      renderList();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled=false; btn.textContent=budgetId?'Save Changes':'Create Budget'; }
    }
  }

  // ── Category modal ────────────────────────────────────────────
  function _openCategoryModal(grantId) {
    const grant = _budgets.find(g => g.id === grantId);
    const cats = ['Personnel','Fringe Benefits','Equipment','Travel','Participant Support',
                  'Materials & Supplies','Consultants','Indirect/F&A','Other Direct Costs'];
    const periods = ['Year 1','Year 2','Year 3','Year 4','Year 5','No-cost Extension'];
    let html = '<div class="bud-modal-header"><span>Add Budget Line — ' + esc(grant?.grant_code||'') + '</span>';
    html += '<button class="bud-modal-close" onclick="Budget._closeModal()">✕</button></div>';
    html += '<div class="bud-modal-body"><div class="bud-form-grid">';
    html += field('Category *', '<select id="cf-name" class="bud-input" onchange="document.getElementById(\'cf-custom-wrap\').style.display=this.value===\'__custom\'?\'\':\'none\'">'
      + cats.map(c=>'<option>'+c+'</option>').join('') + '<option value="__custom">Custom…</option></select>');
    html += '<div class="bud-field" id="cf-custom-wrap" style="display:none">' + '<label>Custom Name</label><input type="text" id="cf-custom" class="bud-input" placeholder="Enter name"></div>';
    html += field('Budget Period', '<select id="cf-period" class="bud-input">' + periods.map(p=>'<option>'+p+'</option>').join('') + '</select>');
    html += field('Budgeted Amount ($)', '<input type="number" id="cf-budget" class="bud-input" step="0.01" min="0" placeholder="0.00">');
    html += '</div></div>';
    html += '<div class="bud-modal-footer"><button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>';
    html += '<button class="bud-btn-save" onclick="Budget._saveCategory(\'' + grantId + '\')">Add Line</button></div>';
    _showModal(html);
  }

  async function _saveCategory(grantId) {
    const nameEl = document.getElementById('cf-name');
    const name   = nameEl?.value === '__custom' ? document.getElementById('cf-custom')?.value.trim() : nameEl?.value;
    const period = document.getElementById('cf-period')?.value;
    const budgeted = document.getElementById('cf-budget')?.value;
    if (!name) { alert('Category name is required.'); return; }
    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Adding…'; }
    try {
      const { data, error } = await DB.client.from('budget_categories')
        .insert({ grant_id:grantId, name, period, budgeted:parseFloat(budgeted)||0 })
        .select().single();
      if (error) throw error;
      const grant = _budgets.find(g => g.id === grantId);
      if (grant) { grant.budget_categories = grant.budget_categories||[]; grant.budget_categories.push(data); }
      if (_activeBudget?.id === grantId) _activeBudget = grant;
      _closeModal();
      toast('Budget line added.', 'success');
      renderDetail();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled=false; btn.textContent='Add Line'; }
    }
  }

  // ── Transaction modal ─────────────────────────────────────────
  function _openTxModal(txId, preCatId) {
    const tx    = txId ? _transactions.find(t => t.id === txId) : null;
    const isNew = !tx;
    const type  = tx?.transaction_type || 'expense';
    const cats  = _activeBudget?.budget_categories || [];

    let html = '<div class="bud-modal-header"><span>' + (isNew?'Add Transaction':'Edit Transaction') + '</span>';
    html += '<button class="bud-modal-close" onclick="Budget._closeModal()">✕</button></div>';
    html += '<div class="bud-modal-body"><div class="bud-form-grid">';
    html += '<div class="bud-field bud-field-wide"><label>Type</label><div class="bud-type-toggle">';
    html += '<button id="tt-expense" class="bud-type-btn' + (type!=='income'?' active':'') + '" onclick="Budget._setTxType(\'expense\')">↑ Debit / Expense</button>';
    html += '<button id="tt-income" class="bud-type-btn' + (type==='income'?' active':'') + '" onclick="Budget._setTxType(\'income\')">↓ Credit / Income</button>';
    html += '</div></div>';
    html += field('Description *', '<input type="text" id="tf-desc" class="bud-input" placeholder="e.g. Participant incentive" value="' + esc(tx?.description||'') + '">', true);
    html += field('Date *', '<input type="date" id="tf-date" class="bud-input" value="' + (tx?.expense_date||today()) + '">');
    html += field('Amount ($) *', '<input type="number" id="tf-amount" class="bud-input" step="0.01" min="0" placeholder="0.00" value="' + (tx?.amount||'') + '">');
    html += field('Vendor / Source', '<input type="text" id="tf-vendor" class="bud-input" placeholder="e.g. Amazon" value="' + esc(tx?.vendor||'') + '">');
    html += field('Budget Line Item', '<select id="tf-cat" class="bud-input"><option value="">— Uncategorized —</option>'
      + cats.map(c => '<option value="'+c.id+'"'+(((tx?.category_id===c.id)||(preCatId===c.id&&!tx))?' selected':'')+'>'+esc(c.name)+' ('+esc(c.period||'')+')</option>').join('')
      + '</select>');
    html += field('Receipt URL', '<input type="url" id="tf-receipt" class="bud-input" placeholder="https://…" value="' + esc(tx?.receipt_url||'') + '">');
    html += '<div class="bud-field bud-field-wide"><label>Notes</label><textarea id="tf-notes" class="bud-input" rows="2">' + esc(tx?.notes||'') + '</textarea></div>';
    html += '<div class="bud-field bud-field-wide"><label class="bud-check"><input type="checkbox" id="tf-irb"' + (tx?.is_irb_related?' checked':'') + '> <span>IRB-related</span></label></div>';
    html += '</div></div>';
    html += '<div class="bud-modal-footer"><button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>';
    html += '<button class="bud-btn-save" onclick="Budget._saveTx(\'' + (txId||'') + '\')">' + (isNew?'Add Transaction':'Save Changes') + '</button></div>';
    _showModal(html);
    document.getElementById('tf-desc')?.focus();
  }

  function _setTxType(type) {
    document.getElementById('tt-expense')?.classList.toggle('active', type==='expense');
    document.getElementById('tt-income')?.classList.toggle('active', type==='income');
  }

  async function _saveTx(txId) {
    const desc    = document.getElementById('tf-desc')?.value.trim();
    const date    = document.getElementById('tf-date')?.value;
    const amount  = document.getElementById('tf-amount')?.value;
    const vendor  = document.getElementById('tf-vendor')?.value.trim();
    const catId   = document.getElementById('tf-cat')?.value || null;
    const receipt = document.getElementById('tf-receipt')?.value.trim();
    const notes   = document.getElementById('tf-notes')?.value.trim();
    const isIrb   = document.getElementById('tf-irb')?.checked;
    const type    = document.getElementById('tt-income')?.classList.contains('active') ? 'income' : 'expense';
    if (!desc)   { alert('Description is required.'); return; }
    if (!date)   { alert('Date is required.'); return; }
    if (!amount) { alert('Amount is required.'); return; }
    const payload = {
      project_id: _activeBudget.project_id, grant_id: _activeBudget.id,
      description:desc, vendor:vendor, amount:parseFloat(amount),
      expense_date:date, category_id:catId, receipt_url:receipt,
      notes:notes, is_irb_related:isIrb, transaction_type:type
    };
    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Saving…'; }

    const doSave = async (p) => {
      if (txId) {
        await DB.updateExpense(txId, p);
        const idx = _transactions.findIndex(t => t.id === txId);
        if (idx >= 0) _transactions[idx] = { ..._transactions[idx], ...p };
      } else {
        const t = await DB.createExpense(p);
        _transactions.push(t);
      }
    };

    try {
      await doSave(payload);
      _closeModal();
      toast(txId ? 'Updated.' : 'Added.', 'success');
      renderDetail();
    } catch(e) {
      if (e.message && e.message.includes('transaction_type')) {
        try {
          const { transaction_type, ...p2 } = payload;
          await doSave(p2);
          _closeModal();
          toast(txId ? 'Updated.' : 'Added.', 'success');
          renderDetail();
        } catch(e2) { alert('Save failed: ' + e2.message); if (btn) { btn.disabled=false; btn.textContent=txId?'Save Changes':'Add Transaction'; } }
      } else {
        alert('Save failed: ' + e.message);
        if (btn) { btn.disabled=false; btn.textContent=txId?'Save Changes':'Add Transaction'; }
      }
    }
  }

  async function _deleteTx(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await DB.deleteExpense(id);
      _transactions = _transactions.filter(t => t.id !== id);
      toast('Deleted.', '');
      renderDetail();
    } catch(e) { alert(e.message); }
  }

  async function _openBudget(id) {
    _activeBudget = _budgets.find(b => b.id === id);
    if (!_activeBudget) return;
    _container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';
    try {
      const all = await DB.getExpenses(_activeBudget.project_id);
      _transactions = all.filter(t => t.grant_id === _activeBudget.id);
      renderDetail();
    } catch(e) { _container.innerHTML = '<div style="padding:40px;color:#b91c1c;">' + esc(e.message) + '</div>'; }
  }

  function _backToList() { _activeBudget = null; _transactions = []; renderList(); }

  // ── Helpers ───────────────────────────────────────────────────
  function field(label, input, wide) {
    return '<div class="bud-field' + (wide?' bud-field-wide':'') + '"><label>' + label + '</label>' + input + '</div>';
  }

  function _showModal(html) {
    const o = document.getElementById('budOverlay'), m = document.getElementById('budModal');
    if (!o||!m) return;
    m.innerHTML = html; m.style.display=''; o.style.display='';
  }

  function _closeModal() {
    const o = document.getElementById('budOverlay'), m = document.getElementById('budModal');
    if (o) o.style.display='none'; if (m) m.style.display='none';
  }

  function injectStyles() {
    if (document.getElementById('bud-styles')) return;
    const s = document.createElement('style');
    s.id = 'bud-styles';
    s.textContent = `
      .bud-page { max-width:960px; margin:0 auto; padding:28px 24px; }
      .bud-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
      .bud-title { font-size:22px; font-weight:700; color:#0f2d6b; letter-spacing:-.3px; margin-bottom:2px; }
      .bud-subtitle { font-size:13px; color:#80868b; }
      .bud-back { background:none; border:none; cursor:pointer; font-size:13px; color:#1a5aa8; font-family:inherit; padding:0; }
      .bud-back:hover { text-decoration:underline; }
      .bud-btn-primary { padding:9px 20px; border-radius:999px; border:none; background:#0f3460; color:#fff; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit; transition:background .15s; }
      .bud-btn-primary:hover { background:#16407a; }
      .bud-btn-outline { padding:8px 16px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; color:#0f2d6b; cursor:pointer; font-size:13px; font-family:inherit; transition:all .12s; }
      .bud-btn-outline:hover { border-color:#1a5aa8; color:#1a5aa8; }
      .bud-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
      .bud-card { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:14px; padding:20px; cursor:pointer; transition:box-shadow .15s,transform .12s; }
      .bud-card:hover { box-shadow:0 4px 20px rgba(15,45,107,.12); transform:translateY(-2px); }
      .bud-card-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:10px; }
      .bud-card-name { font-size:14.5px; font-weight:700; color:#0f2d6b; margin-bottom:5px; }
      .bud-card-meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .bud-card-stats { display:flex; gap:16px; margin-top:10px; }
      .bud-card-stats div { font-size:12px; display:flex; flex-direction:column; gap:2px; }
      .bud-progress-bar { height:6px; background:#f1f3f4; border-radius:999px; overflow:hidden; }
      .bud-progress-bar div { height:100%; border-radius:999px; transition:width .4s; }
      .bud-summary-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; }
      .bud-stat-card { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:12px; padding:18px 20px; }
      .bud-stat-featured { border-color:#0f3460; }
      .bud-stat-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#80868b; margin-bottom:6px; }
      .bud-stat-value { font-size:22px; font-weight:700; color:#0f2d6b; margin-bottom:2px; }
      .bud-stat-sub { font-size:12px; color:#80868b; }
      .bud-tag { display:inline-block; font-size:11.5px; padding:2px 9px; border-radius:999px; background:#e8f0fe; color:#1a5aa8; font-weight:600; }
      .bud-irb-badge { font-size:11px; padding:2px 8px; border-radius:999px; background:#fef3c7; color:#92400e; font-weight:600; }
      .bud-empty { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:14px; padding:60px; text-align:center; }
      .bud-line-item { border-bottom:1px solid #f1f3f4; }
      .bud-line-item:last-child { border-bottom:none; }
      .bud-line-header { display:grid; grid-template-columns:1fr 120px 120px 120px 90px; gap:8px; padding:13px 20px; cursor:pointer; align-items:center; transition:background .1s; }
      .bud-line-header:hover { background:#f8f9ff; }
      .bud-row-btn { padding:3px 10px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; cursor:pointer; font-size:11.5px; font-family:inherit; color:#0f2d6b; }
      .bud-row-btn:hover { border-color:#1a5aa8; color:#1a5aa8; }
      .bud-row-btn.danger { color:#b91c1c; border-color:rgba(185,28,28,.25); }
      .bud-row-btn.danger:hover { background:#fef2f2; }
      .bud-overlay { position:fixed; inset:0; background:rgba(15,45,107,.18); z-index:1000; backdrop-filter:blur(2px); }
      .bud-modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:520px; max-width:calc(100vw - 32px); max-height:90vh; overflow:hidden; background:#fff; border-radius:16px; box-shadow:0 8px 48px rgba(15,45,107,.18); z-index:1001; display:flex; flex-direction:column; }
      .bud-modal-header { padding:18px 22px 16px; font-size:16px; font-weight:700; color:#0f2d6b; border-bottom:1px solid #f1f3f4; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
      .bud-modal-close { background:none; border:none; cursor:pointer; font-size:17px; color:#80868b; padding:4px; border-radius:6px; }
      .bud-modal-close:hover { background:#f1f3f4; }
      .bud-modal-body { padding:20px 22px; overflow-y:auto; flex:1; }
      .bud-modal-footer { padding:14px 22px; border-top:1px solid #f1f3f4; display:flex; justify-content:flex-end; gap:10px; flex-shrink:0; }
      .bud-btn-cancel { padding:9px 22px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; cursor:pointer; font-size:13.5px; font-family:inherit; color:#0f2d6b; }
      .bud-btn-save { padding:9px 22px; border-radius:999px; border:none; background:#0f3460; color:#fff; cursor:pointer; font-size:13.5px; font-weight:600; font-family:inherit; }
      .bud-btn-save:hover { background:#16407a; }
      .bud-btn-save:disabled { opacity:.55; cursor:not-allowed; }
      .bud-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .bud-field { display:flex; flex-direction:column; gap:5px; }
      .bud-field-wide { grid-column:1/-1; }
      .bud-field label { font-size:12.5px; font-weight:500; color:#5f6368; }
      .bud-input { padding:9px 12px; border-radius:8px; border:1.5px solid #dadce0; font-size:13.5px; font-family:inherit; color:#0f2d6b; background:#fff; outline:none; width:100%; box-sizing:border-box; }
      .bud-input:focus { border-color:#1a5aa8; box-shadow:0 0 0 3px rgba(26,90,168,.1); }
      textarea.bud-input { resize:vertical; min-height:60px; }
      .bud-check { display:flex; align-items:center; gap:7px; cursor:pointer; font-size:13px; color:#0f2d6b; }
      .bud-type-toggle { display:flex; gap:8px; }
      .bud-type-btn { flex:1; padding:10px; border-radius:10px; border:2px solid #dadce0; background:#fff; cursor:pointer; font-size:13px; font-weight:500; font-family:inherit; color:#5f6368; transition:all .15s; }
      .bud-type-btn.active#tt-expense { border-color:#ef4444; background:#fef2f2; color:#b91c1c; }
      .bud-type-btn.active#tt-income  { border-color:#1e8e3e; background:#e6f4ea; color:#1e8e3e; }
      .main-content { min-height:calc(100vh - 56px); overflow-y:auto; }
      @media(max-width:600px) { .bud-form-grid { grid-template-columns:1fr; } .bud-field-wide { grid-column:1; } .bud-summary-row { grid-template-columns:1fr 1fr; } }
    `;
    document.head.appendChild(s);
  }

  return {
    render,
    _openBudget, _backToList,
    _openBudgetModal, _saveBudget,
    _openCategoryModal, _saveCategory,
    _openTxModal, _setTxType, _saveTx, _deleteTx,
    _toggleCat, _closeModal,
  };
})();
