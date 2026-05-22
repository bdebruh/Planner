// ── Paper Tracker ──────────────────────────────────────────────
const Papers = (() => {
  let _container = null;
  let _papers    = [];

  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDate = d => {
    if (!d) return '—';
    const [y,m,day] = d.slice(0,10).split('-');
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+parseInt(day)+', '+y;
  };

  const STATUSES = [
    { k:'draft',           l:'Draft',              c:'#6b7280' },
    { k:'submitted',       l:'Submitted',          c:'#1a5aa8' },
    { k:'under_review',    l:'Under Review',       c:'#f59e0b' },
    { k:'revise_resubmit', l:'Revise & Resubmit',  c:'#e37400' },
    { k:'accepted',        l:'Accepted',           c:'#1e8e3e' },
    { k:'published',       l:'Published',          c:'#0f2d6b' },
    { k:'rejected',        l:'Rejected',           c:'#b91c1c' },
  ];

  function statusInfo(k) { return STATUSES.find(s=>s.k===k) || {l:k,c:'#80868b'}; }

  async function render(container) {
    _container = container;
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';
    try {
      const { data, error } = await DB.client.from('papers').select('*').order('created_at',{ascending:false});
      if (error) throw error;
      _papers = data || [];
      renderList();
    } catch(e) {
      container.innerHTML = '<div style="padding:40px;color:#b91c1c;">'+esc(e.message)+'</div>';
    }
  }

  function renderList() {
    let html = '<div style="max-width:960px;margin:0 auto;padding:28px 24px;">';

    // Header
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:24px;">';
    html += '<div><h1 style="font-size:22px;font-weight:700;color:#0f2d6b;letter-spacing:-.3px;margin-bottom:2px;">Paper Tracker</h1>';
    html += '<p style="font-size:13px;color:#80868b;">'+_papers.length+' paper'+(  _papers.length!==1?'s':'')+' · Track manuscripts from draft to publication</p></div>';
    html += '<button onclick="Papers._openModal()" style="padding:9px 22px;border-radius:999px;border:none;background:#0f3460;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit;">+ Add Paper</button>';
    html += '</div>';

    // Pipeline summary
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">';
    STATUSES.forEach(function(s) {
      const count = _papers.filter(p=>p.status===s.k).length;
      if (count === 0) return;
      html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:10px;padding:10px 16px;min-width:80px;text-align:center;">';
      html += '<div style="font-size:18px;font-weight:700;color:'+s.c+';">'+count+'</div>';
      html += '<div style="font-size:11px;color:#80868b;font-weight:500;">'+s.l+'</div>';
      html += '</div>';
    });
    html += '</div>';

    if (_papers.length === 0) {
      html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:14px;padding:60px;text-align:center;">';
      html += '<div style="font-size:32px;margin-bottom:12px;">📄</div>';
      html += '<div style="font-size:15px;font-weight:600;color:#0f2d6b;margin-bottom:6px;">No papers yet</div>';
      html += '<div style="font-size:13.5px;color:#80868b;margin-bottom:18px;">Track your manuscripts from draft through publication.</div>';
      html += '<button onclick="Papers._openModal()" style="padding:9px 22px;border-radius:999px;border:none;background:#0f3460;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit;">Add your first paper</button>';
      html += '</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:12px;">';
      _papers.forEach(function(p) {
        const si = statusInfo(p.status);
        html += '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:18px 20px;">';
        html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">';
        // Left
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;flex-wrap:wrap;">';
        html += '<span style="font-size:11.5px;padding:3px 11px;border-radius:999px;background:'+si.c+'20;color:'+si.c+';font-weight:700;">'+si.l+'</span>';
        if (p.journal) html += '<span style="font-size:12.5px;color:#5f6368;font-style:italic;">'+esc(p.journal)+'</span>';
        html += '</div>';
        html += '<div style="font-size:15px;font-weight:700;color:#0f2d6b;margin-bottom:5px;line-height:1.4;">'+esc(p.title)+'</div>';
        if (p.co_authors) html += '<div style="font-size:12.5px;color:#80868b;margin-bottom:4px;">👥 '+esc(p.co_authors)+'</div>';
        if (p.abstract) html += '<div style="font-size:12.5px;color:#5f6368;line-height:1.5;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">'+esc(p.abstract)+'</div>';
        html += '</div>';
        // Right — dates + actions
        html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">';
        if (p.submission_date) html += '<div style="font-size:12px;color:#80868b;">Submitted: '+fmtDate(p.submission_date)+'</div>';
        if (p.decision_date)   html += '<div style="font-size:12px;color:#80868b;">Decision: '+fmtDate(p.decision_date)+'</div>';
        if (p.doi) html += '<a href="https://doi.org/'+esc(p.doi)+'" target="_blank" style="font-size:12px;color:#1a5aa8;">DOI ↗</a>';
        html += '<div style="display:flex;gap:6px;margin-top:4px;">';
        html += '<button onclick="Papers._openModal(\''+p.id+'\')" style="padding:4px 14px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#0f2d6b;">Edit</button>';
        html += '<button onclick="Papers._delete(\''+p.id+'\')" style="padding:4px 14px;border-radius:999px;border:1.5px solid rgba(185,28,28,.25);background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#b91c1c;">Delete</button>';
        html += '</div></div></div>';
        if (p.notes) html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #f9f9f9;font-size:12.5px;color:#5f6368;line-height:1.5;">'+esc(p.notes)+'</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    html += '<div id="paper-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,45,107,.18);z-index:1000;backdrop-filter:blur(2px);" onclick="if(event.target===this)Papers._closeModal()"></div>';
    html += '<div id="paper-modal" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:560px;max-width:calc(100vw - 32px);max-height:90vh;overflow:hidden;background:#fff;border-radius:16px;box-shadow:0 8px 48px rgba(15,45,107,.18);z-index:1001;display:flex;flex-direction:column;"></div>';
    _container.innerHTML = html;
  }

  function _openModal(paperId) {
    const p = paperId ? _papers.find(x=>x.id===paperId) : null;
    const isNew = !p;

    const statusOpts = STATUSES.map(s =>
      '<option value="'+s.k+'"'+(p?.status===s.k?' selected':(!p&&s.k==='draft'?' selected':''))+'>'+s.l+'</option>'
    ).join('');

    let html = '<div style="padding:18px 22px 16px;font-size:16px;font-weight:700;color:#0f2d6b;border-bottom:1px solid #f1f3f4;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">';
    html += '<span>'+(isNew?'Add Paper':'Edit Paper')+'</span>';
    html += '<button onclick="Papers._closeModal()" style="background:none;border:none;cursor:pointer;font-size:17px;color:#80868b;padding:4px;border-radius:6px;">✕</button></div>';
    html += '<div style="padding:20px 22px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px;">';

    html += mf('Title *', '<input type="text" id="pf-title" style="'+inp+'" placeholder="Full paper title" value="'+esc(p?.title||'')+'">', true);
    html += mf('Status', '<select id="pf-status" style="'+inp+'">'+statusOpts+'</select>');
    html += mf('Journal / Conference', '<input type="text" id="pf-journal" style="'+inp+'" placeholder="e.g. Journal of Public Policy" value="'+esc(p?.journal||'')+'">');
    html += mf('Co-authors', '<input type="text" id="pf-authors" style="'+inp+'" placeholder="e.g. Smith, J.; Lee, K." value="'+esc(p?.co_authors||'')+'">');
    html += mf('Submission Date', '<input type="date" id="pf-sub" style="'+inp+'" value="'+(p?.submission_date||'')+'">');
    html += mf('Decision Date', '<input type="date" id="pf-dec" style="'+inp+'" value="'+(p?.decision_date||'')+'">');
    html += mf('DOI', '<input type="text" id="pf-doi" style="'+inp+'" placeholder="e.g. 10.1000/xyz123" value="'+esc(p?.doi||'')+'">');
    html += '<div style="grid-column:1/-1"><label style="font-size:12.5px;font-weight:500;color:#5f6368;display:block;margin-bottom:5px;">Abstract</label><textarea id="pf-abstract" rows="3" style="'+inp+'resize:vertical;">'+esc(p?.abstract||'')+'</textarea></div>';
    html += '<div style="grid-column:1/-1"><label style="font-size:12.5px;font-weight:500;color:#5f6368;display:block;margin-bottom:5px;">Notes</label><textarea id="pf-notes" rows="2" style="'+inp+'resize:vertical;">'+esc(p?.notes||'')+'</textarea></div>';
    html += '</div>';
    html += '<div style="padding:14px 22px;border-top:1px solid #f1f3f4;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">';
    html += '<button onclick="Papers._closeModal()" style="padding:9px 22px;border-radius:999px;border:1.5px solid #dadce0;background:#fff;cursor:pointer;font-size:13.5px;font-family:inherit;color:#0f2d6b;">Cancel</button>';
    html += '<button id="pf-save" onclick="Papers._save(\''+( paperId||'')+'\')" style="padding:9px 22px;border-radius:999px;border:none;background:#0f3460;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;font-family:inherit;">'+(isNew?'Add Paper':'Save Changes')+'</button>';
    html += '</div>';

    const modal = document.getElementById('paper-modal');
    const overlay = document.getElementById('paper-overlay');
    if (!modal||!overlay) return;
    modal.innerHTML = html;
    modal.style.display = 'flex';
    overlay.style.display = '';
    document.getElementById('pf-title')?.focus();
  }

  const inp = 'width:100%;padding:9px 12px;border-radius:8px;border:1.5px solid #dadce0;font-size:13.5px;font-family:inherit;color:#0f2d6b;background:#fff;outline:none;box-sizing:border-box;';
  function mf(label, input, wide) {
    return '<div style="'+(wide?'grid-column:1/-1':'')+'">'
      + '<label style="font-size:12.5px;font-weight:500;color:#5f6368;display:block;margin-bottom:5px;">'+label+'</label>'
      + input + '</div>';
  }

  async function _save(paperId) {
    const title   = document.getElementById('pf-title')?.value.trim();
    if (!title) { alert('Title is required.'); return; }
    const payload = {
      title,
      status:          document.getElementById('pf-status')?.value   || 'draft',
      journal:         document.getElementById('pf-journal')?.value.trim() || '',
      co_authors:      document.getElementById('pf-authors')?.value.trim() || '',
      submission_date: document.getElementById('pf-sub')?.value     || null,
      decision_date:   document.getElementById('pf-dec')?.value     || null,
      doi:             document.getElementById('pf-doi')?.value.trim()    || '',
      abstract:        document.getElementById('pf-abstract')?.value.trim() || '',
      notes:           document.getElementById('pf-notes')?.value.trim()  || '',
      updated_at:      new Date().toISOString(),
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
        const {data,error} = await DB.client.from('papers').insert({...payload,owner_id:user.id}).select().single();
        if (error) throw error;
        _papers.unshift(data);
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
    document.getElementById('paper-overlay').style.display='none';
    document.getElementById('paper-modal').style.display='none';
  }

  return { render, _openModal, _save, _delete, _closeModal };
})();
