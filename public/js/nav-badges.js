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
  const getSeenIdSet = (kind, userId) => {
    try {
      const raw = localStorage.getItem(getSeenKey(kind, userId));
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (_error) {
      return new Set();
    }
  };
  const setSeenIdSet = (kind, userId, ids) => {
    localStorage.setItem(getSeenKey(kind, userId), JSON.stringify([...ids]));
  };
  const hasSeenKey = (kind, userId) => localStorage.getItem(getSeenKey(kind, userId)) !== null;

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
        <p>${isProvider ? "Messages = unread client threads • Proposals = newly accepted jobs." : "Messages = unread provider threads • Jobs = proposal status updates."}</p>
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
    const [{ data: jobRows, error: jobError }, { data: directRows, error: directError }] = await Promise.all([
      supabase.from("job_messages")
        .select("client_id")
        .eq("provider_id", providerId)
        .eq("sender_role", "client")
        .gt("created_at", sinceIso),
      supabase.from("direct_messages")
        .select("client_id")
        .eq("provider_id", providerId)
        .eq("sender_role", "client")
        .gt("created_at", sinceIso),
    ]);
    if (isMissingTableError(jobError) && isMissingTableError(directError)) return 0;
    const clientIds = new Set();
    (Array.isArray(jobRows) ? jobRows : []).forEach((row) => row?.client_id && clientIds.add(row.client_id));
    (Array.isArray(directRows) ? directRows : []).forEach((row) => row?.client_id && clientIds.add(row.client_id));
    return clientIds.size;
  };

  const countUnreadMessagesClient = async (clientId, sinceIso) => {
    const [{ data: jobRows, error: jobError }, { data: directRows, error: directError }] = await Promise.all([
      supabase.from("job_messages")
        .select("provider_id")
        .eq("client_id", clientId)
        .eq("sender_role", "provider")
        .gt("created_at", sinceIso),
      supabase.from("direct_messages")
        .select("provider_id")
        .eq("client_id", clientId)
        .eq("sender_role", "provider")
        .gt("created_at", sinceIso),
    ]);
    if (isMissingTableError(jobError) && isMissingTableError(directError)) return 0;
    const providerIds = new Set();
    (Array.isArray(jobRows) ? jobRows : []).forEach((row) => row?.provider_id && providerIds.add(row.provider_id));
    (Array.isArray(directRows) ? directRows : []).forEach((row) => row?.provider_id && providerIds.add(row.provider_id));
    return providerIds.size;
  };

  const loadProviderAcceptedRequestTokens = async (providerId) => {
    const { data, error } = await supabase
      .from("job_requests")
      .select("id,status")
      .eq("provider_id", providerId)
      .eq("status", "accepted");
    if (error && isMissingTableError(error)) return [];
    return Array.isArray(data)
      ? data
        .filter((row) => row?.id)
        .map((row) => `${String(row.id)}:${String(row.status || "accepted")}`)
      : [];
  };

  const loadClientStatusUpdateRequestTokens = async (clientId) => {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id")
      .eq("client_id", clientId);
    if (jobsError || !Array.isArray(jobs) || !jobs.length) return [];
    const ids = jobs.map((row) => row.id).filter(Boolean);
    if (!ids.length) return [];
    const { data, error } = await supabase
      .from("job_requests")
      .select("id,status")
      .in("job_id", ids)
      .in("status", ["accepted", "declined", "closed"]);
    if (error && isMissingTableError(error)) return [];
    return Array.isArray(data)
      ? data
        .filter((row) => row?.id && row?.status)
        .map((row) => `${String(row.id)}:${String(row.status)}`)
      : [];
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
      const messagesSeenKeyExists = hasSeenKey("provider_messages", user.id);
      if (!messagesSeenKeyExists) setSeenNow("provider_messages", user.id);
      if (onMessagesPage) setSeenNow("provider_messages", user.id);
      const acceptedTokens = await loadProviderAcceptedRequestTokens(providerId);
      const seenAcceptedIds = getSeenIdSet("provider_proposals_seen_ids", user.id);
      if (!hasSeenKey("provider_proposals_seen_ids", user.id) && !onProposalsPage) {
        acceptedTokens.forEach((token) => seenAcceptedIds.add(String(token)));
        setSeenIdSet("provider_proposals_seen_ids", user.id, seenAcceptedIds);
      }
      if (onProposalsPage) {
        acceptedTokens.forEach((token) => seenAcceptedIds.add(String(token)));
        setSeenIdSet("provider_proposals_seen_ids", user.id, seenAcceptedIds);
      }

      const messagesSince = getSeenAt("provider_messages", user.id) || "1970-01-01T00:00:00.000Z";
      const unreadMessages = await countUnreadMessagesProvider(providerId, messagesSince);
      const unreadProposals = acceptedTokens.filter((token) => !seenAcceptedIds.has(String(token))).length;
      setBadge(messagesBadge, onMessagesPage ? 0 : unreadMessages);
      setBadge(proposalsBadge, onProposalsPage ? 0 : unreadProposals);
      messagesLink?.addEventListener("click", () => {
        setSeenNow("provider_messages", user.id);
        setBadge(messagesBadge, 0);
      });
      proposalsLink?.addEventListener("click", () => {
        const nextSeenIds = getSeenIdSet("provider_proposals_seen_ids", user.id);
        acceptedTokens.forEach((token) => nextSeenIds.add(String(token)));
        setSeenIdSet("provider_proposals_seen_ids", user.id, nextSeenIds);
        setBadge(proposalsBadge, 0);
      });
      openLegendOnce();
      return;
    }

    if (isClient) {
      const jobsLink = getNavLink((a) => (a.getAttribute("href") || "").includes("client-jobs"));
      const jobsBadge = ensureBadge(jobsLink);

      const onMessagesPage = path.includes("/client/client-messages.html");
      const onJobsPage = path.includes("/client/client-jobs.html") || path.includes("/client/client-job-detail.html");
      const messagesSeenKeyExists = hasSeenKey("client_messages", user.id);
      if (!messagesSeenKeyExists) setSeenNow("client_messages", user.id);
      if (onMessagesPage) setSeenNow("client_messages", user.id);
      const statusUpdateTokens = await loadClientStatusUpdateRequestTokens(user.id);
      const seenJobUpdateIds = getSeenIdSet("client_jobs_seen_ids", user.id);
      if (!hasSeenKey("client_jobs_seen_ids", user.id) && !onJobsPage) {
        statusUpdateTokens.forEach((token) => seenJobUpdateIds.add(String(token)));
        setSeenIdSet("client_jobs_seen_ids", user.id, seenJobUpdateIds);
      }
      if (onJobsPage) {
        statusUpdateTokens.forEach((token) => seenJobUpdateIds.add(String(token)));
        setSeenIdSet("client_jobs_seen_ids", user.id, seenJobUpdateIds);
      }

      const messagesSince = getSeenAt("client_messages", user.id) || "1970-01-01T00:00:00.000Z";
      const unreadMessages = await countUnreadMessagesClient(user.id, messagesSince);
      const unreadJobs = statusUpdateTokens.filter((token) => !seenJobUpdateIds.has(String(token))).length;
      setBadge(messagesBadge, onMessagesPage ? 0 : unreadMessages);
      setBadge(jobsBadge, onJobsPage ? 0 : unreadJobs);
      messagesLink?.addEventListener("click", () => {
        setSeenNow("client_messages", user.id);
        setBadge(messagesBadge, 0);
      });
      jobsLink?.addEventListener("click", () => {
        const nextSeenIds = getSeenIdSet("client_jobs_seen_ids", user.id);
        statusUpdateTokens.forEach((token) => nextSeenIds.add(String(token)));
        setSeenIdSet("client_jobs_seen_ids", user.id, nextSeenIds);
        setBadge(jobsBadge, 0);
      });
      openLegendOnce();
    }
  };

  init();
})();
