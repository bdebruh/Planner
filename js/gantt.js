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
    if (!projectId) { container.innerHTML = '<div class="page"><p style="padding:60px;text-align:center;color:#80868b;">Select a project to open its Gantt chart.</p></div>'; return; }
    state.projectId = projectId;
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading…</div>';

    try {
      const [projects, tasks, phases] = await Promise.all([
        DB.getProjects(), DB.getTasks(projectId), DB.getPhases(projectId)
      ]);
      state.project = projects.find(p => p.id === projectId);
      state.tasks   = tasks;
      state.phases  = phases;
      renderGantt(container);
    } catch(e) {
      container.innerHTML = `<div class="page"><p style="color:#b91c1c;">${e.message}</p></div>`;
    }
  }

  // ── Task color (inherits from top-level parent) ───────────────
  function getTaskColor(task) {
    if (task.color) return task.color;
    if (task.parent_id) {
      const parent = state.tasks.find(t => t.id === task.parent_id);
      if (parent) return getTaskColor(parent);
    }
    return state.project?.color || '#1a73e8';
  }

  function renderGantt(container) {
    const ppd = ZOOM_PPD[state.zoom];
    const vis  = visible(state.tasks);
    const { start, total } = state.tasks.length
      ? timelineRange(state.tasks)
      : { start: D.add(new Date(),-14), total: 90 };
    const totalW = total * ppd;

    container.style.height   = 'calc(100vh - 56px)';
    container.style.overflow = 'hidden';

    container.innerHTML = `
      <div class="gantt-page" id="gp">
        <!-- Toolbar -->
        <div class="gantt-toolbar" id="gt">
          <button class="btn btn-ghost btn-sm" onclick="showView('projects')" style="color:#1a5aa8;">← Projects</button>
          <div class="tb-sep"></div>
          <span style="font-size:14px;font-weight:700;color:#0f2d6b;margin-right:8px;">${esc(state.project?.name || '')}</span>
          <div class="tb-sep"></div>
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
          <button class="btn btn-ghost btn-sm" onclick="Gantt.showPhasesModal()">⬛ Phases</button>
          <button class="btn btn-ghost btn-sm" onclick="Gantt.toggleDetail()" id="btn-detail">Details</button>
          <span id="btn-save" style="font-size:12px;color:#80868b;min-width:60px;text-align:right;">Saved ✓</span>
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
            <!-- Detail panel — floating card -->
            <div id="detailPanel" style="display:none;position:absolute;right:16px;top:12px;width:340px;max-height:calc(100% - 24px);background:#fff;border-radius:14px;border:1px solid rgba(15,45,107,.12);overflow-y:auto;box-shadow:0 8px 32px rgba(15,45,107,.18);z-index:40;"></div>
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
    renderPhases(start, total, ppd);  // phases first = behind bars
    renderBars(start, ppd, vis);      // bars on top
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
      const done = !t.is_milestone && (t.progress || 0) >= 100;
      const row = document.createElement('div');
      row.className = `task-row${t.id===state.selectedId?' selected':''}${isGroup?' is-group':''}${done?' done':''}`;
      row.dataset.id = t.id;
      const taskColor = getTaskColor(t);
      row.innerHTML = `
        <div class="tr-num" style="position:relative;">
          ${!t.is_milestone ? `<input type="checkbox" ${done?'checked':''}
            onclick="event.stopPropagation();Gantt.toggleDone('${t.id}',this.checked)"
            style="width:14px;height:14px;cursor:pointer;accent-color:${taskColor};">`
          : `<span style="font-size:10px;color:${taskColor};">◆</span>`}
        </div>
        <div class="tr-name-wrap" style="padding-left:${depth*14}px">
          ${isGroup?`<button class="tr-toggle${t.collapsed?' collapsed':''}" data-tog="${t.id}">▾</button>`:'<span style="width:16px;display:inline-block"></span>'}
          <span class="tr-name-text" title="${esc(t.name)}" style="${done?'text-decoration:line-through;color:#b0b0b5;':''}">${esc(t.name)}</span>
        </div>
        <div class="tr-cell" style="${done?'color:#b0b0b5;':''}">${dur}</div>
        <div class="tr-cell" style="${done?'color:#b0b0b5;':''}">${D.disp(D.parse(t.start_date))}</div>
        <div class="tr-cell" style="${done?'color:#b0b0b5;':''}">${D.disp(D.parse(t.end_date))}</div>
        <div class="tr-pct" style="${done?'color:#1e8e3e;font-weight:700;':''}">${done?'✓':(t.progress||0)+'%'}</div>`;

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
    // Remove existing bar rows
    body.querySelectorAll('.bar-row').forEach(el => el.remove());

    vis.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'bar-row' + (t.id===state.selectedId?' selected':'');
      row.style.cssText = `position:absolute;top:${i*ROW_H}px;left:0;right:0;height:${ROW_H}px`;
      row.dataset.id = t.id;

      if (t.is_milestone) {
        const off   = D.diff(start, D.parse(t.end_date));
        const mColor = getTaskColor(t);
        const wrap  = document.createElement('div');
        wrap.className = 'milestone-wrap';
        wrap.style.left = `${off*ppd+ppd/2-8}px`;
        wrap.innerHTML  = `<div class="milestone-diamond${t.id===state.selectedId?' selected':''}" style="background:${mColor};box-shadow:0 1px 4px ${mColor}66;"></div>`;
        wrap.addEventListener('click', e => { e.stopPropagation(); selectTask(t.id); });
        wrap.addEventListener('contextmenu', e => { e.preventDefault(); selectTask(t.id); showCtx(e.clientX, e.clientY, t.id); });
        row.appendChild(wrap);
      } else {
        const so   = D.diff(start, D.parse(t.start_date));
        const dur  = D.diff(D.parse(t.start_date), D.parse(t.end_date)) + 1;
        const left = so * ppd;
        const w    = Math.max(dur * ppd - 2, 4);
        const isGrp  = hasChildren(t.id);
        const color  = getTaskColor(t);
        const done   = (t.progress || 0) >= 100;
        const barColor = done ? '#b0b8c1' : (isGrp ? color+'cc' : color);

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
        barEl.addEventListener('dblclick', e => { e.stopPropagation(); openDetail(t.id); });
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

  // ── Phases / Periods of Performance — behind bars ─────────────
  function renderPhases(start, total, ppd) {
    const body = document.getElementById('tlb');
    if (!body) return;
    body.querySelectorAll('.phase-band, .pop-shade, .pop-line, .pop-day-shade').forEach(e => e.remove());

    const phases = state.phases || [];
    if (!phases.length) return;

    const bodyH = Math.max(visible(state.tasks).length * ROW_H + 60, 200);

    phases.forEach(ph => {
      const x = Math.max(0, D.diff(start, D.parse(ph.start_date))) * ppd;
      const w = (Math.min(total, D.diff(start, D.parse(ph.end_date)) + 1) * ppd) - x;
      if (w <= 0) return;

      // Band — sits behind bars (rendered before bars in DOM)
      const band = document.createElement('div');
      band.className = 'phase-band';
      band.style.cssText = `
        position:absolute; left:${x}px; width:${w}px; top:0; height:${bodyH}px;
        background:${ph.color}20;
        border-left:3px solid ${ph.color};
        border-right:1px solid ${ph.color}55;
        pointer-events:none; box-sizing:border-box;`;

      // Name label
      const lbl = document.createElement('div');
      lbl.style.cssText = `
        position:absolute; top:5px; left:7px;
        padding:2px 9px; border-radius:4px;
        background:${ph.color}; color:#fff;
        font-size:10px; font-weight:700; letter-spacing:.05em;
        text-transform:uppercase; white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis;
        max-width:calc(100% - 14px);`;
      lbl.textContent = ph.name;
      band.appendChild(lbl);
      body.appendChild(band);
    });
  }

  // renderPopLines no longer needed — phases ARE the PoPs
  function renderPopLines() {}

  // ── Period-of-performance shading ────────────────────────────
  function renderPopLines(start, total, ppd) {
    const body = document.getElementById('tlb');
    const days  = document.getElementById('tld');
    body.querySelectorAll('.pop-shade,.pop-line').forEach(e => e.remove());
    days?.querySelectorAll('.pop-day-shade').forEach(e => e.remove());

    const proj = state.project;
    if (!proj || (!proj.start_date && !proj.end_date)) return;

    const bodyH = (visible(state.tasks).length * ROW_H + 60);
    const totalW = total * ppd;

    const popStart = proj.start_date ? D.diff(start, D.parse(proj.start_date)) * ppd : 0;
    const popEnd   = proj.end_date   ? (D.diff(start, D.parse(proj.end_date)) + 1) * ppd : totalW;

    // Grey out OUTSIDE period (before start + after end)
    const greyStyle = `background:rgba(0,0,0,0.07);pointer-events:none;z-index:0;`;
    if (proj.start_date && popStart > 0) {
      const s = document.createElement('div');
      s.className = 'pop-shade';
      s.style.cssText = `position:absolute;left:0;width:${popStart}px;top:0;height:${bodyH}px;${greyStyle}`;
      body.appendChild(s);
      if (days) {
        const d = document.createElement('div');
        d.className = 'pop-day-shade';
        d.style.cssText = `position:absolute;left:0;width:${popStart}px;top:0;bottom:0;background:rgba(0,0,0,0.07);pointer-events:none;`;
        days.appendChild(d);
      }
    }
    if (proj.end_date && popEnd < totalW) {
      const s = document.createElement('div');
      s.className = 'pop-shade';
      s.style.cssText = `position:absolute;left:${popEnd}px;width:${totalW-popEnd}px;top:0;height:${bodyH}px;${greyStyle}`;
      body.appendChild(s);
      if (days) {
        const d = document.createElement('div');
        d.className = 'pop-day-shade';
        d.style.cssText = `position:absolute;left:${popEnd}px;width:${totalW-popEnd}px;top:0;bottom:0;background:rgba(0,0,0,0.07);pointer-events:none;`;
        days.appendChild(d);
      }
    }

    // Highlight the ACTIVE period with a very light blue tint
    if (proj.start_date && proj.end_date) {
      const activeW = popEnd - popStart;
      if (activeW > 0) {
        const active = document.createElement('div');
        active.className = 'pop-shade';
        active.style.cssText = `position:absolute;left:${popStart}px;width:${activeW}px;top:0;height:${bodyH}px;
          background:rgba(26,115,232,0.03);pointer-events:none;z-index:0;`;
        body.appendChild(active);
      }
    }

    // Project start boundary line
    if (proj.start_date) {
      const x = D.diff(start, D.parse(proj.start_date)) * ppd;
      const line = document.createElement('div');
      line.className = 'pop-line';
      line.style.cssText = `position:absolute;left:${x}px;top:0;height:${bodyH}px;
        width:2px;background:#1e8e3e;z-index:8;pointer-events:none;`;
      line.innerHTML = `<span style="position:absolute;top:3px;left:4px;font-size:9.5px;
        font-weight:700;color:#1e8e3e;white-space:nowrap;background:rgba(255,255,255,.9);
        padding:1px 5px;border-radius:3px;border:1px solid #1e8e3e;">Start</span>`;
      body.appendChild(line);
    }

    // Project end boundary line
    if (proj.end_date) {
      const x = (D.diff(start, D.parse(proj.end_date)) + 1) * ppd;
      const line = document.createElement('div');
      line.className = 'pop-line';
      line.style.cssText = `position:absolute;left:${x}px;top:0;height:${bodyH}px;
        width:2px;background:#d93025;z-index:8;pointer-events:none;`;
      line.innerHTML = `<span style="position:absolute;top:3px;left:4px;font-size:9.5px;
        font-weight:700;color:#d93025;white-space:nowrap;background:rgba(255,255,255,.9);
        padding:1px 5px;border-radius:3px;border:1px solid #d93025;">End</span>`;
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
      t.end_date   = D.fmt(D.add(D.parse(drag.orig.e), days));
      t.start_date = t.is_milestone ? t.end_date : D.fmt(D.add(D.parse(drag.orig.s), days));
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
    clearTimeout(_saveTimer);
    const ind = document.getElementById('btn-save');
    if (ind) { ind.textContent = 'Saving…'; ind.style.color = '#80868b'; }
    try {
      await DB.bulkUpdateTasks(state.tasks);
      state.dirty = false;
      if (ind) { ind.textContent = 'Saved ✓'; ind.style.color = '#1e8e3e'; }
    } catch(e) {
      toast('Save failed: '+e.message, 'error');
      if (ind) { ind.textContent = 'Save failed'; ind.style.color = '#b91c1c'; }
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

  async function openDetail(id) {
    state.selectedId = id;
    state.detailOpen = true;
    const panel = document.getElementById('detailPanel');
    if (!panel) return;
    panel.style.display = '';
    const task = state.tasks.find(t=>t.id===id);
    if (!task) return;
    const others   = state.tasks.filter(t=>t.id!==id&&!descendants(id).includes(t.id));
    const curDeps  = task.dependencies||[];

    // Load members + current assignees in parallel
    const [members, assignedIds] = await Promise.all([
      DB.getProjectMembers(state.projectId).catch(() => []),
      DB.getTaskAssignees(id).catch(() => []),
    ]);

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
        ${colorPickerHtml(id, task.color)}
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
        ${members.length ? `
        <div class="form-group">
          <label>Assigned To</label>
          <div style="display:flex;flex-direction:column;gap:6px;border:1.5px solid #dadce0;border-radius:8px;padding:8px;">
            ${members.map(m => `
              <label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;padding:3px 4px;border-radius:6px;${assignedIds.includes(m.id)?'background:#e8f0fe':''}">
                <input type="checkbox" value="${m.id}" ${assignedIds.includes(m.id)?'checked':''}
                  onchange="Gantt.toggleAssignee('${id}','${m.id}',this.checked)"
                  style="accent-color:#1a5aa8;width:14px;height:14px;cursor:pointer;">
                ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">` : `<span style="width:22px;height:22px;border-radius:50%;background:#0f3460;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${(m.full_name||m.username||'?')[0].toUpperCase()}</span>`}
                <span style="color:#0f2d6b;">${esc(m.full_name || m.username || 'Unknown')}</span>
              </label>`).join('')}
          </div>
          ${members.length === 1 ? `<div style="font-size:11.5px;color:#80868b;margin-top:4px;">Share the project to add more team members.</div>` : ''}
        </div>` : `
        <div class="form-group">
          <label>Assigned To</label>
          <div style="font-size:13px;color:#80868b;padding:8px;border:1.5px solid #dadce0;border-radius:8px;">
            No team members yet. Use the <strong>Share</strong> button on the project card to invite people.
          </div>
        </div>`}
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
    task.name     = document.getElementById('det-name')?.value.trim() || task.name;
    task.end_date = document.getElementById('det-end')?.value || task.end_date;
    task.notes    = document.getElementById('det-notes')?.value || '';
    if (task.is_milestone) {
      task.start_date = task.end_date; // milestone = single date
    } else {
      task.start_date = document.getElementById('det-start')?.value || task.start_date;
      task.progress   = parseInt(document.getElementById('det-prog')?.value || 0);
    }
    task.duration = D.diff(D.parse(task.start_date), D.parse(task.end_date)) + 1;
    rollupProgress(task.parent_id);
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  // ── Roll up progress from leaf tasks to parents ───────────────
  function rollupProgress(parentId) {
    if (!parentId) return;
    const parent = state.tasks.find(t => t.id === parentId);
    if (!parent) return;
    const children = state.tasks.filter(t => t.parent_id === parentId && !t.is_milestone);
    if (children.length) {
      // Duration-weighted average
      const totalDur = children.reduce((s, t) => s + Math.max(1, t.duration || 1), 0);
      parent.progress = Math.round(
        children.reduce((s, t) => s + (t.progress || 0) * Math.max(1, t.duration || 1), 0) / totalDur
      );
      rollupProgress(parent.parent_id); // recurse up the tree
    }
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

  let _saveTimer = null;
  function markDirty() {
    state.dirty = true;
    const ind = document.getElementById('btn-save');
    if (ind) { ind.textContent = 'Saving…'; ind.style.color = '#80868b'; }
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        await DB.bulkUpdateTasks(state.tasks);
        state.dirty = false;
        const ind2 = document.getElementById('btn-save');
        if (ind2) { ind2.textContent = 'Saved ✓'; ind2.style.color = '#1e8e3e'; }
      } catch(e) {
        const ind2 = document.getElementById('btn-save');
        if (ind2) { ind2.textContent = 'Save failed'; ind2.style.color = '#b91c1c'; }
      }
    }, 1500);
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

  function toggleDone(taskId, checked) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.progress = checked ? 100 : 0;
    rollupProgress(task.parent_id);
    markDirty();
    const c = document.getElementById('gp')?.parentElement;
    if (c) renderGantt(c);
  }

  async function toggleAssignee(taskId, userId, checked) {
    try {
      const current = await DB.getTaskAssignees(taskId);
      const updated = checked
        ? [...new Set([...current, userId])]
        : current.filter(id => id !== userId);
      await DB.setTaskAssignees(taskId, updated);
      // Update highlight in panel
      const label = document.querySelector(`input[value="${userId}"]`)?.closest('label');
      if (label) label.style.background = checked ? '#e8f0fe' : '';
    } catch(e) { console.error(e); }
  }

  // ── Phases modal ──────────────────────────────────────────────
  const COLORS = ['#1a73e8','#1e8e3e','#e37400','#d93025','#9334e6','#007b83','#0f3460','#f29900','#c5221f','#137333'];

  function showPhasesModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.id = 'phases-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:560px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
        <div class="modal-header">
          <span class="modal-title">Periods of Performance</span>
          <button class="modal-close" onclick="document.getElementById('phases-backdrop').remove()">✕</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;flex:1;">
          <p style="font-size:13px;color:#5f6368;margin-bottom:16px;line-height:1.6;">
            Each period appears as a colored band on the Gantt behind the task bars. Add as many as you need.
          </p>
          <div id="phases-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;"></div>
          <button class="btn btn-ghost" onclick="Gantt.addPhaseRow()">+ Add Period</button>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('phases-backdrop').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="Gantt.savePhasesFromModal()">Save</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', e => { if(e.target===backdrop) backdrop.remove(); });
    renderPhasesList();
  }

  function renderPhasesList() {
    const list = document.getElementById('phases-list');
    if (!list) return;
    const phases = state.phases || [];
    if (!phases.length) {
      list.innerHTML = '<div style="font-size:13px;color:#80868b;">No phases yet. Click + Add Phase to create one.</div>';
      return;
    }
    list.innerHTML = phases.map((ph, i) => `
      <div style="display:grid;grid-template-columns:1fr 100px 100px 28px 28px;gap:8px;align-items:center;background:#f8f9fa;border-radius:8px;padding:8px 10px;">
        <input class="input" value="${esc(ph.name)}" placeholder="Phase name" oninput="Gantt.updatePhaseField(${i},'name',this.value)" style="font-size:13px;">
        <input type="date" class="input" value="${ph.start_date}" oninput="Gantt.updatePhaseField(${i},'start_date',this.value)" style="font-size:12px;">
        <input type="date" class="input" value="${ph.end_date}" oninput="Gantt.updatePhaseField(${i},'end_date',this.value)" style="font-size:12px;">
        <input type="color" value="${ph.color}" oninput="Gantt.updatePhaseField(${i},'color',this.value)" style="width:28px;height:28px;border:none;padding:0;cursor:pointer;border-radius:4px;">
        <button onclick="Gantt.deletePhaseRow(${i})" style="background:none;border:none;cursor:pointer;font-size:16px;color:#b91c1c;line-height:1;">×</button>
      </div>`).join('');
  }

  function updatePhaseField(idx, field, val) {
    if (!state.phases[idx]) return;
    state.phases[idx][field] = val;
  }

  function addPhaseRow() {
    const today = D.fmt(new Date());
    state.phases.push({
      id: crypto.randomUUID(),
      project_id: state.projectId,
      name: 'New Phase',
      start_date: today,
      end_date: D.fmt(D.add(new Date(), 30)),
      color: COLORS[state.phases.length % COLORS.length],
      sort_order: state.phases.length,
    });
    renderPhasesList();
  }

  async function deletePhaseRow(idx) {
    const ph = state.phases[idx];
    if (ph?.id) {
      try { await DB.deletePhase(ph.id); } catch(e) {}
    }
    state.phases.splice(idx, 1);
    renderPhasesList();
    const c = document.getElementById('gp')?.parentElement;
    if (c) { const {start,total} = state.tasks.length ? timelineRange(state.tasks) : {start:D.add(new Date(),-14),total:90}; const ppd=ZOOM_PPD[state.zoom]; renderPhases(start,total,ppd); }
  }

  async function savePhasesFromModal() {
    try {
      for (const ph of state.phases) {
        if (!ph.name || !ph.start_date || !ph.end_date) continue;
        await DB.upsertPhase(ph);
      }
      const c = document.getElementById('gp')?.parentElement;
      if (c) renderGantt(c);
      document.getElementById('phases-backdrop')?.remove();
      toast('Phases saved ✓', 'success');
    } catch(e) { toast('Save failed: ' + e.message, 'error'); }
  }

  async function savePopDates() {
    const start = document.getElementById('pop-start')?.value || null;
    const end   = document.getElementById('pop-end')?.value || null;
    try {
      await DB.updateProject(state.projectId, { start_date: start, end_date: end });
      if (state.project) { state.project.start_date = start; state.project.end_date = end; }
      // Save phases too
      await savePhasesFromModal();
    } catch(e) { toast('Save failed: ' + e.message, 'error'); }
  }

  // ── Task color picker in detail ───────────────────────────────
  function colorPickerHtml(taskId, currentColor) {
    return `
      <div class="form-group">
        <label>Color <span style="font-size:11px;color:#80868b;">(sets color for this group and its children)</span></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${COLORS.map(c => `
            <div onclick="Gantt.setTaskColor('${taskId}','${c}')"
              style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;
              box-shadow:${(currentColor||state.project?.color)===c?'0 0 0 3px #0f3460':'none'};
              transition:box-shadow .12s;" title="${c}"></div>`).join('')}
          <input type="color" value="${currentColor||state.project?.color||'#1a73e8'}"
            oninput="Gantt.setTaskColor('${taskId}',this.value)"
            style="width:28px;height:28px;border:none;padding:0;cursor:pointer;border-radius:4px;margin-left:4px;" title="Custom color">
        </div>
      </div>`;
  }

  function setTaskColor(taskId, color) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.color = color;
    markDirty();
    // Re-render just bars for performance
    const { start, total } = state.tasks.length ? timelineRange(state.tasks) : { start: D.add(new Date(),-14), total:90 };
    const ppd = ZOOM_PPD[state.zoom];
    const vis = visible(state.tasks);
    renderBars(start, ppd, vis);
    renderTasks();
    // Update color swatches
    document.querySelectorAll('[onclick^="Gantt.setTaskColor"]').forEach(el => {
      const c = el.getAttribute('onclick').match(/'([^']+)'$/)?.[1];
      if (c) el.style.boxShadow = c === color ? '0 0 0 3px #0f3460' : 'none';
    });
  }

  return {
    render, save, addTask, deleteSelected, indent, outdent,
    setZoom, scrollToday, openDetail, closeDetail, toggleDetail,
    applyDetail, toggleDep, toggleDone, toggleAssignee, showCtx, hideCtx, markDirty, renderGantt,
    showPhasesModal, savePopDates, savePhasesFromModal, addPhaseRow, deletePhaseRow,
    updatePhaseField, setTaskColor,
    // expose internal state for ctx menu inline onclick
    get state() { return state; },
  };
})();
