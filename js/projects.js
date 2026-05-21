// ── Projects view ─────────────────────────────────────────────
const Projects = (() => {

  const COLORS = ['#1a73e8','#1e8e3e','#e37400','#d93025','#9334e6','#007b83','#0f3460'];

  function calcProgress(tasks) {
    const leaf = tasks.filter(t => !tasks.some(c => c.parent_id === t.id) && !t.is_milestone);
    if (!leaf.length) return 0;
    return Math.round(leaf.reduce((s, t) => s + (t.progress || 0), 0) / leaf.length);
  }

  async function render(container) {
    container.innerHTML = '<div class="page"><div style="text-align:center;padding:60px;color:#80868b;">Loading projects…</div></div>';
    try {
      const projects = await DB.getProjects();

      // Fetch task progress for each project
      const projectsWithProgress = await Promise.all(projects.map(async p => {
        const tasks = await DB.getTasks(p.id).catch(() => []);
        return { ...p, tasks, progress: calcProgress(tasks) };
      }));

      container.innerHTML = '';
      const page = document.createElement('div');
      page.className = 'page';

      page.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Projects</h1>
            <p class="page-sub">${projects.length} ${projects.length === 1 ? 'project' : 'projects'}</p>
          </div>
          <button class="btn btn-primary" id="newProjectBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
            New Project
          </button>
        </div>
        <div class="project-grid" id="projectGrid"></div>`;

      container.appendChild(page);

      const grid = document.getElementById('projectGrid');

      if (!projects.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">📋</div>
          <h3>No projects yet</h3>
          <p>Create your first project to start planning with the Gantt chart.</p>
        </div>`;
      } else {
        projectsWithProgress.forEach(p => {
          const card = document.createElement('a');
          card.className = 'project-card';
          card.href = '#';
          card.onclick = (e) => { e.preventDefault(); openProject(p.id); };
          card.innerHTML = `
            <div class="project-card-accent" style="background:${p.color}"></div>
            <div class="project-card-body">
              <div class="project-card-title">${esc(p.name)}</div>
              <div class="project-card-desc">${esc(p.description || 'No description')}</div>
            </div>
            <div class="project-card-footer">
              <div style="font-size:11px;color:#80868b;margin-bottom:4px;">${p.progress}% complete · ${p.tasks.length} tasks</div>
              <div class="prog-bar"><div class="prog-fill" style="width:${p.progress}%;background:${p.color}"></div></div>
            </div>`;
          grid.appendChild(card);
        });
      }

      // New project card
      const nc = document.createElement('div');
      nc.className = 'new-project-card';
      nc.onclick = () => showNewProjectModal();
      nc.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 5v14M5 12h14"/></svg><span style="font-size:14px;font-weight:500;">New Project</span>`;
      grid.appendChild(nc);

      document.getElementById('newProjectBtn').onclick = showNewProjectModal;

    } catch(e) {
      container.innerHTML = `<div class="page"><p style="color:#b91c1c;padding:40px;">Error loading projects: ${e.message}</p></div>`;
    }
  }

  function showNewProjectModal(existing) {
    let selected = existing?.color || COLORS[0];
    const isEdit = !!existing;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${isEdit ? 'Edit Project' : 'New Project'}</span>
          <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Project name *</label>
            <input class="input" id="mp-name" value="${esc(existing?.name || '')}" placeholder="e.g. Dissertation Chapter 2" autofocus>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea class="textarea" id="mp-desc" rows="2">${esc(existing?.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Color</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;" id="mp-colors">
              ${COLORS.map(c => `<div onclick="document.querySelectorAll('.color-sw').forEach(x=>x.style.boxShadow='');this.style.boxShadow='0 0 0 3px #0f3460';window._selColor='${c}'" class="color-sw" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;box-shadow:${c===selected?'0 0 0 3px #0f3460':'none'}"></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn btn-primary" id="mp-save">${isEdit ? 'Save Changes' : 'Create Project'}</button>
        </div>
      </div>`;

    window._selColor = selected;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', e => { if(e.target===backdrop) backdrop.remove(); });

    document.getElementById('mp-save').onclick = async () => {
      const name = document.getElementById('mp-name').value.trim();
      if (!name) { document.getElementById('mp-name').focus(); return; }
      const btn = document.getElementById('mp-save');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        if (isEdit) {
          await DB.updateProject(existing.id, { name, description: document.getElementById('mp-desc').value.trim(), color: window._selColor });
          toast('Project updated', 'success');
        } else {
          const p = await DB.createProject({ name, description: document.getElementById('mp-desc').value.trim(), color: window._selColor });
          backdrop.remove();
          openProject(p.id);
          return;
        }
        backdrop.remove();
        showView('projects');
      } catch(e) {
        toast(e.message, 'error');
        btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Create Project';
      }
    };

    document.getElementById('mp-name').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('mp-save').click(); });
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, showNewProjectModal };
})();
