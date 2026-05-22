// ── Dashboard ──────────────────────────────────────────────────
const Dashboard = (() => {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = n => '$' + Math.abs(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtDate = d => {
    if (!d) return '—';
    const [y,m,day] = d.slice(0,10).split('-');
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+parseInt(day);
  };

  async function render(container) {
    container.innerHTML = '<div style="padding:60px;text-align:center;color:#80868b;">Loading dashboard…</div>';
    try {
      const [projects, papers] = await Promise.all([
        DB.getProjects(),
        DB.client.from('papers').select('*').order('created_at',{ascending:false}).then(r=>r.data||[]),
      ]);

      // Load tasks for all projects
      const allTasks = [];
      for (const p of projects) {
        const tasks = await DB.getTasks(p.id).catch(()=>[]);
        tasks.forEach(t => allTasks.push({...t, _projectName:p.name, _projectColor:p.color, _projectId:p.id}));
      }

      // Load budgets
      const allGrants = [];
      for (const p of projects) {
        const g = await DB.getGrants(p.id).catch(()=>[]);
        allGrants.push(...g);
      }

      const today      = new Date();
      const todayStr   = today.toISOString().slice(0,10);
      const in7        = new Date(today); in7.setDate(today.getDate()+7);
      const in7Str     = in7.toISOString().slice(0,10);

      const leafTasks  = allTasks.filter(t => !t.is_milestone && !allTasks.some(c=>c.parent_id===t.id));
      const overdue    = leafTasks.filter(t => t.end_date < todayStr && (t.progress||0) < 100);
      const dueWeek    = leafTasks.filter(t => t.end_date >= todayStr && t.end_date <= in7Str && (t.progress||0) < 100);
      const totalProgress = leafTasks.length ? Math.round(leafTasks.reduce((s,t)=>s+(t.progress||0),0)/leafTasks.length) : 0;
      const totalBudget = allGrants.reduce((s,g)=>s+Number(g.total_budget||0),0);

      let html = '<div style="max-width:1100px;margin:0 auto;padding:28px 24px;">';

      // Header
      html += '<div style="margin-bottom:24px;">';
      html += '<h1 style="font-size:22px;font-weight:700;color:#0f2d6b;letter-spacing:-.3px;margin-bottom:2px;">Dashboard</h1>';
      html += '<p style="font-size:13px;color:#80868b;">Research overview — ' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '</p>';
      html += '</div>';

      // Summary cards
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px;margin-bottom:24px;">';
      html += summaryCard('Projects',      projects.length,          'Active',          '#1a5aa8');
      html += summaryCard('Tasks Overdue', overdue.length,           'Need attention',  overdue.length>0?'#ef4444':'#1e8e3e');
      html += summaryCard('Due This Week', dueWeek.length,           'Upcoming',        dueWeek.length>0?'#f59e0b':'#1e8e3e');
      html += summaryCard('Overall Progress', totalProgress+'%',     'Across all tasks','#0f2d6b');
      html += summaryCard('Papers',        papers.length,            papers.filter(p=>p.work_status==='Active').length+' active', '#9334e6');
      html += summaryCard('Total Budget',  fmt(totalBudget),         allGrants.length+' grant'+(allGrants.length!==1?'s':''), '#1e8e3e');
      html += '</div>';

      const twoCol = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">';
      html += twoCol;

      // Overdue tasks
      html += card('🔴 Overdue Tasks', overdue.length === 0
        ? '<div style="padding:16px;font-size:13px;color:#80868b;text-align:center;">All caught up! No overdue tasks.</div>'
        : overdue.slice(0,6).map(t =>
            taskRow(t.name, t._projectName, t._projectColor, t.end_date, t.progress||0)
          ).join('') + (overdue.length>6?'<div style="padding:10px 16px;font-size:12px;color:#80868b;">+ '+(overdue.length-6)+' more</div>':'')
      );

      // Due this week
      html += card('🟡 Due This Week', dueWeek.length === 0
        ? '<div style="padding:16px;font-size:13px;color:#80868b;text-align:center;">Nothing due this week.</div>'
        : dueWeek.slice(0,6).map(t =>
            taskRow(t.name, t._projectName, t._projectColor, t.end_date, t.progress||0)
          ).join('') + (dueWeek.length>6?'<div style="padding:10px 16px;font-size:12px;color:#80868b;">+ '+(dueWeek.length-6)+' more</div>':'')
      );

      html += '</div>';

      // Projects progress
      html += card('📋 Projects', projects.length === 0
        ? '<div style="padding:16px;font-size:13px;color:#80868b;text-align:center;">No projects yet.</div>'
        : '<div style="padding:8px 0;">' + projects.map(p => {
            const pTasks = leafTasks.filter(t=>t._projectId===p.id);
            const prog   = pTasks.length ? Math.round(pTasks.reduce((s,t)=>s+(t.progress||0),0)/pTasks.length) : 0;
            return '<div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid #f9f9f9;">'
              + '<div style="width:8px;height:8px;border-radius:50%;background:'+p.color+';flex-shrink:0;"></div>'
              + '<div style="flex:1;min-width:0;">'
              + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
              + '<span style="font-size:13px;font-weight:500;color:#0f2d6b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(p.name)+'</span>'
              + '<span style="font-size:12.5px;color:#80868b;flex-shrink:0;margin-left:8px;">'+prog+'%</span>'
              + '</div>'
              + '<div style="height:5px;background:#f1f3f4;border-radius:999px;overflow:hidden;">'
              + '<div style="height:100%;width:'+prog+'%;background:'+p.color+';border-radius:999px;"></div>'
              + '</div></div>'
              + '<button onclick="openProject(\''+p.id+'\')" style="font-size:12px;color:#1a5aa8;background:none;border:none;cursor:pointer;white-space:nowrap;padding:0;">Open →</button>'
              + '</div>';
          }).join('') + '</div>'
      );

      // Papers snapshot
      if (papers.length > 0) {
        const wsC = {Active:'#1e8e3e',Paused:'#f59e0b',Ideation:'#9334e6',Incomplete:'#6b7280'};
        html += card('📄 Papers', '<div style="padding:8px 0;">'
          + papers.slice(0,5).map(p =>
              '<div style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #f9f9f9;">'
              + '<span style="font-size:11px;padding:2px 9px;border-radius:999px;background:'+(wsC[p.work_status]||'#80868b')+'20;color:'+(wsC[p.work_status]||'#80868b')+';font-weight:600;white-space:nowrap;">'+(p.work_status||'Active')+'</span>'
              + '<span style="font-size:13px;color:#0f2d6b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">'+esc(p.title)+'</span>'
              + (p.pubs_target?'<span style="font-size:11.5px;color:#80868b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">'+esc(p.pubs_target)+'</span>':'')
              + '</div>'
            ).join('')
          + '</div>'
          + '<div style="display:flex;gap:6px;padding:8px 18px;flex-wrap:wrap;">'
          + [{k:'Accepted',c:'#1e8e3e'},{k:'Pending',c:'#1a5aa8'},{k:'Rejected',c:'#b91c1c'},{k:'Other',c:'#80868b'}].map(function(s){
              const cnt=papers.filter(function(p){return p.pubs_status===s.k;}).length;
              if(!cnt) return '';
              return '<span style="font-size:11.5px;padding:2px 10px;border-radius:999px;background:'+s.c+'18;color:'+s.c+';font-weight:600;">'+s.k+' '+cnt+'</span>';
            }).join('')
          + '</div>'
          + '<div style="padding:6px 18px 12px;"><button onclick="showView(\'papers\')" style="font-size:12.5px;color:#1a5aa8;background:none;border:none;cursor:pointer;">View all papers →</button></div>'
        );
      }

      html += '</div>';
      container.innerHTML = html;
    } catch(e) {
      container.innerHTML = '<div style="padding:40px;color:#b91c1c;">Error loading dashboard: '+esc(e.message)+'</div>';
    }
  }

  function summaryCard(label, value, sub, color) {
    return '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;padding:18px 20px;">'
      + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#80868b;margin-bottom:6px;">'+label+'</div>'
      + '<div style="font-size:24px;font-weight:700;color:'+(color||'#0f2d6b')+';margin-bottom:2px;">'+value+'</div>'
      + '<div style="font-size:12px;color:#80868b;">'+sub+'</div>'
      + '</div>';
  }

  function card(title, content) {
    return '<div style="background:#fff;border:1px solid rgba(15,45,107,.10);border-radius:12px;overflow:hidden;">'
      + '<div style="padding:14px 18px;border-bottom:1px solid #f1f3f4;font-size:13px;font-weight:600;color:#0f2d6b;">'+title+'</div>'
      + content
      + '</div>';
  }

  function taskRow(name, project, color, date, progress) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid #f9f9f9;">'
      + '<div style="width:7px;height:7px;border-radius:50%;background:'+color+';flex-shrink:0;"></div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;color:#0f2d6b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(name)+'</div>'
      + '<div style="font-size:11.5px;color:#80868b;">'+esc(project)+' · Due '+fmtDate(date)+'</div>'
      + '</div>'
      + '<div style="font-size:12px;color:#80868b;flex-shrink:0;">'+progress+'%</div>'
      + '</div>';
  }

  return { render };
})();
