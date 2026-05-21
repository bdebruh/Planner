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
          const card = document.createElement('div');
          card.className = 'project-card';
          card.innerHTML = `
            <div class="project-card-accent" style="background:${p.color}"></div>
            <div class="project-card-body" style="cursor:pointer;" onclick="openProject('${p.id}')">
              <div class="project-card-title">${esc(p.name)}</div>
              <div class="project-card-desc">${esc(p.description || 'No description')}</div>
            </div>
            <div class="project-card-footer">
              <div style="font-size:11px;color:#80868b;margin-bottom:4px;">${p.progress}% complete · ${p.tasks.length} tasks</div>
              <div class="prog-bar"><div class="prog-fill" style="width:${p.progress}%;background:${p.color}"></div></div>
              <div style="display:flex;gap:6px;margin-top:10px;">
                <button class="proj-action-btn" onclick="event.stopPropagation();openProject('${p.id}')">Open</button>
                <button class="proj-action-btn" onclick="event.stopPropagation();Projects.showShareModal('${p.id}','${esc(p.name)}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
                <button class="proj-action-btn" onclick="event.stopPropagation();Projects.showNewProjectModal(${JSON.stringify({id:p.id,name:p.name,description:p.description||'',color:p.color})})">Edit</button>
              </div>
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

  async function showShareModal(projectId, projectName) {
    // Remove any existing modal
    document.querySelector('.modal-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <span class="modal-title">Share "${esc(projectName)}"</span>
          <button class="modal-close" onclick="this.closest('.modal-backdrop').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13.5px;color:#5f6368;margin-bottom:20px;line-height:1.6;">
            Generate an invite link. Anyone with the link can sign in and access this project.
          </p>

          <div style="display:flex;gap:8px;margin-bottom:20px;">
            <select id="share-role" style="padding:8px 12px;border-radius:8px;border:1.5px solid #dadce0;font-size:13px;font-family:inherit;color:#0f2d6b;background:#fff;outline:none;">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button class="btn btn-primary" id="genLinkBtn" style="flex:1;" onclick="Projects._generateLink('${projectId}')">
              Generate invite link
            </button>
          </div>

          <div id="share-link-wrap" style="display:none;">
            <div style="font-size:12px;font-weight:600;color:#5f6368;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Invite Link</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="share-link-input" readonly style="flex:1;padding:9px 12px;border-radius:8px;border:1.5px solid #dadce0;font-size:12.5px;font-family:monospace;color:#0f2d6b;background:#f8f9fa;outline:none;">
              <button class="btn btn-primary" onclick="Projects._copyLink()">Copy</button>
            </div>
            <p style="font-size:12px;color:#80868b;margin-top:8px;">Link expires in 30 days. Send it to your research assistants.</p>
          </div>

          <div id="share-existing" style="margin-top:20px;"></div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', e => { if(e.target===backdrop) backdrop.remove(); });

    // Load existing tokens
    _loadExistingTokens(projectId);
  }

  async function _loadExistingTokens(projectId) {
    const wrap = document.getElementById('share-existing');
    if (!wrap) return;
    try {
      const tokens = await DB.getShareTokens(projectId);
      const active = tokens.filter(t => new Date(t.expires_at) > new Date());
      if (!active.length) return;
      wrap.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:#5f6368;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;">Active Invite Links</div>
        ${active.map(t => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8f9fa;border-radius:8px;margin-bottom:6px;font-size:12.5px;">
            <span style="color:#0f2d6b;">
              ${t.role === 'editor' ? 'Can edit' : 'Can view'} ·
              expires ${new Date(t.expires_at).toLocaleDateString()}
            </span>
            <div style="display:flex;gap:6px;">
              <button class="proj-action-btn" onclick="Projects._copyLinkById('${t.id}')">Copy</button>
              <button class="proj-action-btn danger" onclick="Projects._revokeToken('${t.id}','${projectId}')">Revoke</button>
            </div>
          </div>`).join('')}
      `;
    } catch(e) {}
  }

  async function _generateLink(projectId) {
    const btn  = document.getElementById('genLinkBtn');
    const role = document.getElementById('share-role')?.value || 'editor';
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const token = await DB.createShareToken(projectId, role);
      const link  = `${window.location.origin}${window.location.pathname}?join=${token.id}`;
      const wrap  = document.getElementById('share-link-wrap');
      const input = document.getElementById('share-link-input');
      if (wrap) wrap.style.display = '';
      if (input) input.value = link;
      btn.textContent = 'Generate another';
      btn.disabled = false;
      _loadExistingTokens(projectId);
    } catch(e) {
      alert('Failed to generate link: ' + e.message);
      btn.textContent = 'Generate invite link';
      btn.disabled = false;
    }
  }

  function _copyLink() {
    const input = document.getElementById('share-link-input');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => toast('Link copied!', 'success'));
  }

  function _copyLinkById(tokenId) {
    const link = `${window.location.origin}${window.location.pathname}?join=${tokenId}`;
    navigator.clipboard.writeText(link).then(() => toast('Link copied!', 'success'));
  }

  async function _revokeToken(tokenId, projectId) {
    if (!confirm('Revoke this invite link? Anyone who hasn\'t joined yet won\'t be able to use it.')) return;
    try {
      await DB.deleteShareToken(tokenId);
      toast('Link revoked.', '');
      _loadExistingTokens(projectId);
    } catch(e) { alert(e.message); }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, showNewProjectModal, showShareModal, _generateLink, _copyLink, _copyLinkById, _revokeToken };
})();
