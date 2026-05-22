// ── Supabase client + all database operations ─────────────────
const DB = (() => {
  const { createClient } = supabase;
  const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

  // ── Projects ──────────────────────────────────────────────────
  async function getProjects() {
    const { data, error } = await client
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function createProject(data) {
    const user = (await client.auth.getUser()).data.user;
    const { data: p, error } = await client
      .from('projects')
      .insert({ ...data, owner_id: user.id })
      .select().single();
    if (error) throw error;
    return p;
  }

  async function updateProject(id, changes) {
    const { error } = await client
      .from('projects')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async function deleteProject(id) {
    const { error } = await client.from('projects').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Tasks ─────────────────────────────────────────────────────
  async function getTasks(projectId) {
    const { data, error } = await client
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    // Fetch dependencies
    if (data.length) {
      const ids = data.map(t => t.id);
      const { data: deps } = await client
        .from('task_dependencies')
        .select('*')
        .in('task_id', ids);
      const depMap = {};
      (deps || []).forEach(d => {
        if (!depMap[d.task_id]) depMap[d.task_id] = [];
        depMap[d.task_id].push(d.depends_on);
      });
      return data.map(t => ({ ...t, dependencies: depMap[t.id] || [] }));
    }
    return data;
  }

  async function upsertTask(task) {
    const { dependencies } = task;
    // Only send known DB columns — extra UI fields must not reach Supabase
    const taskData = {
      id:           task.id,
      project_id:   task.project_id,
      parent_id:    task.parent_id   || null,
      name:         task.name,
      start_date:   task.start_date,
      end_date:     task.end_date,
      duration:     task.duration    || 1,
      progress:     task.progress    || 0,
      is_milestone: task.is_milestone || false,
      collapsed:    task.collapsed   || false,
      sort_order:   task.sort_order  || 0,
      notes:        task.notes       || '',
    };
    if (task.color    !== undefined) taskData.color    = task.color    || null;
    if (task.priority !== undefined) taskData.priority = task.priority || 'medium';

    const { data, error } = await client
      .from('tasks')
      .upsert(taskData, { onConflict: 'id' })
      .select().single();
    if (error) throw error;

    // Update dependencies
    if (dependencies !== undefined) {
      await client.from('task_dependencies').delete().eq('task_id', data.id);
      if (dependencies.length) {
        await client.from('task_dependencies').insert(
          dependencies.map(dep => ({ task_id: data.id, depends_on: dep }))
        );
      }
    }
    return data;
  }

  async function deleteTask(id) {
    const { error } = await client.from('tasks').delete().eq('id', id);
    if (error) throw error;
  }

  async function bulkUpdateTasks(tasks) {
    for (const task of tasks) {
      await upsertTask(task);
    }
  }

  // ── Grants ────────────────────────────────────────────────────
  async function getGrants(projectId) {
    const { data, error } = await client
      .from('grants')
      .select('*, budget_categories(*)')
      .eq('project_id', projectId);
    if (error) throw error;
    return data;
  }

  async function createGrant(data) {
    const { data: g, error } = await client
      .from('grants').insert(data).select().single();
    if (error) throw error;
    return g;
  }

  async function updateGrant(id, changes) {
    const { error } = await client.from('grants').update(changes).eq('id', id);
    if (error) throw error;
  }

  // ── Expenses ──────────────────────────────────────────────────
  async function getExpenses(projectId) {
    const { data, error } = await client
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('expense_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function createExpense(data) {
    const user = (await client.auth.getUser()).data.user;
    const { data: e, error } = await client
      .from('expenses')
      .insert({ ...data, submitted_by: user.id })
      .select().single();
    if (error) throw error;
    return e;
  }

  async function updateExpense(id, changes) {
    const { error } = await client.from('expenses').update(changes).eq('id', id);
    if (error) throw error;
  }

  async function deleteExpense(id) {
    const { error } = await client.from('expenses').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Phases ────────────────────────────────────────────────────
  async function getPhases(projectId) {
    const { data, error } = await client.from('project_phases').select('*').eq('project_id', projectId).order('start_date');
    if (error) return [];
    return data || [];
  }
  async function upsertPhase(phase) {
    const { data, error } = await client.from('project_phases').upsert(phase, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return data;
  }
  async function deletePhase(id) {
    const { error } = await client.from('project_phases').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Profiles ──────────────────────────────────────────────────
  async function upsertProfile(profile) {
    const { error } = await client.from('profiles').upsert(profile, { onConflict: 'id' });
    if (error) throw error;
  }

  async function getProjectMembers(projectId) {
    // Owner + anyone in project_access, joined with profiles
    const { data: proj } = await client.from('projects').select('owner_id').eq('id', projectId).single();
    const { data: access } = await client.from('project_access').select('user_id').eq('project_id', projectId);
    const userIds = [...new Set([proj?.owner_id, ...(access||[]).map(a => a.user_id)].filter(Boolean))];
    if (!userIds.length) return [];
    const { data, error } = await client.from('profiles').select('*').in('id', userIds);
    if (error) return [];
    return data;
  }

  async function getTaskAssignees(taskId) {
    const { data, error } = await client.from('task_assignees').select('user_id').eq('task_id', taskId);
    if (error) return [];
    return (data||[]).map(r => r.user_id);
  }

  async function setTaskAssignees(taskId, userIds) {
    await client.from('task_assignees').delete().eq('task_id', taskId);
    if (userIds.length) {
      await client.from('task_assignees').insert(userIds.map(uid => ({ task_id: taskId, user_id: uid })));
    }
  }

  // ── Share tokens ──────────────────────────────────────────────
  async function createShareToken(projectId, role = 'editor') {
    const user = (await client.auth.getUser()).data.user;
    const { data, error } = await client
      .from('share_tokens')
      .insert({ project_id: projectId, role, created_by: user.id })
      .select().single();
    if (error) throw error;
    return data;
  }

  async function getShareTokens(projectId) {
    const { data, error } = await client
      .from('share_tokens')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function redeemShareToken(tokenId) {
    // 1. Look up the token
    const { data: token, error: te } = await client
      .from('share_tokens').select('*').eq('id', tokenId).single();
    if (te || !token) throw new Error('Invite link is invalid or expired.');
    if (new Date(token.expires_at) < new Date()) throw new Error('This invite link has expired.');

    // 2. Add current user to project_access
    const user = (await client.auth.getUser()).data.user;
    const { error: ae } = await client
      .from('project_access')
      .upsert({ project_id: token.project_id, user_id: user.id, role: token.role },
               { onConflict: 'project_id,user_id' });
    if (ae) throw ae;
    return token;
  }

  async function deleteShareToken(id) {
    const { error } = await client.from('share_tokens').delete().eq('id', id);
    if (error) throw error;
  }

  return {
    client,
    getProjects, createProject, updateProject, deleteProject,
    getTasks, upsertTask, deleteTask, bulkUpdateTasks,
    getGrants, createGrant, updateGrant,
    getExpenses, createExpense, updateExpense, deleteExpense,
    getPhases, upsertPhase, deletePhase,
    upsertProfile, getProjectMembers, getTaskAssignees, setTaskAssignees,
    createShareToken, getShareTokens, redeemShareToken, deleteShareToken,
  };
})();
