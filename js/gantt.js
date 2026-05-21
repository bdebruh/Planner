// ── Gantt chart ───────────────────────────────────────────────
const Gantt = (() => {
  // Date helpers
  const D = {
    parse:   s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); },
    fmt:     d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    disp:    d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    add:    (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; },
    diff:   (a,b) => Math.round((b-a)/86400000),
    isWE:   d => d.getDay()===0||d.getDay()===6,
    isToday:d => { const t=new Date(); return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate(); },
    monthName: d => d.toLocaleDateString('en-US',{month:'long',year:'numeric'}),
    monthShort:d => d.toLocaleDateString('en-US',{month:'short'}),
  };

  const ROW_H = 36;
  const ZOOM_PPD = { day:50, week:28, month:9, quarter:4 };

  let state = {
    projectId: null, project: null, tasks: [], phases: [],
    selectedId: null, zoom: 'week', panelWidth: 420,
    detailOpen: false, dirty: false,
    ctxMenu: null,
  };

  // ── Compute timeline range ────────────────────────────────────
  function timelineRange(tasks) {
    const today = new Date();
    const dates = tasks.flatMap(t => [D.parse(t.start_date), D.parse(t.end_date)]);
    dates.push(today);
    const min = dates.reduce((a,b) => a<b?a:b);
    const max = dates.reduce((a,b) => a>b?a:b);
    return { start: D.add(min,-14), total: D.diff(D.add(min,-14), D.add(max,30)) + 1 };
  }

  // ── Visible tasks (collapse aware) ───────────────────────────
  function visible(tasks) {
    const collapsed = new Set(tasks.filter(t => t.collapsed).map(t => t.id));
    function hidden(t) {
      if (!t.parent_id) return false;
      if (collapsed.has(t.parent_id)) return true;
      const p = tasks.find(x=>x.id===t.parent_id);
      return p ? hidden(p) : false;
    }
    return tasks.filter(t => !hidden(t));
  }

  function hasChildren(id) { return state.tasks.some(t => t.parent_id === id); }
  function getDepth(id) { const t = state.tasks.find(x=>x.id===id); if(!t||!t.parent_id) return 0; return 1+getDepth(t.parent_id); }
  function descendants(id) { const c = state.tasks.filter(t=>t.parent_id===id).map(t=>t.id); return c.flatMap(x=>[x,...descendants(x)]); }

  // ── Main render ───────────────────────────────────────────────
  async function render(container, projectId) {
    if (!projectId) { container.innerHTML = '<div class="page"><p style="padding:60px;text-align:center;color:#80868b;">Select a project from the sidebar to open its Gantt chart.</p></div>'; return; }
    state.projectId = projectId;
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';

    try {
      const [projects, tasks] = await Promise.all([DB.getProjects(), DB.getTasks(projectId)]);
      state.project = projects.find(p => p.id === projectId);
      state.tasks   = tasks;
      renderGantt(container);
    } catch(e) {
      container.innerHTML = `<div class="page"><p style="color:#b91c1c;">${e.message}</p></div>`;
    }
  }

  function renderGantt(container) {
    const ppd = ZOOM_PPD[state.zoom];
    const vis  = visible(state.tasks);
    const { start, total } = state.tasks.length
      ? timelineRange(state.tasks)
      : { start: D.add(new Date(),-14), total: 90 };
    const totalW = total * ppd;

    container.innerHTML = `
      <div class="gantt-page" id="gp">
        <!-- Toolbar -->
        <div class="gantt-toolbar" id="gt">
          <button class="btn btn-ghost btn-sm" onclick="Gantt.addTask(false)">+ Task</button>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.addTask(true)">◆ Milestone</button>
          <div class="tb-sep"></div>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.indent()" id="btn-indent">→ Indent</button>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.outdent()" id="btn-outdent">← Outdent</button>
          <div class="tb-sep"></div>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.deleteSelected()" id="btn-del">Delete</button>
          <div class="tb-sep"></div>
          <div class="zoom-group">
            ${['day','week','month','quarter'].map((z,i,a) =>
              `<button class="zoom-btn${z===state.zoom?' active':''}${i===0?' first':i===a.length-1?' last':''}" onclick="Gantt.setZoom('${z}')">${z.charAt(0).toUpperCase()+z.slice(1)}</button>`
            ).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.scrollToday()">Today</button>
          <div style="flex:1"></div>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.toggleDetail()" id="btn-detail">Details</button>
          <button class="btn btn-primary btn-sm" onclick="Gantt.save()" id="btn-save">
            ${state.dirty ? '● Save' : 'Saved'}
          </button>
        </div>

        <!-- Main split -->
        <div class="gantt-main" id="gm">
          <!-- Left: task list -->
          <div class="gantt-left" id="gl" style="width:${state.panelWidth}px">
            <div class="task-header">
              <div style="text-align:center">#</div>
              <div>Task Name</div>
              <div style="text-align:right;padding-right:4px">Dur</div>
              <div style="text-align:right;padding-right:4px">Start</div>
              <div style="text-align:right;padding-right:4px">End</div>
              <div style="text-align:right;padding-right:4px">%</div>
            </div>
            <div class="task-body" id="tb"></div>
            <div class="panel-resizer" id="pr"></div>
          </div>

          <!-- Right: timeline -->
          <div class="gantt-right">
            <div class="tl-scroll" id="tls" style="overflow-x:auto;overflow-y:hidden;display:flex;flex-direction:column;">
              <div style="width:${totalW}px;display:flex;flex-direction:column;min-height:100%">
                <div class="tl-header" id="tlh" style="width:${totalW}px">
                  <div class="tl-months" id="tlm" style="position:relative;height:24px;border-bottom:1px solid #f1f3f4;"></div>
                  <div class="tl-days"   id="tld" style="position:relative;height:24px;"></div>
                </div>
                <div class="tl-body" id="tlb" style="position:relative;flex:1;min-height:${vis.length*ROW_H+60}px;overflow-y:auto;">
                  <svg class="dep-svg" id="dsvg" style="position:absolute;inset:0;width:${totalW}px;height:${vis.length*ROW_H+60}px;">
                    <defs><marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                      <polygon points="0 0,8 3,0 6" fill="#1a5aa8" opacity=".7"/>
                    </marker></defs>
                  </svg>
                </div>
              </div>
            </div>
            <!-- Detail panel -->
            <div id="detailPanel" style="display:none;position:absolute;right:0;top:56px;bottom:28px;width:300px;background:#fff;border-left:1px solid rgba(15,45,107,.10);overflow-y:auto;box-shadow:-4px 0 16px rgba(15,45,107,.08);z-index:40;"></div>
          </div>
        </div>

        <!-- Status bar -->
        <div class="gantt-statusbar">
          <span id="sb-tasks"></span>
          <span id="sb-sel"></span>
          <span style="flex:1"></span>
          <span id="sb-zoom">${state.zoom.charAt(0).toUpperCase()+state.zoom.slice(1)} view</span>
        </div>
      </div>`;

    // Make gantt-right position:relative for detail panel
    container.querySelector('.gantt-right').style.position = 'relative';

    renderTasks();
    renderTimeline(start, total, ppd);
    renderBars(start, ppd, vis);
    renderDeps(start, ppd, vis);
    renderTodayMarker(start, ppd);
    syncScroll();
    setupPanelResize();
    setupKeyboard();
    updateStatus();
  }

  function renderTasks() {
    const tb  = document.getElementById('tb');
    const vis = visible(state.tasks);
    tb.innerHTML = '';
    vis.forEach((t, i) => {
      const depth    = getDepth(t.id);
      const isGroup  = hasChildren(t.id);
      const dur      = t.is_milestone ? '◆' : `${D.diff(D.parse(t.start_date),D.parse(t.end_date))+1}d`;
      const row = document.createElement('div');
      row.className = `task-row${t.id===state.selectedId?' selected':''}${isGroup?' is-group':''}`;
      row.dataset.id = t.id;
      row.innerHTML = `
        <div class="tr-num">${i+1}</div>
        <div class="tr-name-wrap" style="padding-left:${depth*14}px">
          ${isGroup?`<button class="tr-toggle${t.collapsed?' collapsed':''}" data-tog="${t.id}">▾</button>`:'<span style="width:16px;display:inline-block"></span>'}
          ${t.is_milestone?'<span style="color:#1a73e8;font-size:10px;margin-right:2px">◆</span>':''}
          <span class="tr-name-text" title="${esc(t.name)}">${esc(t.name)}</span>
        </div>
        <div class="tr-cell">${dur}</div>
        <div class="tr-cell">${D.disp(D.parse(t.start_date))}</div>
        <div class="tr-cell">${D.disp(D.parse(t.end_date))}</div>
        <div class="tr-pct">${t.progress||0}%</div>`;

      row.addEventListener('click', e => {
        if (e.target.closest('[data-tog]')) {
          const id = e.target.closest('[data-tog]').dataset.tog;
          const task = state.tasks.find(x=>x.id===id);
          if (task) { task.collapsed = !task.collapsed; markDirty(); renderGantt(document.getElementById('gp').parentElement); }
          return;
        }
        selectTask(t.id);
      });
      row.addEventListener('dblclick', () => openDetail(t.id));
      row.addEventListener('contextmenu', e => { e.preventDefault(); selectTask(t.id); showCtx(e.clientX, e.clientY, t.id); });
      tb.appendChild(row);
    });
  }

  function renderTimeline(start, total, ppd) {
    const months = document.getElementById('tlm');
    const days   = document.getElementById('tld');
    months.innerHTML = ''; days.innerHTML = '';
    let curMonth = '', monthX = 0;
    const zoom = state.zoom;

    for (let i = 0; i < total; i++) {
      const d = D.add(start, i);
      const x = i * ppd;
      const mKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (mKey !== curMonth) {
        if (curMonth) {
          const m = document.createElement('div');
          m.className = 'tl-month';
          m.style.left  = monthX + 'px';
          m.style.width = (x - monthX) + 'px';
          m.textContent = D.monthName(D.add(start, Math.round(monthX/ppd)));
          months.appendChild(m);
        }
        curMonth = mKey; monthX = x;
      }
      let label = '';
      if (zoom==='day') label = d.getDate();
      else if (zoom==='week' && ppd>=20) label = d.getDay()===1?d.getDate():'';
      else if (zoom==='month') label = d.getDate()===1?D.monthShort(d):'';
      else label = d.getDate()===1&&d.getMonth()%3===0?D.monthShort(d):'';
      const dc = document.createElement('div');
      dc.className = 'tl-day'+(D.isToday(d)?' today':'')+(D.isWE(d)?' weekend':'');
      dc.style.left = x+'px'; dc.style.width = ppd+'px';
      dc.textContent = label;
      days.appendChild(dc);
    }
    // Last month label
    const lastX = total * ppd;
    const lm = document.createElement('div');
    lm.className = 'tl-month';
    lm.style.left  = monthX+'px';
    lm.style.width = (lastX - monthX)+'px';
    lm.textContent = D.monthName(D.add(start, Math.round(monthX/ppd)));
    months.appendChild(lm);
  }

  function renderBars(start, ppd, vis) {
    const body  = document.getElementById('tlb');
    const color = state.project?.color || '#1a73e8';
    // Remove existing bar rows
    body.querySelectorAll('.bar-row').forEach(el => el.remove());

    vis.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'bar-row' + (t.id===state.selectedId?' selected':'');
      row.style.cssText = `position:absolute;top:${i*ROW_H}px;left:0;right:0;height:${ROW_H}px`;
      row.dataset.id = t.id;

      if (t.is_milestone) {
        const off  = D.diff(start, D.parse(t.start_date));
        const wrap = document.createElement('div');
        wrap.className = 'milestone-wrap';
        wrap.style.left = `${off*ppd+ppd/2-8}px`;
        wrap.innerHTML  = `<div class="milestone-diamond${t.id===state.selectedId?' selected':''}"></div>`;
        wrap.addEventListener('click', e => { e.stopPropagation(); selectTask(t.id); });
        wrap.addEventListener('contextmenu', e => { e.preventDefault(); selectTask(t.id); showCtx(e.clientX, e.clientY, t.id); });
        row.appendChild(wrap);
      } else {
        const so   = D.diff(start, D.parse(t.start_date));
        const dur  = D.diff(D.parse(t.start_date), D.parse(t.end_date)) + 1;
        const left = so * ppd;
        const w    = Math.max(dur * ppd - 2, 4);
        const isGrp = hasChildren(t.id);
        const barColor = isGrp ? color+'cc' : color;

        const barEl = document.createElement('div');
        barEl.className = `gantt-bar${t.id===state.selectedId?' selected':''}${isGrp?' is-group':''}`;
        barEl.style.cssText = `left:${left}px;width:${w}px;background:${barColor};${isGrp?'height:14px':''}`;

        if (t.progress > 0) {
          const prog = document.createElement('div');
          prog.className = 'bar-progress';
          prog.style.width = `${Math.min(t.progress,100)}%`;
          barEl.appendChild(prog);
        }

        if (w >= 72) {
          const lbl = document.createElement('span');
          lbl.className = 'bar-label'; lbl.textContent = t.name;
          barEl.appendChild(lbl);
        } else {
          const lbl = document.createElement('span');
          lbl.className = 'bar-label-ext';
          lbl.textContent = t.name;
          lbl.style.left = (left + w + 5) + 'px';
          row.appendChild(lbl);
        }

        // Drag handles
        ['left','right'].forEach(side => {
          const h = document.createElement('div');
          h.className = `bar-handle ${side}`;
          h.addEventListener('mousedown', e => { e.stopPropagation(); startDrag(t, side, e.clientX, ppd, start); });
          barEl.appendChild(h);
        });

        barEl.addEventListener('mousedown', e => {
          if (e.target.classList.contains('bar-handle')) return;
          e.stopPropagation();
          selectTask(t.id);
          startDrag(t, 'move', e.clientX, ppd, start);
        });
        barEl.addEventListener('click', e => e.stopPropagation());
        barEl.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); selectTask(t.id); showCtx(e.clientX, e.clientY, t.id); });
        row.appendChild(barEl);
      }

      row.addEventListener('click', () => selectTask(null));
      document.getElementById('tlb').appendChild(row);
    });
  }

  function renderDeps(start, ppd, vis) {
    const svg    = document.getElementById('dsvg');
    svg.querySelectorAll('.dep-path').forEach(e=>e.remove());
    const idxMap = new Map(vis.map((t,i) => [t.id, i]));
    vis.forEach(t => {
      (t.dependencies||[]).forEach(depId => {
        const fi = idxMap.get(depId), ti = idxMap.get(t.id);
        if (fi===undefined||ti===undefined) return;
        const from = vis[fi];
        const fx   = (D.diff(start, D.parse(from.end_date))+1)*ppd;
        const fy   = fi*ROW_H+ROW_H/2;
        const tx   = D.diff(start, D.parse(t.start_date))*ppd;
        const ty   = ti*ROW_H+ROW_H/2;
        const mid  = (fx+tx)/2;
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.classList.add('dep-path');
        path.setAttribute('d', `M${fx},${fy} C${mid},${fy} ${mid},${ty} ${tx},${ty}`);
        path.setAttribute('marker-end','url(#arr)');
        svg.appendChild(path);
      });
    });
  }

  function renderTodayMarker(start, ppd) {
    const body  = document.getElementById('tlb');
    body.querySelectorAll('.today-line').forEach(e=>e.remove());
    const today = new Date();
    const off   = D.diff(start, today);
    if (off>=0) {
      const line = document.createElement('div');
      line.className = 'today-line';
      line.style.left = `${off*ppd+ppd/2}px`;
      line.innerHTML  = '<span class="today-lbl">Today</span>';
      body.appendChild(line);
    }
  }

  function renderTodayMarker(start, ppd) {
    const body  = document.getElementById('tlb');
    body.querySelectorAll('.today-line').forEach(e=>e.remove());
    const today = new Date();
    const off   = D.diff(start, today);
    if (off>=0) {
      const line = document.createElement('div');
      line.className = 'today-line';
      line.style.left = `${off*ppd+ppd/2}px`;
      line.innerHTML  = '<span class="today-lbl">Today</span>';
      body.appendChild(line);
    }
  }

  function syncScroll() {
    const left  = document.getElementById('tb');
    const right = document.getElementById('tlb');
    if (!left||!right) return;
    let syncing = false;
    left.addEventListener('scroll',  () => { if(syncing)return; syncing=true; right.scrollTop=left.scrollTop;  syncing=false; });
    right.addEventListener('scroll', () => { if(syncing)return; syncing=true; left.scrollTop=right.scrollTop; syncing=false; });
  }

  // ── Drag ─────────────────────────────────────────────────────
  let drag = null;
  function startDrag(task, side, startX, ppd, tlStart) {
    drag = { task, side, startX, orig: { s: task.start_date, e: task.end_date }, ppd, tlStart };
    document.body.style.cursor = side==='move'?'grabbing':'ew-resize';
    document.body.style.userSelect = 'none';
  }
  function onMouseMove(e) {
    if (!drag) return;
    const dx   = e.clientX - drag.startX;
    const days = Math.round(dx / drag.ppd);
    if (days===0) return;
    const t = drag.task;
    if (drag.side==='move') {
      t.start_date = D.fmt(D.add(D.parse(drag.orig.s), days));
      t.end_date   = D.fmt(D.add(D.parse(drag.orig.e), days));
    } else if (drag.side==='right') {
      const ne = D.add(D.parse(drag.orig.e), days);
      if (ne > D.parse(t.start_date)) t.end_date = D.fmt(ne);
    } else {
      const ns = D.add(D.parse(drag.orig.s), days);
      if (ns < D.parse(t.end_date)) t.start_date = D.fmt(ns);
    }
    t.duration = D.diff(D.parse(t.start_date), D.parse(t.end_date)) + 1;
    markDirty();
    const container = document.getElementById('gp')?.parentElement;
    if (container) renderGantt(container);
  }
  function onMouseUp() {
    if (!drag) return;
    drag = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);

  // ── Panel resize ──────────────────────────────────────────────
  function setupPanelResize() {
    const pr   = document.getElementById('pr');
    const gl   = document.getElementById('gl');
    if (!pr||!gl) return;
    let startX, startW;
    pr.addEventListener('mousedown', e => {
      startX=e.clientX; startW=gl.offsetWidth;
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
    });
    document.addEventListener('mousemove', e => {
      if (!document.body.style.cursor.includes('col-resize')) return;
      const w = Math.max(180, Math.min(700, startW+(e.clientX-startX)));
      state.panelWidth = w; gl.style.width = w+'px';
    });
    document.addEventListener('mouseup', () => {
      if (document.body.style.cursor.includes('col-resize')) {
        document.body.style.cursor=''; document.body.style.userSelect='';
      }
    });
  }

  // ── Keyboard ─────────────────────────────────────────────────
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      const tgt = e.target;
      if (tgt.tagName==='INPUT'||tgt.tagName==='TEXTAREA'||tgt.isContentEditable) return;
      if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); save(); return; }
      if (e.key==='Delete'||e.key==='Backspace') deleteSelected();
      if (e.key==='t'||e.key==='T') addTask(false);
      if (e.key==='m'||e.key==='M') addTask(true);
      if (e.key==='Escape') { selectTask(null); hideCtx(); }
      if (e.key==='Tab') { e.preventDefault(); e.shiftKey?outdent():indent(); }
    });
  }

  // ── Task operations ───────────────────────────────────────────
  function addTask(isMilestone = false) {
    const today  = D.fmt(new Date());
    const newTask = {
      id:          crypto.randomUUID(),
      project_id:  state.projectId,
      parent_id:   null,
      name:        isMilestone ? 'New Milestone' : 'New Task',
      start_date:  today,
      end_date:    isMilestone ? today : D.fmt(D.add(new Date(),4)),
      duration:    isMilestone ? 1 : 5,
      progress:    0,
      is_milestone:isMilestone,
      collapsed:   false,
      sort_order:  state.tasks.length,
      dependencies:[],
    };
    if (state.selectedId) {
      const sel = state.tasks.find(t=>t.id===state.selectedId);
      if (sel) newTask.parent_id = hasChildren(sel.id) ? sel.id : sel.parent_id;
    }
    state.tasks.push(newTask);
    markDirty();
    selectTask(newTask.id);
    const container = document.getElementById('gp')?.parentElement;
    if (container) renderGantt(container);
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    const toRemove = new Set([state.selectedId, ...descendants(state.selectedId)]);
    state.tasks = state.tasks.filter(t => !toRemove.has(t.id));
    state.tasks.forEach(t => t.dependencies = (t.dependencies||[]).filter(d=>!toRemove.has(d)));
    state.selectedId = null;
    markDirty();
    const container = document.getElementById('gp')?.parentElement;
    if (container) renderGantt(container);
  }

  function indent() {
    if (!state.selectedId) return;
    const idx  = state.tasks.findIndex(t=>t.id===state.selectedId);
    if (idx<=0) return;
    const task = state.tasks[idx];
    const prev = state.tasks.slice(0,idx).reverse().find(t=>t.parent_id===task.parent_id);
    if (!prev) return;
    task.parent_id = prev.id;
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  function outdent() {
    if (!state.selectedId) return;
    const task = state.tasks.find(t=>t.id===state.selectedId);
    if (!task||!task.parent_id) return;
    const parent = state.tasks.find(t=>t.id===task.parent_id);
    task.parent_id = parent?.parent_id || null;
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  // ── Save ─────────────────────────────────────────────────────
  async function save() {
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled=true; btn.textContent='Saving…'; }
    try {
      await DB.bulkUpdateTasks(state.tasks);
      state.dirty = false;
      if (btn) btn.textContent = 'Saved';
      toast('Project saved ✓', 'success');
    } catch(e) {
      toast('Save failed: '+e.message, 'error');
      if (btn) { btn.disabled=false; btn.textContent='● Save'; }
    }
  }

  // ── Select / Detail ───────────────────────────────────────────
  function selectTask(id) {
    state.selectedId = id;
    document.querySelectorAll('.task-row').forEach(r => r.classList.toggle('selected', r.dataset.id===id));
    document.querySelectorAll('.gantt-bar').forEach(b => b.classList.toggle('selected', b.dataset.id===id));
    updateStatus();
    if (state.detailOpen && id) openDetail(id);
  }

  function openDetail(id) {
    state.selectedId = id;
    state.detailOpen = true;
    const panel = document.getElementById('detailPanel');
    if (!panel) return;
    panel.style.display = '';
    const task = state.tasks.find(t=>t.id===id);
    if (!task) return;
    const others = state.tasks.filter(t=>t.id!==id&&!descendants(id).includes(t.id));
    const curDeps = task.dependencies||[];
    panel.innerHTML = `
      <div style="padding:16px 16px 12px;border-bottom:1px solid #f1f3f4;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:14px;font-weight:600;color:#0f2d6b;">${esc(task.name)}</span>
        <button onclick="Gantt.closeDetail()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#80868b;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px;">
        <div class="form-group">
          <label>Task Name</label>
          <input class="input" id="det-name" value="${esc(task.name)}">
        </div>
        ${!task.is_milestone?`<div class="form-group">
          <label>Start Date</label>
          <input type="date" class="input" id="det-start" value="${task.start_date}">
        </div>`:''}
        <div class="form-group">
          <label>${task.is_milestone?'Date':'End Date'}</label>
          <input type="date" class="input" id="det-end" value="${task.end_date}">
        </div>
        ${!task.is_milestone?`<div class="form-group">
          <label>Progress — <b id="det-pct-lbl">${task.progress||0}%</b></label>
          <input type="range" min="0" max="100" value="${task.progress||0}" id="det-prog" style="width:100%;accent-color:#1a73e8" oninput="document.getElementById('det-pct-lbl').textContent=this.value+'%'">
        </div>`:''}
        <div class="form-group">
          <label>Dependencies <span style="font-size:11px;color:#80868b;">(tasks that must finish first)</span></label>
          <div style="border:1.5px solid #dadce0;border-radius:8px;overflow:hidden;">
            <input class="input" placeholder="Search tasks…" oninput="filterDeps(this.value)" style="border:none;border-bottom:1px solid #f1f3f4;border-radius:0;">
            <div id="dep-list" style="max-height:150px;overflow-y:auto;">
              ${others.map(o => `
                <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;font-size:13px;${curDeps.includes(o.id)?'background:#e8f0fe':''}">
                  <input type="checkbox" ${curDeps.includes(o.id)?'checked':''} value="${o.id}" onchange="Gantt.toggleDep('${id}','${o.id}',this.checked)" style="accent-color:#1a73e8">
                  ${esc(o.name)}
                </label>`).join('')}
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="textarea" id="det-notes" rows="3">${esc(task.notes||'')}</textarea>
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="Gantt.applyDetail('${id}')">Apply Changes</button>
      </div>`;
  }

  function closeDetail() {
    state.detailOpen = false;
    const panel = document.getElementById('detailPanel');
    if (panel) panel.style.display = 'none';
  }

  function toggleDetail() {
    if (state.detailOpen) closeDetail();
    else if (state.selectedId) openDetail(state.selectedId);
  }

  function applyDetail(id) {
    const task = state.tasks.find(t=>t.id===id);
    if (!task) return;
    task.name       = document.getElementById('det-name')?.value.trim() || task.name;
    task.start_date = document.getElementById('det-start')?.value || task.start_date;
    task.end_date   = document.getElementById('det-end')?.value   || task.end_date;
    task.progress   = parseInt(document.getElementById('det-prog')?.value||0);
    task.notes      = document.getElementById('det-notes')?.value || '';
    task.duration   = D.diff(D.parse(task.start_date), D.parse(task.end_date)) + 1;
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
    toast('Changes applied', 'success');
  }

  function toggleDep(taskId, depId, checked) {
    const task = state.tasks.find(t=>t.id===taskId);
    if (!task) return;
    const deps = task.dependencies || [];
    task.dependencies = checked ? [...deps, depId] : deps.filter(d=>d!==depId);
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  // ── Context menu ──────────────────────────────────────────────
  function showCtx(x, y, taskId) {
    hideCtx();
    const task   = state.tasks.find(t=>t.id===taskId);
    const idx    = state.tasks.findIndex(t=>t.id===taskId);
    const prev   = state.tasks.slice(0,idx).reverse().find(t=>t.parent_id===task?.parent_id);
    const menu   = document.createElement('div');
    menu.className = 'ctx-menu'; menu.id = 'ctx-menu';
    menu.style.left = Math.min(x, window.innerWidth-230)+'px';
    menu.style.top  = Math.min(y, window.innerHeight-260)+'px';
    menu.innerHTML  = `
      <div class="ctx-item" onclick="Gantt.openDetail('${taskId}');Gantt.hideCtx()">Edit Details…</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="Gantt.addTask(false);Gantt.hideCtx()">Add Task Below</div>
      <div class="ctx-item" onclick="Gantt.addTask(true);Gantt.hideCtx()">Add Milestone Below</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item${!prev?' disabled':''}" onclick="Gantt.indent();Gantt.hideCtx()">→ Indent</div>
      <div class="ctx-item${!task?.parent_id?' disabled':''}" onclick="Gantt.outdent();Gantt.hideCtx()">← Outdent</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="(()=>{const t=state.tasks.find(x=>x.id==='${taskId}');if(t){t.progress=100;Gantt.markDirty();const c=document.getElementById('gp')?.parentElement;if(c)Gantt.renderGantt(c);}})();Gantt.hideCtx()">✓ Mark Complete</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" onclick="Gantt.deleteSelected();Gantt.hideCtx()">Delete Task</div>`;
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', hideCtxOnce), 0);
  }
  function hideCtxOnce() { hideCtx(); document.removeEventListener('click', hideCtxOnce); }
  function hideCtx() { document.getElementById('ctx-menu')?.remove(); }

  // ── Zoom ─────────────────────────────────────────────────────
  function setZoom(z) {
    state.zoom = z;
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  function scrollToday() {
    const tls = document.getElementById('tls');
    if (!tls) return;
    const ppd   = ZOOM_PPD[state.zoom];
    const { start } = timelineRange(state.tasks);
    const off   = D.diff(start, new Date()) * ppd;
    tls.scrollLeft = Math.max(0, off - tls.clientWidth/2);
  }

  function markDirty() {
    state.dirty = true;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled=false; btn.textContent='● Save'; }
  }

  function updateStatus() {
    const leaf = state.tasks.filter(t=>!hasChildren(t.id)&&!t.is_milestone);
    const done = leaf.filter(t=>(t.progress||0)>=100).length;
    const sbT  = document.getElementById('sb-tasks');
    const sbS  = document.getElementById('sb-sel');
    if (sbT) sbT.innerHTML = `<b>${state.tasks.length}</b> tasks (${done} complete)`;
    if (sbS && state.selectedId) {
      const t = state.tasks.find(x=>x.id===state.selectedId);
      if (t) sbS.innerHTML = `Selected: <b>${esc(t.name)}</b>`;
    } else if (sbS) sbS.textContent = '';
  }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return {
    render, save, addTask, deleteSelected, indent, outdent,
    setZoom, scrollToday, openDetail, closeDetail, toggleDetail,
    applyDetail, toggleDep, showCtx, hideCtx, markDirty, renderGantt,
    // expose internal state for ctx menu inline onclick
    get state() { return state; },
  };
})();
