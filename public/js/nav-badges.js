(() => {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const path = window.location.pathname;
  const isProvider = document.body.classList.contains("provider-theme") || path.includes("/provider/");
  const isClient = path.includes("/client/") && !isProvider;

  if (!isProvider && !isClient) return;

  const isMissingTableError = (error) => Boolean(error)
    && (
      error.code === "42P01"
      || error.code === "PGRST205"
      || error.status === 404
    );

  const getSeenKey = (kind, userId) => `nlink_seen_${kind}:${userId}`;
  const getSeenAt = (kind, userId) => localStorage.getItem(getSeenKey(kind, userId)) || "";
  const setSeenNow = (kind, userId) => {
    localStorage.setItem(getSeenKey(kind, userId), new Date().toISOString());
  };

  const getNavLink = (predicate) => Array.from(nav.querySelectorAll("a")).find(predicate) || null;
  const legendStorageKey = isProvider ? "nlink_badge_legend_seen_provider" : "nlink_badge_legend_seen_client";

  const ensureBadge = (link) => {
    if (!link) return null;
    let badge = link.querySelector(".nav-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge hidden";
      badge.textContent = "0";
      link.appendChild(badge);
    }
    return badge;
  };

  const setBadge = (badge, count) => {
    if (!badge) return;
    const value = Number(count || 0);
    if (value > 0) {
      badge.textContent = value > 99 ? "99+" : String(value);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  };

  const closeLegend = () => {
    document.getElementById("nav-badge-legend")?.remove();
    try {
      localStorage.setItem(legendStorageKey, "1");
    } catch (_error) {
      // no-op
    }
  };

  const openLegendOnce = () => {
    let seen = false;
    try {
      seen = localStorage.getItem(legendStorageKey) === "1";
    } catch (_error) {
      seen = false;
    }
    if (seen) return;

    const existing = document.getElementById("nav-badge-legend");
    if (existing) return;

    const box = document.createElement("div");
    box.id = "nav-badge-legend";
    box.className = "nav-badge-legend";
    box.innerHTML = `
      <div class="nav-badge-legend-card">
        <p><strong>Badge Guide</strong></p>
        <p>${isProvider ? "Messages = new client messages • Proposals = new pending proposals." : "Messages = new provider messages • Jobs = new proposal updates."}</p>
        <button class="ghost-button compact" type="button" data-action="close">Got it</button>
      </div>
    `;
    document.body.appendChild(box);
    box.querySelector("[data-action='close']")?.addEventListener("click", closeLegend);
    box.addEventListener("click", (event) => {
      if (event.target === box) closeLegend();
    });
  };

  const getProviderId = async (ownerId) => {
    const preferredId = localStorage.getItem("nlink_primary_provider_id");
    if (preferredId) {
      const preferred = await supabase
        .from("providers")
        .select("id")
        .eq("id", preferredId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (!preferred.error && preferred.data?.id) return preferred.data.id;
    }
    const fallback = await supabase
      .from("providers")
      .select("id")
      .eq("owner_id", ownerId)
      .limit(1)
      .maybeSingle();
    return fallback.data?.id || null;
  };

  const countUnreadMessagesProvider = async (providerId, sinceIso) => {
    const [{ count: jobCount, error: jobError }, { count: directCount, error: directError }] = await Promise.all([
      supabase.from("job_messages")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("sender_role", "client")
        .gt("created_at", sinceIso),
      supabase.from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("sender_role", "client")
        .gt("created_at", sinceIso),
    ]);
    const total = Number(jobCount || 0) + Number(directCount || 0);
    if (isMissingTableError(jobError) && isMissingTableError(directError)) return 0;
    return total;
  };

  const countUnreadMessagesClient = async (clientId, sinceIso) => {
    const [{ count: jobCount, error: jobError }, { count: directCount, error: directError }] = await Promise.all([
      supabase.from("job_messages")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("sender_role", "provider")
        .gt("created_at", sinceIso),
      supabase.from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("sender_role", "provider")
        .gt("created_at", sinceIso),
    ]);
    const total = Number(jobCount || 0) + Number(directCount || 0);
    if (isMissingTableError(jobError) && isMissingTableError(directError)) return 0;
    return total;
  };

  const countUnreadProviderProposals = async (providerId, sinceIso) => {
    const { count, error } = await supabase
      .from("job_requests")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "pending")
      .gt("created_at", sinceIso);
    if (error && isMissingTableError(error)) return 0;
    return Number(count || 0);
  };

  const countUnreadClientJobUpdates = async (clientId, sinceIso) => {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id")
      .eq("client_id", clientId);
    if (jobsError || !Array.isArray(jobs) || !jobs.length) return 0;
    const ids = jobs.map((row) => row.id).filter(Boolean);
    if (!ids.length) return 0;
    const { count, error } = await supabase
      .from("job_requests")
      .select("id", { count: "exact", head: true })
      .in("job_id", ids)
      .gt("created_at", sinceIso);
    if (error && isMissingTableError(error)) return 0;
    return Number(count || 0);
  };

  const init = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const messagesLink = getNavLink((a) => (a.getAttribute("href") || "").includes("messages"));
    const messagesBadge = ensureBadge(messagesLink);

    if (isProvider) {
      const providerId = await getProviderId(user.id);
      if (!providerId) return;
      const proposalsLink = getNavLink((a) => (a.getAttribute("href") || "").includes("provider-requests"));
      const proposalsBadge = ensureBadge(proposalsLink);

      const onMessagesPage = path.includes("/provider/provider-messages.html");
      const onProposalsPage = path.includes("/provider/provider-requests.html");
      if (onMessagesPage) setSeenNow("provider_messages", user.id);
      if (onProposalsPage) setSeenNow("provider_proposals", user.id);

      const messagesSince = getSeenAt("provider_messages", user.id) || "1970-01-01T00:00:00.000Z";
      const proposalsSince = getSeenAt("provider_proposals", user.id) || "1970-01-01T00:00:00.000Z";
      const [unreadMessages, unreadProposals] = await Promise.all([
        countUnreadMessagesProvider(providerId, messagesSince),
        countUnreadProviderProposals(providerId, proposalsSince),
      ]);
      setBadge(messagesBadge, onMessagesPage ? 0 : unreadMessages);
      setBadge(proposalsBadge, onProposalsPage ? 0 : unreadProposals);
      openLegendOnce();
      return;
    }

    if (isClient) {
      const jobsLink = getNavLink((a) => (a.getAttribute("href") || "").includes("client-jobs"));
      const jobsBadge = ensureBadge(jobsLink);

      const onMessagesPage = path.includes("/client/client-messages.html");
      const onJobsPage = path.includes("/client/client-jobs.html") || path.includes("/client/client-job-detail.html");
      if (onMessagesPage) setSeenNow("client_messages", user.id);
      if (onJobsPage) setSeenNow("client_jobs", user.id);

      const messagesSince = getSeenAt("client_messages", user.id) || "1970-01-01T00:00:00.000Z";
      const jobsSince = getSeenAt("client_jobs", user.id) || "1970-01-01T00:00:00.000Z";
      const [unreadMessages, unreadJobs] = await Promise.all([
        countUnreadMessagesClient(user.id, messagesSince),
        countUnreadClientJobUpdates(user.id, jobsSince),
      ]);
      setBadge(messagesBadge, onMessagesPage ? 0 : unreadMessages);
      setBadge(jobsBadge, onJobsPage ? 0 : unreadJobs);
      openLegendOnce();
    }
  };

  init();
})();
