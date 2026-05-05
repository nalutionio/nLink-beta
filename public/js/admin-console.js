(function initAdminConsole() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const statusEl = document.getElementById("admin-status");
  const postReportsListEl = document.getElementById("admin-post-reports-list");
  const commentReportsListEl = document.getElementById("admin-comment-reports-list");
  const postsListEl = document.getElementById("admin-posts-list");
  const clientsListEl = document.getElementById("admin-clients-list");
  const providersListEl = document.getElementById("admin-providers-list");
  const ticketsListEl = document.getElementById("admin-tickets-list");
  const auditListEl = document.getElementById("admin-audit-list");
  const archivedPostsListEl = document.getElementById("admin-archived-posts-list");
  const kpiReportsEl = document.getElementById("admin-kpi-reports");
  const kpiPostsEl = document.getElementById("admin-kpi-posts");
  const kpiClientsEl = document.getElementById("admin-kpi-clients");
  const kpiProvidersEl = document.getElementById("admin-kpi-providers");
  const userSearchFormEl = document.getElementById("admin-user-search-form");
  const userSearchInputEl = document.getElementById("admin-user-search-input");

  const manualMatchForm = document.getElementById("admin-manual-match-form");
  const manualMatchStatusEl = document.getElementById("admin-manual-match-status");
  const manualMatchJobIdEl = document.getElementById("admin-match-job-id");
  const manualMatchProviderIdEl = document.getElementById("admin-match-provider-id");
  const manualMatchReasonEl = document.getElementById("admin-match-reason");

  const roleFormEl = document.getElementById("admin-role-form");
  const roleUserIdEl = document.getElementById("admin-role-user-id");
  const roleSelectEl = document.getElementById("admin-role-select");
  const verifyFormEl = document.getElementById("admin-verify-form");
  const verifyProviderIdEl = document.getElementById("admin-verify-provider-id");
  const verifyFeaturedEl = document.getElementById("admin-verify-featured");
  const roleStatusEl = document.getElementById("admin-role-status");

  const ticketFormEl = document.getElementById("admin-ticket-form");
  const ticketUserIdEl = document.getElementById("admin-ticket-user-id");
  const ticketSubjectEl = document.getElementById("admin-ticket-subject");
  const clientProfileFormEl = document.getElementById("admin-client-profile-form");
  const clientLoadBtnEl = document.getElementById("admin-client-load");
  const clientUserIdEl = document.getElementById("admin-client-user-id");
  const clientNameEl = document.getElementById("admin-client-name");
  const clientEmailEl = document.getElementById("admin-client-email");
  const clientLocationEl = document.getElementById("admin-client-location");
  const providerProfileFormEl = document.getElementById("admin-provider-profile-form");
  const providerLoadBtnEl = document.getElementById("admin-provider-load");
  const providerIdEl = document.getElementById("admin-provider-id");
  const providerOwnerIdEl = document.getElementById("admin-provider-owner-id");
  const providerNameEl = document.getElementById("admin-provider-name");
  const providerCategoryEl = document.getElementById("admin-provider-category");
  const providerLocationEl = document.getElementById("admin-provider-location");
  const profileEditorStatusEl = document.getElementById("admin-profile-editor-status");
  const officialPostFormEl = document.getElementById("admin-official-post-form");
  const officialPostTypeEl = document.getElementById("admin-official-post-type");
  const officialPostBodyEl = document.getElementById("admin-official-post-body");
  const supportReplyFormEl = document.getElementById("admin-support-reply-form");
  const supportReplyPostIdEl = document.getElementById("admin-support-reply-post-id");
  const supportReplyBodyEl = document.getElementById("admin-support-reply-body");
  const communityStatusEl = document.getElementById("admin-community-status");

  const renderEmpty = (container, message) => {
    if (!container) return;
    container.innerHTML = `<p class="muted">${message}</p>`;
  };

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = `auth-status ${type}`.trim();
  };

  const setManualMatchStatus = (message, type = "") => {
    if (!manualMatchStatusEl) return;
    manualMatchStatusEl.textContent = message || "";
    manualMatchStatusEl.className = `auth-status ${type}`.trim();
  };

  const setRoleStatus = (message, type = "") => {
    if (!roleStatusEl) return;
    roleStatusEl.textContent = message || "";
    roleStatusEl.className = `auth-status ${type}`.trim();
  };

  const setProfileEditorStatus = (message, type = "") => {
    if (!profileEditorStatusEl) return;
    profileEditorStatusEl.textContent = message || "";
    profileEditorStatusEl.className = `auth-status ${type}`.trim();
  };

  const setCommunityStatus = (message, type = "") => {
    if (!communityStatusEl) return;
    communityStatusEl.textContent = message || "";
    communityStatusEl.className = `auth-status ${type}`.trim();
  };

  const safeMessage = (error, fallback) => error?.message || fallback;

  const isMissingTableError = (error) => {
    const text = String(error?.message || "").toLowerCase();
    return error?.code === "PGRST205" || text.includes("does not exist");
  };

  const logAudit = async (actionType, targetType, targetId, metadata = null) => {
    const { error } = await supabase
      .from("admin_action_logs")
      .insert({
        action_type: actionType,
        target_type: targetType,
        target_id: targetId || null,
        metadata: metadata || null,
      });
    if (error && !isMissingTableError(error)) throw error;
  };

  const renderRows = (container, rowsHtml, emptyText) => {
    if (!container) return;
    if (!rowsHtml.length) {
      renderEmpty(container, emptyText);
      return;
    }
    container.innerHTML = rowsHtml.join("");
  };

  const loadReports = async () => {
    const { data, error } = await supabase
      .from("community_reports")
      .select("id,target_type,target_id,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    if (kpiReportsEl) kpiReportsEl.textContent = String((data || []).length);
    const postRows = (data || []).filter((row) => row.target_type === "post").map((row) => `
      <div class="settings-item">
        <span><strong>post</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${row.reason || "No reason"}</span>
        <div class="job-actions">
          <button class="ghost-button" data-action="resolve-report" data-id="${row.id}">Resolve</button>
          <button class="primary-button" data-action="hide-post" data-id="${row.target_id}">Hide Post</button>
        </div>
      </div>
    `);
    const commentRows = (data || []).filter((row) => row.target_type === "comment").map((row) => `
      <div class="settings-item">
        <span><strong>comment</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${row.reason || "No reason"}</span>
        <div class="job-actions">
          <button class="ghost-button" data-action="resolve-report" data-id="${row.id}">Resolve</button>
          <button class="primary-button" data-action="remove-comment" data-id="${row.target_id}">Remove Comment</button>
        </div>
      </div>
    `);
    renderRows(postReportsListEl, postRows, "No reported posts.");
    renderRows(commentReportsListEl, commentRows, "No reported comments.");
  };

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,author_name,body,created_at")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    if (kpiPostsEl) kpiPostsEl.textContent = String((data || []).length);
    const html = (data || []).map((row) => `
      <div class="settings-item">
        <span><strong>${row.author_name || "User"}</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${String(row.body || "").slice(0, 90)}</span>
        <div class="job-actions">
          <button class="ghost-button" data-action="pin-post" data-id="${row.id}">Pin</button>
          <button class="ghost-button" data-action="highlight-post" data-id="${row.id}">Highlight</button>
          <button class="ghost-button" data-action="hide-post" data-id="${row.id}">Hide</button>
        </div>
      </div>
    `);
    renderRows(postsListEl, html, "No active posts found.");
  };

  const loadArchivedPosts = async () => {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,author_name,body,created_at")
      .eq("is_archived", true)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    const html = (data || []).map((row) => `
      <div class="settings-item">
        <span><strong>${row.author_name || "User"}</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${String(row.body || "").slice(0, 90)}</span>
        <button class="ghost-button" data-action="restore-post" data-id="${row.id}">Restore</button>
      </div>
    `);
    renderRows(archivedPostsListEl, html, "No archived posts.");
  };

  const loadPopulationKpis = async () => {
    const [{ count: clientCount }, { count: providerCount }] = await Promise.all([
      supabase.from("clients").select("user_id", { count: "exact", head: true }),
      supabase.from("providers").select("id", { count: "exact", head: true }),
    ]);
    if (kpiClientsEl) kpiClientsEl.textContent = String(clientCount || 0);
    if (kpiProvidersEl) kpiProvidersEl.textContent = String(providerCount || 0);
  };

  const loadUserLists = async (searchTerm = "") => {
    const query = String(searchTerm || "").trim().toLowerCase();
    const [{ data: clients, error: clientsError }, { data: providers, error: providersError }] = await Promise.all([
      supabase.from("clients").select("user_id,full_name,email,location,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("providers").select("id,owner_id,name,category,location,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (clientsError) throw clientsError;
    if (providersError) throw providersError;

    const filteredClients = (clients || []).filter((row) => {
      if (!query) return true;
      return [row.full_name, row.email, row.location, row.user_id].some((v) => String(v || "").toLowerCase().includes(query));
    });
    const filteredProviders = (providers || []).filter((row) => {
      if (!query) return true;
      return [row.name, row.category, row.location, row.owner_id, row.id].some((v) => String(v || "").toLowerCase().includes(query));
    });

    renderRows(
      clientsListEl,
      filteredClients.map((row) => `
        <div class="settings-item">
          <span><strong>${row.full_name || "Neighbor"}</strong><br/>${row.email || "-"} • ${row.location || "No location"}<br/><code>${row.user_id}</code></span>
          <button class="ghost-button" data-action="copy-id" data-id="${row.user_id}">Copy ID</button>
        </div>
      `),
      "No neighbors matched."
    );

    renderRows(
      providersListEl,
      filteredProviders.map((row) => `
        <div class="settings-item">
          <span><strong>${row.name || "Plug"}</strong><br/>${row.category || "Service"} • ${row.location || "No location"}<br/><code>${row.id}</code></span>
          <button class="ghost-button" data-action="copy-id" data-id="${row.id}">Copy ID</button>
        </div>
      `),
      "No plugs matched."
    );
  };

  const loadSupportTickets = async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,requester_user_id,subject,status,priority,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      if (isMissingTableError(error)) {
        renderEmpty(ticketsListEl, "Run phase13_admin_console_extensions.sql to enable tickets.");
        return;
      }
      throw error;
    }
    renderRows(
      ticketsListEl,
      (data || []).map((row) => `
        <div class="settings-item">
          <span><strong>${row.subject || "Ticket"}</strong> • ${row.status}<br/>Priority: ${row.priority || "normal"}<br/><code>${row.requester_user_id || "-"}</code></span>
          <button class="ghost-button" data-action="ticket-close" data-id="${row.id}">Close</button>
        </div>
      `),
      "No support tickets yet."
    );
  };

  const loadAuditLog = async () => {
    const { data, error } = await supabase
      .from("admin_action_logs")
      .select("id,actor_user_id,action_type,target_type,target_id,created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      if (isMissingTableError(error)) {
        renderEmpty(auditListEl, "Run phase13_admin_console_extensions.sql to enable audit logs.");
        return;
      }
      throw error;
    }
    renderRows(
      auditListEl,
      (data || []).map((row) => `
        <div class="settings-item">
          <span><strong>${row.action_type}</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${row.target_type}${row.target_id ? `: ${row.target_id}` : ""}<br/><code>${row.actor_user_id || "-"}</code></span>
        </div>
      `),
      "No audit actions yet."
    );
  };

  const refresh = async () => {
    await Promise.all([
      loadReports(),
      loadPosts(),
      loadPopulationKpis(),
      loadUserLists(userSearchInputEl?.value || ""),
      loadSupportTickets(),
      loadAuditLog(),
      loadArchivedPosts(),
    ]);
  };

  const handleAction = async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!action || !id) return;
    button.disabled = true;
    try {
      if (action === "resolve-report") {
        const { error } = await supabase.from("community_reports").delete().eq("id", id);
        if (error) throw error;
        await logAudit("report_resolved", "community_report", id);
      } else if (action === "hide-post") {
        const { error } = await supabase.from("community_posts").update({ is_archived: true }).eq("id", id);
        if (error) throw error;
        await logAudit("post_hidden", "community_post", id);
      } else if (action === "restore-post") {
        const { error } = await supabase.from("community_posts").update({ is_archived: false }).eq("id", id);
        if (error) throw error;
        await logAudit("post_restored", "community_post", id);
      } else if (action === "pin-post") {
        const { error } = await supabase.from("community_posts").update({ is_pinned: true }).eq("id", id);
        if (error) throw error;
        await logAudit("post_pinned", "community_post", id);
      } else if (action === "highlight-post") {
        const { error } = await supabase.from("community_posts").update({ is_highlighted: true }).eq("id", id);
        if (error) throw error;
        await logAudit("post_highlighted", "community_post", id);
      } else if (action === "remove-comment") {
        const { error } = await supabase.from("community_comments").delete().eq("id", id);
        if (error) throw error;
        await logAudit("comment_removed", "community_comment", id);
      } else if (action === "copy-id") {
        await navigator.clipboard.writeText(id);
        setStatus("ID copied.", "success");
      } else if (action === "ticket-close") {
        const { error } = await supabase.from("support_tickets").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
        await logAudit("ticket_closed", "support_ticket", id);
      }
      if (action !== "copy-id") {
        setStatus("Action completed.", "success");
        await refresh();
      }
    } catch (error) {
      setStatus(safeMessage(error, "Action failed."), "error");
    } finally {
      button.disabled = false;
    }
  };

  const handleManualMatch = async (event) => {
    event.preventDefault();
    const jobId = String(manualMatchJobIdEl?.value || "").trim();
    const providerId = String(manualMatchProviderIdEl?.value || "").trim();
    const reason = String(manualMatchReasonEl?.value || "").trim();
    if (!jobId || !providerId || !reason) {
      setManualMatchStatus("Job ID, Provider ID, and reason are required.", "error");
      return;
    }
    const canMatch = await window.PLUGFEED_ACCESS.requirePermission("matching.manual_link");
    if (!canMatch) {
      setManualMatchStatus("You do not have permission to create manual matches.", "error");
      return;
    }
    setManualMatchStatus("Creating manual match...", "info");
    try {
      const { data: jobRow, error: jobReadError } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .maybeSingle();
      if (jobReadError || !jobRow?.id) throw (jobReadError || new Error("Job not found."));

      const { data: providerRow, error: providerReadError } = await supabase
        .from("providers")
        .select("id")
        .eq("id", providerId)
        .maybeSingle();
      if (providerReadError || !providerRow?.id) throw (providerReadError || new Error("Provider not found."));

      const { error: jobUpdateError } = await supabase
        .from("jobs")
        .update({ target_provider_id: providerId })
        .eq("id", jobId);
      if (jobUpdateError) throw jobUpdateError;

      const { data: existingRequest } = await supabase
        .from("job_requests")
        .select("id")
        .eq("job_id", jobId)
        .eq("provider_id", providerId)
        .maybeSingle();

      if (existingRequest?.id) {
        const { error: updateRequestError } = await supabase
          .from("job_requests")
          .update({ status: "requested", proposal_notes: `Admin manual match: ${reason}`.slice(0, 400) })
          .eq("id", existingRequest.id);
        if (updateRequestError) throw updateRequestError;
      } else {
        const { error: createRequestError } = await supabase
          .from("job_requests")
          .insert({
            job_id: jobId,
            provider_id: providerId,
            status: "requested",
            proposal_notes: `Admin manual match: ${reason}`.slice(0, 400),
          });
        if (createRequestError) throw createRequestError;
      }

      await logAudit("manual_match_created", "job", jobId, { provider_id: providerId, reason });
      setManualMatchStatus("Manual match created successfully.", "success");
      manualMatchForm?.reset();
      await refresh();
    } catch (error) {
      setManualMatchStatus(safeMessage(error, "Could not create manual match."), "error");
    }
  };

  const handleRoleAssign = async (event) => {
    event.preventDefault();
    const userId = String(roleUserIdEl?.value || "").trim();
    const role = String(roleSelectEl?.value || "").trim();
    if (!userId || !role) {
      setRoleStatus("User ID and role are required.", "error");
      return;
    }
    const canManage = await window.PLUGFEED_ACCESS.requirePermission("roles.manage");
    if (!canManage) {
      setRoleStatus("You do not have permission to manage roles.", "error");
      return;
    }
    try {
      const { error } = await supabase.from("internal_roles").upsert({ user_id: userId, role }, { onConflict: "user_id" });
      if (error) throw error;
      await logAudit("internal_role_assigned", "internal_role", userId, { role });
      setRoleStatus("Role assigned.", "success");
    } catch (error) {
      setRoleStatus(safeMessage(error, "Could not assign role."), "error");
    }
  };

  const handleFeaturedToggle = async (event) => {
    event.preventDefault();
    const providerId = String(verifyProviderIdEl?.value || "").trim();
    const featured = String(verifyFeaturedEl?.value || "") === "true";
    if (!providerId) {
      setRoleStatus("Provider ID is required.", "error");
      return;
    }
    const canVerify = await window.PLUGFEED_ACCESS.requirePermission("plugs.verify");
    if (!canVerify) {
      setRoleStatus("You do not have permission to update plug verification.", "error");
      return;
    }
    try {
      const { error } = await supabase.from("providers").update({ featured }).eq("id", providerId);
      if (error) throw error;
      await logAudit("provider_featured_updated", "provider", providerId, { featured });
      setRoleStatus("Plug featured status updated.", "success");
      await refresh();
    } catch (error) {
      setRoleStatus(safeMessage(error, "Could not update featured status. Ensure providers.featured exists."), "error");
    }
  };

  const handleTicketCreate = async (event) => {
    event.preventDefault();
    const requesterUserId = String(ticketUserIdEl?.value || "").trim();
    const subject = String(ticketSubjectEl?.value || "").trim();
    if (!requesterUserId || !subject) {
      setStatus("Ticket user ID and subject are required.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          requester_user_id: requesterUserId,
          subject,
          status: "open",
          priority: "normal",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      await logAudit("ticket_created", "support_ticket", data?.id || null, { requester_user_id: requesterUserId, subject });
      setStatus("Support ticket created.", "success");
      ticketFormEl?.reset();
      await refresh();
    } catch (error) {
      if (isMissingTableError(error)) {
        setStatus("Run phase13_admin_console_extensions.sql first.", "error");
        return;
      }
      setStatus(safeMessage(error, "Could not create support ticket."), "error");
    }
  };

  const handleClientProfileSave = async (event) => {
    event.preventDefault();
    const userId = String(clientUserIdEl?.value || "").trim();
    if (!userId) {
      setProfileEditorStatus("Neighbor user ID is required.", "error");
      return;
    }
    const payload = {
      user_id: userId,
      full_name: String(clientNameEl?.value || "").trim() || null,
      email: String(clientEmailEl?.value || "").trim() || null,
      location: String(clientLocationEl?.value || "").trim() || null,
    };
    try {
      const { error } = await supabase.from("clients").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      await logAudit("admin_client_profile_saved", "client", userId, payload);
      setProfileEditorStatus("Neighbor profile saved.", "success");
      await refresh();
    } catch (error) {
      setProfileEditorStatus(safeMessage(error, "Could not save neighbor profile."), "error");
    }
  };

  const handleClientProfileLoad = async () => {
    const userId = String(clientUserIdEl?.value || "").trim();
    if (!userId) {
      setProfileEditorStatus("Enter a neighbor user ID first.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("user_id,full_name,email,location")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProfileEditorStatus("No neighbor profile found for that user ID.", "error");
        return;
      }
      if (clientNameEl) clientNameEl.value = data.full_name || "";
      if (clientEmailEl) clientEmailEl.value = data.email || "";
      if (clientLocationEl) clientLocationEl.value = data.location || "";
      setProfileEditorStatus("Neighbor profile loaded.", "success");
    } catch (error) {
      setProfileEditorStatus(safeMessage(error, "Could not load neighbor profile."), "error");
    }
  };

  const handleProviderProfileSave = async (event) => {
    event.preventDefault();
    const providerId = String(providerIdEl?.value || "").trim();
    const ownerId = String(providerOwnerIdEl?.value || "").trim();
    const name = String(providerNameEl?.value || "").trim();
    if (!ownerId || !name) {
      setProfileEditorStatus("Owner user ID and business name are required.", "error");
      return;
    }
    const payload = {
      owner_id: ownerId,
      name,
      category: String(providerCategoryEl?.value || "").trim() || null,
      location: String(providerLocationEl?.value || "").trim() || null,
    };
    try {
      if (providerId) {
        const { error } = await supabase.from("providers").update(payload).eq("id", providerId);
        if (error) throw error;
        await logAudit("admin_provider_profile_updated", "provider", providerId, payload);
      } else {
        const insertPayload = { id: crypto.randomUUID(), ...payload };
        const { error } = await supabase.from("providers").insert(insertPayload);
        if (error) throw error;
        await logAudit("admin_provider_profile_created", "provider", insertPayload.id, payload);
        if (providerIdEl) providerIdEl.value = insertPayload.id;
      }
      setProfileEditorStatus("Plug profile saved.", "success");
      await refresh();
    } catch (error) {
      setProfileEditorStatus(safeMessage(error, "Could not save plug profile."), "error");
    }
  };

  const handleOfficialPost = async (event) => {
    event.preventDefault();
    const body = String(officialPostBodyEl?.value || "").trim();
    const postType = String(officialPostTypeEl?.value || "tip");
    if (!body) {
      setCommunityStatus("Official post body is required.", "error");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData?.session?.user?.id;
    if (!actorId) {
      setCommunityStatus("Session expired. Please sign in again.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          author_user_id: actorId,
          author_role: "client",
          post_type: postType,
          body,
          author_name: "PlugFeedHQ",
          author_subtitle: "Official PlugFeed",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      await logAudit("official_post_created", "community_post", data?.id || null, { post_type: postType });
      setCommunityStatus("Posted as PlugFeedHQ.", "success");
      officialPostFormEl?.reset();
      await refresh();
    } catch (error) {
      setCommunityStatus(safeMessage(error, "Could not publish official post."), "error");
    }
  };

  const handleSupportReply = async (event) => {
    event.preventDefault();
    const postId = String(supportReplyPostIdEl?.value || "").trim();
    const body = String(supportReplyBodyEl?.value || "").trim();
    if (!postId || !body) {
      setCommunityStatus("Post ID and reply are required.", "error");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const actorId = sessionData?.session?.user?.id;
    if (!actorId) {
      setCommunityStatus("Session expired. Please sign in again.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("community_comments")
        .insert({
          post_id: postId,
          author_user_id: actorId,
          author_role: "client",
          body,
          author_name: "PlugFeedSupport",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      await logAudit("official_support_reply_created", "community_comment", data?.id || null, { post_id: postId });
      setCommunityStatus("Reply posted as PlugFeedSupport.", "success");
      supportReplyFormEl?.reset();
      await refresh();
    } catch (error) {
      setCommunityStatus(safeMessage(error, "Could not post support reply."), "error");
    }
  };

  const handleProviderProfileLoad = async () => {
    const providerId = String(providerIdEl?.value || "").trim();
    if (!providerId) {
      setProfileEditorStatus("Enter a provider ID first.", "error");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("providers")
        .select("id,owner_id,name,category,location")
        .eq("id", providerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProfileEditorStatus("No plug profile found for that provider ID.", "error");
        return;
      }
      if (providerOwnerIdEl) providerOwnerIdEl.value = data.owner_id || "";
      if (providerNameEl) providerNameEl.value = data.name || "";
      if (providerCategoryEl) providerCategoryEl.value = data.category || "";
      if (providerLocationEl) providerLocationEl.value = data.location || "";
      setProfileEditorStatus("Plug profile loaded.", "success");
    } catch (error) {
      setProfileEditorStatus(safeMessage(error, "Could not load plug profile."), "error");
    }
  };

  const init = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      window.location.href = "../shared/login-choice.html";
      return;
    }
    const hasAccess = await window.PLUGFEED_ACCESS.requireRole(["owner_admin", "admin"]);
    if (!hasAccess) {
      setStatus("Admin role required.", "error");
      return;
    }
    setStatus("Admin console ready.", "success");
    postReportsListEl?.addEventListener("click", handleAction);
    commentReportsListEl?.addEventListener("click", handleAction);
    postsListEl?.addEventListener("click", handleAction);
    clientsListEl?.addEventListener("click", handleAction);
    providersListEl?.addEventListener("click", handleAction);
    ticketsListEl?.addEventListener("click", handleAction);
    archivedPostsListEl?.addEventListener("click", handleAction);
    userSearchFormEl?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadUserLists(userSearchInputEl?.value || "").catch((error) => {
        setStatus(safeMessage(error, "Could not search users."), "error");
      });
    });
    manualMatchForm?.addEventListener("submit", handleManualMatch);
    roleFormEl?.addEventListener("submit", handleRoleAssign);
    verifyFormEl?.addEventListener("submit", handleFeaturedToggle);
    ticketFormEl?.addEventListener("submit", handleTicketCreate);
    clientProfileFormEl?.addEventListener("submit", handleClientProfileSave);
    providerProfileFormEl?.addEventListener("submit", handleProviderProfileSave);
    officialPostFormEl?.addEventListener("submit", handleOfficialPost);
    supportReplyFormEl?.addEventListener("submit", handleSupportReply);
    clientLoadBtnEl?.addEventListener("click", handleClientProfileLoad);
    providerLoadBtnEl?.addEventListener("click", handleProviderProfileLoad);
    await refresh();
  };

  init();
})();
