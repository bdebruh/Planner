// ── Paper Tracker ──────────────────────────────────────────────
const Papers = (() => {
  let _container = null;
  let _papers    = [];
  let _projects  = [];
  let _budgets   = [];
  let _query     = '';
  let _dragId    = null;

  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const WORK_STATUSES = [
    { k:'Active',     l:'Active',     c:'#1e8e3e', bg:'#e6f4ea' },
    { k:'Paused',     l:'Paused',     c:'#f59e0b', bg:'#fef3c7' },
    { k:'Ideation',   l:'Ideation',   c:'#9334e6', bg:'#f3e8ff' },
    { k:'Incomplete', l:'Incomplete', c:'#6b7280', bg:'#f3f4f6' },
  ];
  const PUB_STATUSES = [
    { k:'Accepted', l:'Accepted', c:'#1e8e3e' },
    { k:'Pending',  l:'Pending',  c:'#1a5aa8' },
    { k:'Rejected', l:'Rejected', c:'#b91c1c' },
    { k:'Other',    l:'Other',    c:'#80868b' },
  ];

  const ws = k => WORK_STATUSES.find(s=>s.k===k) || {l:k,c:'#80868b',bg:'#f3f4f6'};
  const ps = k => PUB_STATUSES.find(s=>s.k===k)  || {l:k,c:'#80868b'};

  // ── Entry point ───────────────────────────────────────────────
  async function render(container) {
    _container = container;
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading papers…</div>';
    try {
      const [papersRes, projects] = await Promise.all([
        DB.client.from('papers').select('*').order('sort_order'),
        DB.getProjects().catch(()=>[]),
      ]);
      _papers   = papersRes.data || [];
      _projects = projects;
      // Load grants for budget linking
      _budgets = [];
      for (const p of projects) {
        const g = await DB.getGrants(p.id).catch(()=>[]);
        _budgets.push(...g.map(gr=>({...gr,_projectName:p.name})));
      }
      renderList();
    } catch(e) {
      container.innerHTML = '<div style="padding:40px;color:#b91c1c;">'+esc(e.message)+'</div>';
    }
  }

  // ── Main list view ────────────────────────────────────────────
  function renderList() {
    const filtered = _query
      ? _papers.filter(p =>
          (p.title||'').toLowerCase().includes(_query) ||
          (p.pi||'').toLowerCase().includes(_query) ||
          (p.topics||'').toLowerCase().includes(_query) ||
          (p.pubs_target||'').toLowerCase().includes(_query))
      : _papers;

    let html = '<div style="max-width:1100px;margin:0 auto;padding:24px 24px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;">';
    html += '<div><h1 style="font-size:22px;font-weight:700;color:#0f2d6b;letter-spacing:-.3px;margin-bottom:2px;">Paper Tracker</h1>';
    html += '<p style="font-size:13px;color:#80868b;">'+_papers.length+' papers across all projects</p></div>';
    html += '<button onclick="Papers._openModal()" style="padding:9px 22px;border-radius:999px;border:none;background:#0f3460;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit;white-space:nowrap;">+ Add Paper</button>';
    html += '</div>';

    // Search + filters
    html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">';
    html += '<div style="position:relative;flex:1;min-width:220px;">';
    html += '<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;" viewBox="0 0 20 20" fill="none" stroke="#80868b" stroke-width="2" width="14" height="14"><circle cx="8" cy="8" r="5"/><path d="M13 13l3 3"/></svg>';
    html += '<input id="paper-search" type="text" value="'+esc(_search)+'" placeholder="Search papers, authors, topics…" oninput="Papers._search(this.value)" style="width:100%;padding:9px 12px 9px 32px;border-radius:8px;border:1.5px solid #dadce0;font-size:13px;font-family:inherit;color:#0f2d6b;background:#fff;outline:none;box-sizing:border-box;">';
    html += '</div>';
    // Pub status filter pills
    PUB_STATUSES.forEach(function(s) {
      const cnt = filtered.filter(p=>p.pubs_status===s.k).length;
      if (cnt===0) return;
      html += '<span style="padding:5px 14px;border-radius:999px;background:'+s.c+'18;color:'+s.c+';font-size:12px;font-weight:600;white-space:nowrap;">'+s.l+' ('+cnt+')</span>';
    });
    html += '</div>';

    // Status groups
    WORK_STATUSES.forEach(function(status) {
      const group = filtered.filter(p=>p.work_status===status.k);
      html += statusGroup(status, group);
    });

    // Uncategorized
    const known = WORK_STATUSES.map(s=>s.k);
    const other = filtered.filter(p=>!known.includes(p.work_status));
    if (other.length) {
      html += statusGroup({k:'Other',l:'Other',c:'#80868b',bg:'#f3f4f6'}, other);
    }

    html += '</div>';
    html += abstractModal();
    html += paperModal();
    _container.innerHTML = html;
  }

  function statusGroup(status, papers) {
    if (papers.length === 0) return '';
    let html = '<div style="margin-bottom:20px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 14px;background:'+status.bg+';border-radius:10px;border-left:4px solid '+status.c+';">';
    html += '<span style="font-size:13px;font-weight:700;color:'+status.c+';">'+status.l+'</span>';
    html += '<span style="font-size:12px;font-weight:600;color:'+status.c+'60;background:'+status.c+'20;padding:2px 8px;border-radius:999px;">'+papers.length+'</span>';
    html += '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    papers.forEach(function(p) { html += paperCard(p); });
    html += '</div></div>';
    return html;
  }

  function paperCard(p) {
    const psi    = ps(p.pubs_status);
    const wsi    = ws(p.work_status);
    const proj   = _projects.find(x=>x.id===p.project_id);
    const budget = _budgets.find(x=>x.id===p.grant_id);
    const hasAbstract = p.abstract && p.abstract !== 'TBD' && p.abstract.length > 10;

    let html = '<div draggable="true" ondragstart="Papers._dragStart(\''+p.id+'\')" ondragover="event.preventDefault()" ondrop="Papers._drop(event,\''+p.work_status+'\')" ';
    html += 'style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:16px 18px;transition:box-shadow .15s;cursor:default;" ';
    html += 'onmouseover="this.style.boxShadow=\'0 2px 12px rgba(15,45,107,.10)\'" onmouseout="this.style.boxShadow=\'\'">';

    // Row 1: badges + number + title
    html += '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">';
    html += '<span style="font-size:11.5px;color:#b0b0b5;font-weight:600;flex-shrink:0;margin-top:2px;">#'+p.num+'</span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:14px;font-weight:700;color:#0f2d6b;line-height:1.35;margin-bottom:5px;">'+esc(p.title)+'</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';
    html += '<span style="font-size:11px;padding:2px 9px;border-radius:999px;background:'+psi.c+'18;color:'+psi.c+';font-weight:700;">'+psi.l+'</span>';
    if (p.paper_type) html += '<span style="font-size:11px;padding:2px 9px;border-radius:999px;background:#f1f3f4;color:#5f6368;font-weight:600;">'+esc(p.paper_type.split(',')[0].trim())+'</span>';
    if (p.pubs_target) html += '<span style="font-size:12px;color:#80868b;font-style:italic;">→ '+esc(p.pubs_target)+'</span>';
    if (p.target_date && p.target_date !== 'TBD') html += '<span style="font-size:11.5px;color:#80868b;">Due: '+esc(p.target_date)+'</span>';
    html += '</div></div>';
    html += '</div>';

    // Row 2: PI + topics
    html += '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">';
    if (p.pi) html += '<span style="font-size:12.5px;color:#5f6368;">👤 '+esc(p.pi)+'</span>';
    if (p.topics) {
      p.topics.split(',').slice(0,3).forEach(function(t) {
        html += '<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:#e8f0fe;color:#1a5aa8;">'+esc(t.trim())+'</span>';
      });
    }
    html += '</div>';

    // Row 3: action buttons
    html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid #f9f9f9;padding-top:10px;">';

    // Abstract button
    if (hasAbstract) {
      html += '<button onclick="Papers._showAbstract(\''+p.id+'\')" style="padding:4px 12px;border-radius:999px;border:1.5px solid #1a5aa8;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#1a5aa8;">Abstract</button>';
    }

    // Paper link
    if (p.paper_link) {
      html += '<a href="'+esc(p.paper_link.startsWith('http')?p.paper_link:'#')+'" target="_blank" style="padding:4px 12px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;font-size:12px;color:#0f2d6b;text-decoration:none;">📄 Paper</a>';
    }

    // Outline link
    if (p.outline_link) {
      html += '<a href="'+esc(p.outline_link.startsWith('http')?p.outline_link:'#')+'" target="_blank" style="padding:4px 12px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;font-size:12px;color:#0f2d6b;text-decoration:none;">📝 Outline</a>';
    }

    // Project link
    if (proj) {
      html += '<button onclick="openProject(\''+proj.id+'\')" style="padding:4px 12px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#0f2d6b;">🗂 '+esc(proj.name)+'</button>';
    }

    // Budget link
    if (budget) {
      html += '<button onclick="showView(\'budget\')" style="padding:4px 12px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#0f2d6b;">💰 '+esc(budget.grant_code)+'</button>';
    }

    html += '<div style="flex:1;"></div>';

    // Status dropdown
    html += '<select onchange="Papers._changeStatus(\''+p.id+'\',this.value)" style="padding:4px 8px;border-radius:8px;border:1.5px solid '+wsi.c+';font-size:12px;font-family:inherit;color:'+wsi.c+';background:'+wsi.bg+';cursor:pointer;font-weight:600;">';
    WORK_STATUSES.forEach(function(s) {
      html += '<option value="'+s.k+'"'+(p.work_status===s.k?' selected':'')+'>'+s.l+'</option>';
    });
    html += '</select>';

    html += '<button onclick="Papers._openModal(\''+p.id+'\')" style="padding:4px 12px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#0f2d6b;">Edit</button>';
    html += '<button onclick="Papers._delete(\''+p.id+'\')" style="padding:4px 12px;border-radius:999px;border:1.5px solid rgba(185,28,28,.25);background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#b91c1c;">Del</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Abstract modal ────────────────────────────────────────────
  function abstractModal() {
    return '<div id="abs-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,45,107,.2);z-index:1000;backdrop-filter:blur(2px);" onclick="document.getElementById(\'abs-overlay\').style.display=\'none\'">'
      + '<div onclick="event.stopPropagation()" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:640px;max-width:calc(100vw - 32px);max-height:80vh;background:#fff;border-radius:16px;box-shadow:0 8px 48px rgba(15,45,107,.18);display:flex;flex-direction:column;overflow:hidden;">'
      + '<div style="padding:18px 22px 14px;border-bottom:1px solid #f1f3f4;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-shrink:0;">'
      + '<div id="abs-title" style="font-size:15px;font-weight:700;color:#0f2d6b;line-height:1.4;"></div>'
      + '<button onclick="document.getElementById(\'abs-overlay\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;font-size:18px;color:#80868b;flex-shrink:0;padding:0 4px;">✕</button>'
      + '</div>'
      + '<div id="abs-body" style="padding:20px 22px;overflow-y:auto;font-size:13.5px;color:#0f2d6b;line-height:1.7;"></div>'
      + '</div></div>';
  }

  function _showAbstract(id) {
    const p = _papers.find(x=>x.id===id);
    if (!p) return;
    document.getElementById('abs-title').textContent = p.title;
    document.getElementById('abs-body').textContent  = p.abstract;
    document.getElementById('abs-overlay').style.display = '';
  }

  // ── Drag and drop ─────────────────────────────────────────────
  function _dragStart(id) { _dragId = id; }
  async function _drop(e, targetStatus) {
    e.preventDefault();
    if (!_dragId) return;
    const p = _papers.find(x=>x.id===_dragId);
    if (!p || p.work_status===targetStatus) { _dragId=null; return; }
    await _changeStatus(_dragId, targetStatus);
    _dragId = null;
  }

  async function _changeStatus(id, status) {
    const p = _papers.find(x=>x.id===id);
    if (!p) return;
    p.work_status = status;
    const {error} = await DB.client.from('papers').update({work_status:status,updated_at:new Date().toISOString()}).eq('id',id);
    if (error) { toast('Save failed: '+error.message,'error'); return; }
    renderList();
  }

  // ── Search ────────────────────────────────────────────────────
  function _search(val) {
    _query = val.toLowerCase();
    renderList();
    // Restore focus + cursor
    const el = document.getElementById('paper-search');
    if (el) { el.focus(); el.setSelectionRange(el.value.length,el.value.length); }
  }

  // ── Paper modal (add/edit) ────────────────────────────────────
  function paperModal() {
    return '<div id="paper-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,45,107,.18);z-index:1001;backdrop-filter:blur(2px);" onclick="if(event.target===this)Papers._closeModal()">'
      + '<div id="paper-modal" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:620px;max-width:calc(100vw - 32px);max-height:90vh;background:#fff;border-radius:16px;box-shadow:0 8px 48px rgba(15,45,107,.18);display:flex;flex-direction:column;overflow:hidden;"></div>'
      + '</div>';
  }

  const INP = 'width:100%;padding:9px 12px;border-radius:8px;border:1.5px solid #dadce0;font-size:13px;font-family:inherit;color:#0f2d6b;background:#fff;outline:none;box-sizing:border-box;';

  function _openModal(paperId) {
    const p     = paperId ? _papers.find(x=>x.id===paperId) : null;
    const isNew = !p;

    const wsOpts = WORK_STATUSES.map(s=>'<option value="'+s.k+'"'+(p?.work_status===s.k||(!p&&s.k==='Active')?' selected':'')+'>'+s.l+'</option>').join('');
    const psOpts = PUB_STATUSES.map(s=>'<option value="'+s.k+'"'+(p?.pubs_status===s.k||(!p&&s.k==='Pending')?' selected':'')+'>'+s.l+'</option>').join('');
    const projOpts = '<option value="">— None —</option>'+_projects.map(pr=>'<option value="'+pr.id+'"'+(p?.project_id===pr.id?' selected':'')+'>'+esc(pr.name)+'</option>').join('');
    const budgOpts = '<option value="">— None —</option>'+_budgets.map(b=>'<option value="'+b.id+'"'+(p?.grant_id===b.id?' selected':'')+'>'+esc(b.grant_code)+' — '+esc(b._projectName)+'</option>').join('');

    let html = '<div style="padding:16px 20px 14px;font-size:16px;font-weight:700;color:#0f2d6b;border-bottom:1px solid #f1f3f4;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<span>'+(isNew?'Add Paper':'Edit Paper')+'</span>';
    html += '<button onclick="Papers._closeModal()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#80868b;padding:0;">✕</button></div>';
    html += '<div style="padding:18px 20px;overflow-y:auto;flex:1;display:grid;grid-template-columns:1fr 1fr;gap:14px;">';

    html += fld('Title *', '<input type="text" id="pf-title" style="'+INP+'" value="'+esc(p?.title||'')+'" placeholder="Full paper title">', true);
    html += fld('Work Status', '<select id="pf-wstatus" style="'+INP+'">'+wsOpts+'</select>');
    html += fld('Pub Status', '<select id="pf-pstatus" style="'+INP+'">'+psOpts+'</select>');
    html += fld('Paper Type', '<input type="text" id="pf-type" style="'+INP+'" value="'+esc(p?.paper_type||'')+'" placeholder="e.g. Article, Conference Paper">');
    html += fld('PI / Authors', '<input type="text" id="pf-pi" style="'+INP+'" value="'+esc(p?.pi||'')+'" placeholder="e.g. BDB, CJD">');
    html += fld('Target Publication', '<input type="text" id="pf-target" style="'+INP+'" value="'+esc(p?.pubs_target||'')+'" placeholder="e.g. MPSA 26">');
    html += fld('Target Date', '<input type="text" id="pf-date" style="'+INP+'" value="'+esc(p?.target_date||'')+'" placeholder="e.g. 4/9/26 or TBD">');
    html += fld('Topics', '<input type="text" id="pf-topics" style="'+INP+'" value="'+esc(p?.topics||'')+'" placeholder="e.g. Political Science, Technology">');
    html += fld('Link to Project', '<select id="pf-project" style="'+INP+'">'+projOpts+'</select>');
    html += fld('Link to Budget', '<select id="pf-budget" style="'+INP+'">'+budgOpts+'</select>');
    html += fld('Paper Link', '<input type="text" id="pf-plink" style="'+INP+'" value="'+esc(p?.paper_link||'')+'" placeholder="URL or filename">');
    html += fld('Outline Link', '<input type="text" id="pf-olink" style="'+INP+'" value="'+esc(p?.outline_link||'')+'" placeholder="URL or filename">');
    html += fld('Abstract', '<textarea id="pf-abstract" rows="4" style="'+INP+'resize:vertical;">'+esc(p?.abstract||'')+'</textarea>', true);
    html += fld('Notes', '<textarea id="pf-notes" rows="2" style="'+INP+'resize:vertical;">'+esc(p?.notes||'')+'</textarea>', true);

    html += '</div>';
    html += '<div style="padding:14px 20px;border-top:1px solid #f1f3f4;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">';
    html += '<button onclick="Papers._closeModal()" style="padding:9px 22px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:13.5px;font-family:inherit;color:#0f2d6b;">Cancel</button>';
    html += '<button id="pf-save" onclick="Papers._save(\''+( paperId||'')+'\')" style="padding:9px 22px;border-radius:999px;border:none;background:#0f3460;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit;">'+(isNew?'Add Paper':'Save Changes')+'</button>';
    html += '</div>';

    const modal   = document.getElementById('paper-modal');
    const overlay = document.getElementById('paper-overlay');
    if (!modal||!overlay) return;
    modal.innerHTML = html;
    overlay.style.display = '';
    document.getElementById('pf-title')?.focus();
  }

  function fld(label, input, wide) {
    return '<div style="'+(wide?'grid-column:1/-1':'')+'">'
      + '<label style="font-size:12px;font-weight:500;color:#5f6368;display:block;margin-bottom:4px;">'+label+'</label>'
      + input + '</div>';
  }

  async function _save(paperId) {
    const title = document.getElementById('pf-title')?.value.trim();
    if (!title) { alert('Title is required.'); return; }

    const payload = {
      title,
      work_status:  document.getElementById('pf-wstatus')?.value  || 'Active',
      pubs_status:  document.getElementById('pf-pstatus')?.value  || 'Pending',
      paper_type:   document.getElementById('pf-type')?.value.trim()   || '',
      pi:           document.getElementById('pf-pi')?.value.trim()     || '',
      pubs_target:  document.getElementById('pf-target')?.value.trim() || '',
      target_date:  document.getElementById('pf-date')?.value.trim()   || '',
      topics:       document.getElementById('pf-topics')?.value.trim() || '',
      project_id:   document.getElementById('pf-project')?.value || null,
      grant_id:     document.getElementById('pf-budget')?.value  || null,
      paper_link:   document.getElementById('pf-plink')?.value.trim()  || '',
      outline_link: document.getElementById('pf-olink')?.value.trim()  || '',
      abstract:     document.getElementById('pf-abstract')?.value.trim() || '',
      notes:        document.getElementById('pf-notes')?.value.trim()   || '',
      updated_at:   new Date().toISOString(),
    };

    const btn = document.getElementById('pf-save');
    if (btn) { btn.disabled=true; btn.textContent='Saving…'; }
    try {
      if (paperId) {
        const {error} = await DB.client.from('papers').update(payload).eq('id',paperId);
        if (error) throw error;
        const idx = _papers.findIndex(p=>p.id===paperId);
        if (idx>=0) Object.assign(_papers[idx], payload);
      } else {
        const user = (await DB.client.auth.getUser()).data.user;
        const {data,error} = await DB.client.from('papers')
          .insert({...payload,owner_id:user.id,num:_papers.length+1,sort_order:_papers.length+1})
          .select().single();
        if (error) throw error;
        _papers.push(data);
      }
      _closeModal();
      window.toast && toast(paperId?'Paper updated.':'Paper added.','success');
      renderList();
    } catch(e) {
      alert('Save failed: '+e.message);
      if (btn) { btn.disabled=false; btn.textContent=paperId?'Save Changes':'Add Paper'; }
    }
  }

  async function _delete(id) {
    if (!confirm('Delete this paper?')) return;
    const {error} = await DB.client.from('papers').delete().eq('id',id);
    if (error) { alert(error.message); return; }
    _papers = _papers.filter(p=>p.id!==id);
    window.toast && toast('Deleted.','');
    renderList();
  }

  function _closeModal() {
    const o = document.getElementById('paper-overlay');
    if (o) o.style.display = 'none';
  }

  return {
    render,
    _openModal, _save, _delete, _closeModal,
    _showAbstract, _changeStatus, _search,
    _dragStart, _drop,
  };
})();
