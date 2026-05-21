// ── Research Budget Module ─────────────────────────────────────
const Budget = (() => {

  let _budgets    = [];   // grants = budgets
  let _activeBudget = null;
  let _transactions = []; // expenses table, all types
  let _container  = null;

  const fmt  = n => '$' + Math.abs(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;font-size:13.5px;">Loading…</div>';
    try {
      const projects = await DB.getProjects();
      _budgets = [];
      for (const p of projects) {
        const grants = await DB.getGrants(p.id);
        _budgets.push(...grants.map(g => ({ ...g, _projectName: p.name, _projectColor: p.color })));
      }
      if (_activeBudget && !_budgets.find(b => b.id === _activeBudget.id)) _activeBudget = null;
      if (_activeBudget) {
        _transactions = await DB.getExpenses(_activeBudget.project_id);
        _transactions = _transactions.filter(t => t.grant_id === _activeBudget.id);
        renderDetail();
      } else {
        renderList();
      }
    } catch(e) {
      container.innerHTML = `<div style="padding:40px;color:#b91c1c;">${esc(e.message)}</div>`;
    }
  }

  // ── Budget list ───────────────────────────────────────────────
  function renderList() {
    const html = `
      <div class="bud-page">
        <div class="bud-header">
          <div>
            <h1 class="bud-title">Research Budget</h1>
            <p class="bud-subtitle">${_budgets.length} budget${_budgets.length!==1?'s':''} across all projects</p>
          </div>
          <button class="bud-btn-primary" onclick="Budget._openBudgetModal()">+ New Budget</button>
        </div>

        ${_budgets.length === 0 ? `
          <div class="bud-empty">
            <div style="font-size:32px;margin-bottom:12px;">💰</div>
            <div style="font-size:15px;font-weight:600;color:#0f2d6b;margin-bottom:6px;">No budgets yet</div>
            <div style="font-size:13.5px;color:#80868b;margin-bottom:18px;">Create a budget to start tracking your research finances.</div>
            <button class="bud-btn-primary" onclick="Budget._openBudgetModal()">Create your first budget</button>
          </div>` : `
          <div class="bud-grid">
            ${_budgets.map(b => budgetCard(b)).join('')}
          </div>`}
      </div>
      <div class="bud-overlay" id="budOverlay" style="display:none" onclick="if(event.target===this)Budget._closeModal()"></div>
      <div class="bud-modal" id="budModal" style="display:none"></div>
    `;
    _container.innerHTML = html;
  }

  function budgetCard(b) {
    const income  = _transactions.filter(t => t.grant_id === b.id && t.transaction_type === 'income').reduce((s,t) => s+Number(t.amount||0), 0);
    const expense = _transactions.filter(t => t.grant_id === b.id && t.transaction_type !== 'income').reduce((s,t) => s+Number(t.amount||0), 0);
    const alloc   = Number(b.total_budget||0);
    const balance = alloc - expense;
    const pctUsed = alloc > 0 ? Math.min(100, (expense/alloc)*100) : 0;

    return `
      <div class="bud-card" onclick="Budget._openBudget('${b.id}')">
        <div class="bud-card-top">
          <div>
            <div class="bud-card-name">${esc(b.name)}</div>
            <div class="bud-card-meta">
              <span class="bud-tag">${esc(b.grant_code)}</span>
              ${b.funding_agency ? `<span style="color:#80868b;font-size:12px;">${esc(b.funding_agency)}</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#80868b;text-transform:uppercase;letter-spacing:.05em;">Balance</div>
            <div style="font-size:20px;font-weight:700;color:${balance<0?'#b91c1c':'#1e8e3e'};">${fmt(balance)}</div>
          </div>
        </div>
        <div class="bud-progress-bar">
          <div style="width:${pctUsed}%;background:${pctUsed>90?'#ef4444':pctUsed>75?'#f59e0b':'#1a5aa8'};"></div>
        </div>
        <div class="bud-card-stats">
          <div><span style="color:#80868b;">Allocated</span><strong>${fmt(alloc)}</strong></div>
          <div><span style="color:#80868b;">Spent</span><strong style="color:#ef4444;">${fmt(expense)}</strong></div>
          <div><span style="color:#80868b;">Income</span><strong style="color:#1e8e3e;">${fmt(income)}</strong></div>
        </div>
      </div>`;
  }

  // ── Budget detail (ledger) ────────────────────────────────────
  function renderDetail() {
    const b       = _activeBudget;
    const income  = _transactions.filter(t => t.transaction_type === 'income').reduce((s,t) => s+Number(t.amount||0), 0);
    const expense = _transactions.filter(t => t.transaction_type !== 'income').reduce((s,t) => s+Number(t.amount||0), 0);
    const alloc   = Number(b.total_budget||0);
    const balance = alloc - expense + income;
    const pctUsed = alloc > 0 ? Math.min(100, (expense/alloc)*100) : 0;

    // Sort by date
    const sorted = [..._transactions].sort((a,z) => a.expense_date.localeCompare(z.expense_date));

    // Running balance
    let running = alloc;
    const rows = sorted.map(t => {
      const isIncome = t.transaction_type === 'income';
      if (isIncome) running += Number(t.amount||0);
      else running -= Number(t.amount||0);
      return { ...t, _running: running };
    }).reverse(); // show newest first

    _container.innerHTML = `
      <div class="bud-page">

        <!-- Back + header -->
        <div class="bud-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="bud-back" onclick="Budget._backToList()">← All Budgets</button>
            <div>
              <h1 class="bud-title">${esc(b.name)}</h1>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:3px;">
                <span class="bud-tag">${esc(b.grant_code)}</span>
                ${b.funding_agency ? `<span style="font-size:12.5px;color:#80868b;">${esc(b.funding_agency)}</span>` : ''}
                ${b._projectName ? `<span style="font-size:12.5px;color:#80868b;">· ${esc(b._projectName)}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="bud-btn-outline" onclick="Budget._openBudgetModal('${b.id}')">Edit Budget</button>
            <button class="bud-btn-primary" onclick="Budget._openTxModal()">+ Add Transaction</button>
          </div>
        </div>

        <!-- Summary cards -->
        <div class="bud-summary-row">
          <div class="bud-stat-card">
            <div class="bud-stat-label">Allocated</div>
            <div class="bud-stat-value">${fmt(alloc)}</div>
            <div class="bud-stat-sub">Total budget</div>
          </div>
          <div class="bud-stat-card">
            <div class="bud-stat-label">Total Spent</div>
            <div class="bud-stat-value" style="color:#ef4444;">${fmt(expense)}</div>
            <div class="bud-stat-sub">${pctUsed.toFixed(1)}% of budget</div>
          </div>
          <div class="bud-stat-card">
            <div class="bud-stat-label">Income Received</div>
            <div class="bud-stat-value" style="color:#1e8e3e;">${fmt(income)}</div>
            <div class="bud-stat-sub">${_transactions.filter(t=>t.transaction_type==='income').length} payment${_transactions.filter(t=>t.transaction_type==='income').length!==1?'s':''}</div>
          </div>
          <div class="bud-stat-card bud-stat-featured">
            <div class="bud-stat-label">Balance</div>
            <div class="bud-stat-value" style="color:${balance<0?'#b91c1c':'#0f2d6b'};">${fmt(balance)}</div>
            <div class="bud-stat-sub">${balance<0?'Over budget':'Remaining'}</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:18px 22px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:600;color:#0f2d6b;">Budget Utilization</span>
            <span style="font-size:13px;color:#5f6368;">${fmt(expense)} spent of ${fmt(alloc)}</span>
          </div>
          <div class="bud-progress-bar" style="height:12px;">
            <div style="width:${pctUsed}%;background:${pctUsed>90?'#ef4444':pctUsed>75?'#f59e0b':'#1a5aa8'};"></div>
          </div>
        </div>

        <!-- Transaction ledger -->
        <div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #f1f3f4;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;">Transactions</span>
            <span style="font-size:12.5px;color:#80868b;">${_transactions.length} record${_transactions.length!==1?'s':''}</span>
          </div>

          ${rows.length === 0 ? `
            <div style="padding:48px;text-align:center;color:#80868b;font-size:13.5px;">
              No transactions yet.
              <div style="margin-top:10px;"><button onclick="Budget._openTxModal()" style="color:#1a5aa8;background:none;border:none;cursor:pointer;font-size:13.5px;">Add your first transaction →</button></div>
            </div>` : `
          <table class="bud-ledger">
            <thead><tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th style="text-align:right">Debit</th>
              <th style="text-align:right">Credit</th>
              <th style="text-align:right">Balance</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${rows.map(t => {
                const isInc = t.transaction_type === 'income';
                return `<tr>
                  <td style="white-space:nowrap;color:#80868b;">${fmtDate(t.expense_date)}</td>
                  <td>
                    <div style="font-weight:500;color:#0f2d6b;">${esc(t.description)}</div>
                    ${t.vendor ? `<div style="font-size:11.5px;color:#80868b;">${esc(t.vendor)}</div>` : ''}
                    ${t.is_irb_related ? '<span class="bud-irb-badge">IRB</span>' : ''}
                    ${t.receipt_url ? `<a href="${esc(t.receipt_url)}" target="_blank" style="font-size:11.5px;color:#1a5aa8;margin-left:4px;">Receipt ↗</a>` : ''}
                  </td>
                  <td style="color:#5f6368;">${esc(t.budget_period||'')}</td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;color:#ef4444;font-weight:500;">
                    ${!isInc ? fmt(t.amount) : ''}
                  </td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;color:#1e8e3e;font-weight:500;">
                    ${isInc ? fmt(t.amount) : ''}
                  </td>
                  <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${t._running<0?'#b91c1c':'#0f2d6b'};">
                    ${fmt(t._running)}
                  </td>
                  <td style="text-align:right;white-space:nowrap;">
                    <button class="bud-row-btn" onclick="Budget._openTxModal('${t.id}')">Edit</button>
                    <button class="bud-row-btn danger" onclick="Budget._deleteTx('${t.id}')">Del</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>

      <div class="bud-overlay" id="budOverlay" style="display:none" onclick="if(event.target===this)Budget._closeModal()"></div>
      <div class="bud-modal" id="budModal" style="display:none"></div>
    `;
  }

  // ── Budget modal (create/edit budget) ─────────────────────────
  function _openBudgetModal(budgetId) {
    const b     = budgetId ? _budgets.find(x => x.id === budgetId) : null;
    const isNew = !b;

    _showModal(`
      <div class="bud-modal-header">
        <span>${isNew ? 'New Budget' : 'Edit Budget'}</span>
        <button class="bud-modal-close" onclick="Budget._closeModal()">✕</button>
      </div>
      <div class="bud-modal-body">
        <div class="bud-form-grid">
          <div class="bud-field bud-field-wide">
            <label>Budget Name *</label>
            <input type="text" id="bf-name" class="bud-input" placeholder="e.g. NSF Dissertation Grant" value="${esc(b?.name||'')}">
          </div>
          <div class="bud-field">
            <label>Budget Code *</label>
            <input type="text" id="bf-code" class="bud-input" placeholder="e.g. NSF-2301234" value="${esc(b?.grant_code||'')}">
          </div>
          <div class="bud-field">
            <label>Funding Agency</label>
            <input type="text" id="bf-agency" class="bud-input" placeholder="e.g. National Science Foundation" value="${esc(b?.funding_agency||'')}">
          </div>
          <div class="bud-field">
            <label>Total Allocation ($)</label>
            <input type="number" id="bf-total" class="bud-input" step="0.01" min="0" placeholder="0.00" value="${b?.total_budget||''}">
          </div>
          <div class="bud-field">
            <label>F&A / Indirect Rate (%)</label>
            <input type="number" id="bf-rate" class="bud-input" step="0.01" min="0" max="100" placeholder="e.g. 52.5" value="${b?.indirect_rate||''}">
          </div>
          <div class="bud-field">
            <label>Start Date</label>
            <input type="date" id="bf-start" class="bud-input" value="${b?.start_date||''}">
          </div>
          <div class="bud-field">
            <label>End Date</label>
            <input type="date" id="bf-end" class="bud-input" value="${b?.end_date||''}">
          </div>
          <div class="bud-field bud-field-wide">
            <label>Project</label>
            <select id="bf-project" class="bud-input">
              <option value="">— No project —</option>
              ${/* populated async */'' }
            </select>
          </div>
        </div>
      </div>
      <div class="bud-modal-footer">
        <button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>
        <button class="bud-btn-save" onclick="Budget._saveBudget('${budgetId||''}')">
          ${isNew ? 'Create Budget' : 'Save Changes'}
        </button>
      </div>
    `);

    // Populate project dropdown
    DB.getProjects().then(projects => {
      const sel = document.getElementById('bf-project');
      if (!sel) return;
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (b?.project_id === p.id) opt.selected = true;
        sel.appendChild(opt);
      });
    });

    document.getElementById('bf-name').focus();
  }

  async function _saveBudget(budgetId) {
    const name    = document.getElementById('bf-name')?.value.trim();
    const code    = document.getElementById('bf-code')?.value.trim();
    const agency  = document.getElementById('bf-agency')?.value.trim();
    const total   = document.getElementById('bf-total')?.value;
    const rate    = document.getElementById('bf-rate')?.value;
    const start   = document.getElementById('bf-start')?.value;
    const end     = document.getElementById('bf-end')?.value;
    const projId  = document.getElementById('bf-project')?.value;

    if (!name) { alert('Budget name is required.'); return; }
    if (!code) { alert('Budget code is required.'); return; }
    if (!projId) { alert('Please select a project.'); return; }

    const payload = {
      project_id:    projId,
      name,
      grant_code:    code,
      funding_agency: agency,
      total_budget:  total ? parseFloat(total) : 0,
      indirect_rate: rate  ? parseFloat(rate)  : 0,
      start_date:    start || null,
      end_date:      end   || null,
    };

    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (budgetId) {
        await DB.updateGrant(budgetId, payload);
        const idx = _budgets.findIndex(b => b.id === budgetId);
        if (idx >= 0) _budgets[idx] = { ..._budgets[idx], ...payload };
      } else {
        const newB = await DB.createGrant(payload);
        _budgets.push(newB);
      }
      _closeModal();
      toast(budgetId ? 'Budget updated.' : 'Budget created.', 'success');
      if (_activeBudget?.id === budgetId) _activeBudget = _budgets.find(b => b.id === budgetId);
      _activeBudget ? renderDetail() : renderList();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = budgetId ? 'Save Changes' : 'Create Budget'; }
    }
  }

  // ── Transaction modal ─────────────────────────────────────────
  function _openTxModal(txId) {
    const tx    = txId ? _transactions.find(t => t.id === txId) : null;
    const isNew = !tx;
    const categories = ['Personnel','Fringe Benefits','Equipment','Travel','Participant Support','Materials & Supplies','Consultants','Indirect/F&A','Other Direct Costs'];

    _showModal(`
      <div class="bud-modal-header">
        <span>${isNew ? 'Add Transaction' : 'Edit Transaction'}</span>
        <button class="bud-modal-close" onclick="Budget._closeModal()">✕</button>
      </div>
      <div class="bud-modal-body">
        <div class="bud-form-grid">

          <!-- Type toggle -->
          <div class="bud-field bud-field-wide">
            <label>Transaction Type</label>
            <div class="bud-type-toggle">
              <button id="tt-expense" class="bud-type-btn ${!tx||tx.transaction_type!=='income'?'active':''}" onclick="Budget._setTxType('expense')">
                ↑ Debit / Expense
              </button>
              <button id="tt-income" class="bud-type-btn ${tx?.transaction_type==='income'?'active':''}" onclick="Budget._setTxType('income')">
                ↓ Credit / Income
              </button>
            </div>
          </div>

          <div class="bud-field bud-field-wide">
            <label>Description *</label>
            <input type="text" id="tf-desc" class="bud-input" placeholder="e.g. Participant incentive payment" value="${esc(tx?.description||'')}">
          </div>
          <div class="bud-field">
            <label>Date *</label>
            <input type="date" id="tf-date" class="bud-input" value="${tx?.expense_date||today()}">
          </div>
          <div class="bud-field">
            <label>Amount ($) *</label>
            <input type="number" id="tf-amount" class="bud-input" step="0.01" min="0" placeholder="0.00" value="${tx?.amount||''}">
          </div>
          <div class="bud-field">
            <label>Vendor / Source</label>
            <input type="text" id="tf-vendor" class="bud-input" placeholder="e.g. Amazon, NSF Award" value="${esc(tx?.vendor||'')}">
          </div>
          <div class="bud-field">
            <label>Category</label>
            <select id="tf-cat" class="bud-input">
              <option value="">— Select —</option>
              ${categories.map(c => `<option value="${c}" ${tx?.budget_period===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="bud-field">
            <label>Receipt / Reference URL</label>
            <input type="url" id="tf-receipt" class="bud-input" placeholder="https://…" value="${esc(tx?.receipt_url||'')}">
          </div>
          <div class="bud-field bud-field-wide">
            <label>Notes</label>
            <textarea id="tf-notes" class="bud-input" rows="2" placeholder="Optional notes">${esc(tx?.notes||'')}</textarea>
          </div>
          <div class="bud-field bud-field-wide" style="display:flex;gap:20px;">
            <label class="bud-check">
              <input type="checkbox" id="tf-irb" ${tx?.is_irb_related?'checked':''}>
              <span>IRB-related</span>
            </label>
          </div>
        </div>
      </div>
      <div class="bud-modal-footer">
        <button class="bud-btn-cancel" onclick="Budget._closeModal()">Cancel</button>
        <button class="bud-btn-save" onclick="Budget._saveTx('${txId||''}')">
          ${isNew ? 'Add Transaction' : 'Save Changes'}
        </button>
      </div>
    `);
    document.getElementById('tf-desc').focus();
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
    const cat     = document.getElementById('tf-cat')?.value;
    const receipt = document.getElementById('tf-receipt')?.value.trim();
    const notes   = document.getElementById('tf-notes')?.value.trim();
    const isIrb   = document.getElementById('tf-irb')?.checked;
    const type    = document.getElementById('tt-income')?.classList.contains('active') ? 'income' : 'expense';

    if (!desc)   { alert('Description is required.'); return; }
    if (!date)   { alert('Date is required.'); return; }
    if (!amount) { alert('Amount is required.'); return; }

    const payload = {
      project_id:       _activeBudget.project_id,
      grant_id:         _activeBudget.id,
      description:      desc,
      vendor:           vendor,
      amount:           parseFloat(amount),
      expense_date:     date,
      budget_period:    cat,
      receipt_url:      receipt,
      notes:            notes,
      is_irb_related:   isIrb,
      transaction_type: type,
    };

    const btn = document.querySelector('.bud-btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (txId) {
        await DB.updateExpense(txId, payload);
        const idx = _transactions.findIndex(t => t.id === txId);
        if (idx >= 0) _transactions[idx] = { ..._transactions[idx], ...payload };
      } else {
        const newTx = await DB.createExpense(payload);
        _transactions.push(newTx);
      }
      _closeModal();
      toast(txId ? 'Transaction updated.' : 'Transaction added.', 'success');
      renderDetail();
    } catch(e) {
      alert('Save failed: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = txId ? 'Save Changes' : 'Add Transaction'; }
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

  // ── Navigation ────────────────────────────────────────────────
  async function _openBudget(id) {
    _activeBudget = _budgets.find(b => b.id === id);
    if (!_activeBudget) return;
    _container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';
    try {
      const all = await DB.getExpenses(_activeBudget.project_id);
      _transactions = all.filter(t => t.grant_id === _activeBudget.id);
      renderDetail();
    } catch(e) {
      _container.innerHTML = `<div style="padding:40px;color:#b91c1c;">${esc(e.message)}</div>`;
    }
  }

  function _backToList() {
    _activeBudget = null;
    _transactions = [];
    renderList();
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _showModal(html) {
    const overlay = document.getElementById('budOverlay');
    const modal   = document.getElementById('budModal');
    if (!overlay || !modal) return;
    modal.innerHTML = html;
    modal.style.display = '';
    overlay.style.display = '';
  }

  function _closeModal() {
    const overlay = document.getElementById('budOverlay');
    const modal   = document.getElementById('budModal');
    if (overlay) overlay.style.display = 'none';
    if (modal)   modal.style.display   = 'none';
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

      .bud-btn-primary { padding:9px 22px; border-radius:999px; border:none; background:#0f3460; color:#fff; cursor:pointer; font-size:13.5px; font-weight:600; font-family:inherit; transition:background .15s,transform .12s; }
      .bud-btn-primary:hover { background:#16407a; transform:translateY(-1px); }
      .bud-btn-outline { padding:8px 18px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; color:#0f2d6b; cursor:pointer; font-size:13px; font-family:inherit; transition:all .12s; }
      .bud-btn-outline:hover { border-color:#1a5aa8; color:#1a5aa8; }
      .bud-back { background:none; border:none; cursor:pointer; font-size:13px; color:#1a5aa8; font-family:inherit; padding:0; }
      .bud-back:hover { text-decoration:underline; }

      .bud-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
      .bud-card { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:14px; padding:20px; cursor:pointer; transition:box-shadow .15s,transform .12s; }
      .bud-card:hover { box-shadow:0 4px 20px rgba(15,45,107,.12); transform:translateY(-2px); }
      .bud-card-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:10px; }
      .bud-card-name { font-size:14.5px; font-weight:700; color:#0f2d6b; margin-bottom:5px; }
      .bud-card-meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .bud-card-stats { display:flex; gap:16px; margin-top:10px; }
      .bud-card-stats div { font-size:12px; display:flex; flex-direction:column; gap:2px; }
      .bud-card-stats span { color:#80868b; }
      .bud-card-stats strong { color:#0f2d6b; font-size:13px; }

      .bud-progress-bar { height:6px; background:#f1f3f4; border-radius:999px; overflow:hidden; }
      .bud-progress-bar div { height:100%; border-radius:999px; transition:width .4s; }

      .bud-summary-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; margin-bottom:20px; }
      .bud-stat-card { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:12px; padding:18px 20px; }
      .bud-stat-featured { border-color:#0f3460; }
      .bud-stat-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#80868b; margin-bottom:6px; }
      .bud-stat-value { font-size:22px; font-weight:700; color:#0f2d6b; margin-bottom:2px; }
      .bud-stat-sub { font-size:12px; color:#80868b; }

      .bud-ledger { width:100%; border-collapse:collapse; }
      .bud-ledger th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#80868b; padding:10px 14px; border-bottom:2px solid #f1f3f4; }
      .bud-ledger td { padding:11px 14px; border-bottom:1px solid #f9f9f9; font-size:13px; vertical-align:middle; }
      .bud-ledger tr:hover td { background:rgba(15,52,96,.02); }

      .bud-row-btn { padding:3px 10px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; cursor:pointer; font-size:11.5px; font-family:inherit; color:#0f2d6b; margin-left:3px; }
      .bud-row-btn:hover { border-color:#1a5aa8; color:#1a5aa8; }
      .bud-row-btn.danger { color:#b91c1c; border-color:rgba(185,28,28,.25); }
      .bud-row-btn.danger:hover { background:#fef2f2; }

      .bud-empty { background:#fff; border:1px solid rgba(15,45,107,.10); border-radius:14px; padding:60px; text-align:center; }

      .bud-tag { display:inline-block; font-size:11.5px; padding:2px 9px; border-radius:999px; background:#e8f0fe; color:#1a5aa8; font-weight:600; }
      .bud-irb-badge { font-size:11px; padding:2px 8px; border-radius:999px; background:#fef3c7; color:#92400e; font-weight:600; margin-right:4px; }

      /* Modal */
      .bud-overlay { position:fixed; inset:0; background:rgba(15,45,107,.18); z-index:1000; backdrop-filter:blur(2px); }
      .bud-modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:560px; max-width:calc(100vw - 32px); max-height:90vh; overflow:hidden; background:#fff; border-radius:16px; box-shadow:0 8px 48px rgba(15,45,107,.18); z-index:1001; display:flex; flex-direction:column; }
      .bud-modal-header { padding:18px 22px 16px; font-size:16px; font-weight:700; color:#0f2d6b; border-bottom:1px solid #f1f3f4; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
      .bud-modal-close { background:none; border:none; cursor:pointer; font-size:17px; color:#80868b; padding:4px; border-radius:6px; transition:background .12s; }
      .bud-modal-close:hover { background:#f1f3f4; color:#0f2d6b; }
      .bud-modal-body { padding:20px 22px; overflow-y:auto; flex:1; }
      .bud-modal-footer { padding:14px 22px; border-top:1px solid #f1f3f4; display:flex; justify-content:flex-end; gap:10px; flex-shrink:0; }
      .bud-btn-cancel { padding:9px 22px; border-radius:999px; border:1.5px solid #dadce0; background:#fff; cursor:pointer; font-size:13.5px; font-family:inherit; color:#0f2d6b; }
      .bud-btn-save { padding:9px 22px; border-radius:999px; border:none; background:#0f3460; color:#fff; cursor:pointer; font-size:13.5px; font-weight:600; font-family:inherit; transition:background .15s; }
      .bud-btn-save:hover { background:#16407a; }
      .bud-btn-save:disabled { opacity:.55; cursor:not-allowed; }

      .bud-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .bud-field { display:flex; flex-direction:column; gap:5px; }
      .bud-field-wide { grid-column:1/-1; }
      .bud-field label { font-size:12.5px; font-weight:500; color:#5f6368; }
      .bud-input { padding:9px 12px; border-radius:8px; border:1.5px solid #dadce0; font-size:13.5px; font-family:inherit; color:#0f2d6b; background:#fff; outline:none; transition:border-color .15s,box-shadow .15s; width:100%; }
      .bud-input:focus { border-color:#1a5aa8; box-shadow:0 0 0 3px rgba(26,90,168,.1); }
      textarea.bud-input { resize:vertical; min-height:60px; }
      .bud-check { display:flex; align-items:center; gap:7px; cursor:pointer; font-size:13px; color:#0f2d6b; }
      .bud-check input[type=checkbox] { width:15px; height:15px; accent-color:#0f3460; cursor:pointer; }

      .bud-type-toggle { display:flex; gap:8px; }
      .bud-type-btn { flex:1; padding:10px; border-radius:10px; border:2px solid #dadce0; background:#fff; cursor:pointer; font-size:13px; font-weight:500; font-family:inherit; color:#5f6368; transition:all .15s; }
      .bud-type-btn.active[id="tt-expense"] { border-color:#ef4444; background:#fef2f2; color:#b91c1c; }
      .bud-type-btn.active[id="tt-income"]  { border-color:#1e8e3e; background:#e6f4ea; color:#1e8e3e; }

      .main-content { min-height:calc(100vh - 56px); overflow:auto; }

      @media(max-width:600px) {
        .bud-form-grid { grid-template-columns:1fr; }
        .bud-field-wide { grid-column:1; }
        .bud-summary-row { grid-template-columns:1fr 1fr; }
      }
    `;
    document.head.appendChild(s);
  }

  return {
    render,
    _openBudget,
    _backToList,
    _openBudgetModal,
    _saveBudget,
    _openTxModal,
    _setTxType,
    _saveTx,
    _deleteTx,
    _closeModal,
  };
})();
