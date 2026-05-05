(function initSupportConsole() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const statusEl = document.getElementById("support-status");
  const postReportsListEl = document.getElementById("support-post-reports-list");
  const commentReportsListEl = document.getElementById("support-comment-reports-list");
  const postsListEl = document.getElementById("support-posts-list");
  const kpiReportsEl = document.getElementById("support-kpi-reports");
  const kpiPostsEl = document.getElementById("support-kpi-posts");
  const chatLogEl = document.getElementById("support-chat-log");
  const chatFormEl = document.getElementById("support-chat-form");
  const chatInputEl = document.getElementById("support-chat-input");
  const CHAT_KEY = "plugfeed_support_chat_history_v1";

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = `auth-status ${type}`.trim();
  };

  const loadReports = async () => {
    const { data, error } = await supabase
      .from("community_reports")
      .select("id,target_type,target_id,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    if (kpiReportsEl) kpiReportsEl.textContent = String((data || []).length);
    if (!postReportsListEl || !commentReportsListEl) return;
    if (!data?.length) {
      postReportsListEl.innerHTML = "<p class='muted'>No reported posts.</p>";
      commentReportsListEl.innerHTML = "<p class='muted'>No reported comments.</p>";
      return;
    }
    postReportsListEl.innerHTML = data.filter((row) => row.target_type === "post").map((row) => `
      <div class="settings-item">
        <span><strong>post</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${row.reason || "No reason provided"}</span>
        <div class="job-actions">
          <button class="ghost-button" data-action="resolve-report" data-id="${row.id}">Resolve</button>
          <button class="ghost-button" data-action="hide-post" data-id="${row.target_id}">Hide Post</button>
        </div>
      </div>
    `).join("");
    commentReportsListEl.innerHTML = data.filter((row) => row.target_type === "comment").map((row) => `
      <div class="settings-item">
        <span><strong>comment</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${row.reason || "No reason provided"}</span>
        <div class="job-actions">
          <button class="ghost-button" data-action="resolve-report" data-id="${row.id}">Resolve</button>
          <button class="ghost-button" data-action="remove-comment" data-id="${row.target_id}">Remove Comment</button>
        </div>
      </div>
    `).join("");
  };

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,author_name,body,created_at")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    if (kpiPostsEl) kpiPostsEl.textContent = String((data || []).length);
    if (!postsListEl) return;
    if (!data?.length) {
      postsListEl.innerHTML = "<p class='muted'>No recent posts.</p>";
      return;
    }
    postsListEl.innerHTML = data.map((row) => `
      <div class="settings-item">
        <span><strong>${row.author_name || "User"}</strong> • ${new Date(row.created_at).toLocaleString()}<br/>${String(row.body || "").slice(0, 90)}</span>
        <button class="ghost-button" data-action="hide-post" data-id="${row.id}">Hide</button>
      </div>
    `).join("");
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
      } else if (action === "hide-post") {
        const { error } = await supabase.from("community_posts").update({ is_archived: true }).eq("id", id);
        if (error) throw error;
      } else if (action === "remove-comment") {
        const { error } = await supabase.from("community_comments").delete().eq("id", id);
        if (error) throw error;
      }
      setStatus("Support action completed.", "success");
      await Promise.all([loadReports(), loadPosts()]);
    } catch (error) {
      setStatus(error.message || "Support action failed.", "error");
    } finally {
      button.disabled = false;
    }
  };

  const readChat = () => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };

  const writeChat = (rows) => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(rows.slice(-30)));
  };

  const renderChat = () => {
    if (!chatLogEl) return;
    const rows = readChat();
    if (!rows.length) {
      chatLogEl.innerHTML = "<p class='muted'>Ask the assistant about disputes, policy, or next support actions.</p>";
      return;
    }
    chatLogEl.innerHTML = rows.map((row) => `<p><strong>${row.role}:</strong> ${row.text}</p>`).join("");
  };

  const getAssistantReply = (message) => {
    const text = String(message || "").toLowerCase();
    if (text.includes("dispute")) return "Start with report context, timeline, and requested outcome. Then tag as escalated if safety or payment is involved.";
    if (text.includes("suspend")) return "For suspension recommendations, capture evidence, prior warnings, and impacted users. Escalate to Admin for final action.";
    if (text.includes("refund")) return "Log the refund reason and job/request IDs, then hand off to billing review workflow.";
    if (text.includes("policy")) return "Link the user to Terms/Privacy/Community policy first, then summarize the exact clause applied.";
    return "Recommended next step: acknowledge user concern, summarize facts, and provide a clear ETA for the next update.";
  };

  const handleChatSubmit = (event) => {
    event.preventDefault();
    const text = String(chatInputEl?.value || "").trim();
    if (!text) return;
    const rows = readChat();
    rows.push({ role: "Support", text });
    rows.push({ role: "Assistant", text: getAssistantReply(text) });
    writeChat(rows);
    if (chatInputEl) chatInputEl.value = "";
    renderChat();
  };

  const init = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      window.location.href = "../shared/login-choice.html";
      return;
    }
    const hasAccess = await window.PLUGFEED_ACCESS.requireRole(["owner_admin", "admin", "support_agent", "moderator"]);
    if (!hasAccess) {
      setStatus("Support role required.", "error");
      return;
    }
    setStatus("Support console ready.", "success");
    chatFormEl?.addEventListener("submit", handleChatSubmit);
    postReportsListEl?.addEventListener("click", handleAction);
    commentReportsListEl?.addEventListener("click", handleAction);
    postsListEl?.addEventListener("click", handleAction);
    renderChat();
    await Promise.all([loadReports(), loadPosts()]);
  };

  init();
})();
