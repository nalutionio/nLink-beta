const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const threadListEl = document.getElementById("message-thread-list");
const feedEl = document.getElementById("message-feed");
const threadTitleEl = document.getElementById("message-thread-title");
const formEl = document.getElementById("message-form");
const inputEl = document.getElementById("message-input");
const statusEl = document.getElementById("message-status");
const sendEl = document.getElementById("message-send");
const threadPanelEl = document.getElementById("message-thread-panel");
const chatPanelEl = document.getElementById("message-chat-panel");
const backButtonEl = document.getElementById("message-back");

const state = {
  user: null,
  providers: [],
  selectedProviderId: null,
  tableAvailable: true,
  directTableAvailable: true,
  readTableAvailable: true,
  readByProviderId: {},
  chatOpen: false,
};

let realtimeChannel = null;
const pageParams = new URLSearchParams(window.location.search);
const queryProviderId = pageParams.get("provider");
const queryJobId = pageParams.get("job");
const queryProviderName = pageParams.get("providerName");
const queryProviderAvatar = pageParams.get("providerAvatar");

const fallbackAvatar = "../assets/plugprofilepic.png";

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const isMissingTableError = (error) => Boolean(error)
  && (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.status === 404
  );

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const setChatMode = (isChatOpen) => {
  state.chatOpen = isChatOpen;
  threadPanelEl?.classList.toggle("hidden", isChatOpen);
  chatPanelEl?.classList.toggle("hidden", !isChatOpen);
};

const getSelectedProvider = () => state.providers.find((item) => item.providerId === state.selectedProviderId) || null;

const getIncomingLatestByProvider = (provider) => {
  const incoming = (provider?.messages || [])
    .filter((row) => row?.sender_role === "provider")
    .map((row) => row.created_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  return incoming || "";
};

const getUnreadCountForProvider = (provider) => {
  if (!provider) return 0;
  const lastRead = state.readByProviderId[provider.providerId] || "";
  const cutoff = lastRead ? new Date(lastRead).getTime() : 0;
  return (provider.messages || []).filter((row) => {
    if (row?.sender_role !== "provider" || !row?.created_at) return false;
    return new Date(row.created_at).getTime() > cutoff;
  }).length;
};

const markProviderThreadRead = async (provider) => {
  if (!supabase || !state.user || !provider?.providerId || !state.readTableAvailable) return;
  const latestIncoming = getIncomingLatestByProvider(provider);
  if (!latestIncoming) return;
  const current = state.readByProviderId[provider.providerId] || "";
  if (current && new Date(current).getTime() >= new Date(latestIncoming).getTime()) return;
  const payload = {
    provider_id: provider.providerId,
    client_id: state.user.id,
    viewer_user_id: state.user.id,
    viewer_role: "client",
    last_read_at: latestIncoming,
  };
  const { error } = await supabase
    .from("message_thread_reads")
    .upsert(payload, { onConflict: "provider_id,client_id,viewer_user_id,viewer_role" });
  if (error) {
    if (isMissingTableError(error)) {
      state.readTableAvailable = false;
      return;
    }
    return;
  }
  state.readByProviderId[provider.providerId] = latestIncoming;
};

const loadReadState = async () => {
  if (!supabase || !state.user || !state.readTableAvailable) return;
  const { data, error } = await supabase
    .from("message_thread_reads")
    .select("provider_id,last_read_at")
    .eq("viewer_user_id", state.user.id)
    .eq("viewer_role", "client");
  if (error) {
    if (isMissingTableError(error)) state.readTableAvailable = false;
    return;
  }
  state.readByProviderId = Array.isArray(data)
    ? data.reduce((acc, row) => {
      if (row?.provider_id) acc[row.provider_id] = row.last_read_at || "";
      return acc;
    }, {})
    : {};
};

const markAllProviderThreadsRead = async () => {
  if (!supabase || !state.user || !state.readTableAvailable) return;
  const payload = state.providers
    .map((provider) => {
      const latestIncoming = getIncomingLatestByProvider(provider);
      if (!provider?.providerId || !latestIncoming) return null;
      return {
        provider_id: provider.providerId,
        client_id: state.user.id,
        viewer_user_id: state.user.id,
        viewer_role: "client",
        last_read_at: latestIncoming,
      };
    })
    .filter(Boolean);
  if (!payload.length) return;
  const { error } = await supabase
    .from("message_thread_reads")
    .upsert(payload, { onConflict: "provider_id,client_id,viewer_user_id,viewer_role" });
  if (error) {
    if (isMissingTableError(error)) state.readTableAvailable = false;
    return;
  }
  payload.forEach((row) => {
    state.readByProviderId[row.provider_id] = row.last_read_at;
  });
};

const subscribeRealtime = () => {
  if (!supabase || !state.user || realtimeChannel) return;
  realtimeChannel = supabase
    .channel(`client-messages-${state.user.id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "job_messages",
      filter: `client_id=eq.${state.user.id}`,
    }, () => {
      hydrate({ preserveSelection: true, silent: true });
    })
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "direct_messages",
      filter: `client_id=eq.${state.user.id}`,
    }, () => {
      hydrate({ preserveSelection: true, silent: true });
    })
    .subscribe();
};

const renderThreads = () => {
  if (!threadListEl) return;
  threadListEl.innerHTML = "";
  if (!state.providers.length) {
    threadListEl.innerHTML = "<p class='muted'>No conversations yet. Use Contact on Discover to start one.</p>";
    return;
  }

  state.providers.forEach((provider) => {
    const item = document.createElement("button");
    item.className = `message-thread-item ${state.selectedProviderId === provider.providerId ? "active" : ""}`;
    item.type = "button";
    item.innerHTML = `
      <img class="message-thread-avatar" src="${provider.providerAvatar || fallbackAvatar}" alt="${provider.providerName || "Plug"}" />
      <strong>${provider.providerName || "Plug"}</strong>
      <p class="muted">${provider.jobCount > 0 ? `${provider.jobCount} ${provider.jobCount === 1 ? "job" : "jobs"}` : "Direct chat"}</p>
      <span class="message-thread-kind ${provider.channel === "direct" ? "direct" : "job"}">${provider.channel === "direct" ? "Direct" : "Job"}</span>
      <p class="muted">${provider.preview || "No messages yet."}</p>
      <span class="pill">${formatTime(provider.lastMessageAt)}</span>
      ${getUnreadCountForProvider(provider) > 0 ? `<span class="message-thread-unread">${getUnreadCountForProvider(provider) > 99 ? "99+" : getUnreadCountForProvider(provider)}</span>` : ""}
    `;
    item.addEventListener("click", () => {
      state.selectedProviderId = provider.providerId;
      markProviderThreadRead(provider).finally(() => {
        renderThreads();
        renderMessages();
        setChatMode(true);
      });
    });
    threadListEl.appendChild(item);
  });
};

const renderMessages = () => {
  if (!feedEl) return;
  const provider = getSelectedProvider();
  if (!provider) {
    feedEl.innerHTML = "<p class='muted'>Choose a conversation.</p>";
    if (threadTitleEl) threadTitleEl.textContent = "Select a conversation";
    if (sendEl) sendEl.disabled = true;
    setChatMode(false);
    return;
  }

  if (threadTitleEl) threadTitleEl.textContent = provider.providerName || "Plug";
  if (sendEl) sendEl.disabled = false;

  const rows = provider.messages || [];
  if (!rows.length) {
    feedEl.innerHTML = "<p class='muted'>No messages yet. Send the first message.</p>";
    return;
  }

  feedEl.innerHTML = "";
  rows.forEach((row) => {
    const mine = row.sender_user_id === state.user.id;
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${mine ? "mine" : "theirs"}`;
    bubble.innerHTML = `
      <p>${row.message_text}</p>
      <span>${formatTime(row.created_at)}</span>
    `;
    feedEl.appendChild(bubble);
  });
  feedEl.scrollTop = feedEl.scrollHeight;
};

const loadMessages = async () => {
  if (!supabase || !state.user || !state.tableAvailable) return [];
  const { data, error } = await supabase
    .from("job_messages")
    .select("id,job_id,provider_id,client_id,sender_user_id,sender_role,message_text,created_at")
    .eq("client_id", state.user.id)
    .order("created_at", { ascending: true });
  if (!error && Array.isArray(data)) return data;
  if (isMissingTableError(error)) {
    state.tableAvailable = false;
    setStatus("Messaging table is not available yet. Run supabase/job_messages.sql", "error");
  }
  return [];
};

const loadDirectMessages = async () => {
  if (!supabase || !state.user || !state.directTableAvailable) return [];
  const { data, error } = await supabase
    .from("direct_messages")
    .select("id,provider_id,client_id,sender_user_id,sender_role,message_text,created_at")
    .eq("client_id", state.user.id)
    .order("created_at", { ascending: true });
  if (!error && Array.isArray(data)) return data;
  if (isMissingTableError(error)) {
    state.directTableAvailable = false;
  }
  return [];
};

const loadProviderPreview = async (providerId) => {
  if (!supabase || !providerId) return null;
  const { data } = await supabase
    .from("providers")
    .select("id,name,avatar_url,owner_id")
    .eq("id", providerId)
    .maybeSingle();
  return data || null;
};

const loadProvidersByIds = async (providerIds) => {
  if (!supabase || !Array.isArray(providerIds) || !providerIds.length) return {};
  const ids = [...new Set(providerIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("providers")
    .select("id,name,avatar_url,owner_id")
    .in("id", ids);
  if (error || !Array.isArray(data)) return {};
  return data.reduce((acc, row) => {
    if (row?.id) acc[row.id] = row;
    return acc;
  }, {});
};

const loadThreads = async () => {
  const { data, error } = await supabase
    .from("job_requests")
    .select("job_id,provider_id,status,created_at,jobs(id,title,location,client_id),providers(id,name,avatar_url,owner_id)")
    .in("status", ["accepted", "completed", "closed"])
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data.filter((row) => row.jobs?.client_id === state.user.id);
};

const hydrate = async ({ preserveSelection = true, silent = false } = {}) => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  state.user = user;
  subscribeRealtime();

  const [threadsRaw, messages, directMessages, previewProvider] = await Promise.all([
    loadThreads(),
    loadMessages(),
    loadDirectMessages(),
    queryProviderId ? loadProviderPreview(queryProviderId) : Promise.resolve(null),
  ]);
  const providersById = {};

  threadsRaw.forEach((row) => {
    if (!providersById[row.provider_id]) {
      providersById[row.provider_id] = {
        providerId: row.provider_id,
        providerName: row.providers?.name || "Plug",
        providerOwnerId: row.providers?.owner_id || "",
        providerAvatar: row.providers?.avatar_url || fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobs: [],
        jobMap: {},
        activeJobId: row.job_id,
        jobCount: 0,
        channel: "job",
      };
    }
    const provider = providersById[row.provider_id];
    if (provider.providerOwnerId && provider.providerOwnerId === state.user.id) return;
    if (!provider.jobMap[row.job_id]) {
      const jobRow = {
        jobId: row.job_id,
        jobTitle: row.jobs?.title || "Job",
        location: row.jobs?.location || "",
      };
      provider.jobMap[row.job_id] = jobRow;
      provider.jobs.push(jobRow);
      provider.jobCount += 1;
    }
  });

  messages.forEach((row) => {
    if (!providersById[row.provider_id]) {
      providersById[row.provider_id] = {
        providerId: row.provider_id,
        providerName: "Plug",
        providerAvatar: fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobs: [],
        jobMap: {},
        activeJobId: row.job_id,
        jobCount: 0,
        channel: "job",
      };
    }
    const provider = providersById[row.provider_id];
    provider.messages.push(row);
    provider.preview = row.message_text;
    provider.lastMessageAt = row.created_at;
    if (!provider.jobMap[row.job_id]) {
      const fallbackJob = { jobId: row.job_id, jobTitle: "Job", location: "" };
      provider.jobMap[row.job_id] = fallbackJob;
      provider.jobs.push(fallbackJob);
      provider.jobCount += 1;
    }
      provider.activeJobId = row.job_id;
  });

  directMessages.forEach((row) => {
    if (!providersById[row.provider_id]) {
      providersById[row.provider_id] = {
        providerId: row.provider_id,
        providerName: "Plug",
        providerAvatar: fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobs: [],
        jobMap: {},
        activeJobId: null,
        jobCount: 0,
        channel: "direct",
      };
    }
    const provider = providersById[row.provider_id];
    if (!provider.channel || provider.channel !== "job") provider.channel = "direct";
    provider.messages.push(row);
    provider.preview = row.message_text;
    provider.lastMessageAt = row.created_at;
    provider.activeJobId = null;
  });

  const providerMetaById = await loadProvidersByIds(Object.keys(providersById));
  Object.values(providersById).forEach((provider) => {
    const meta = providerMetaById[provider.providerId];
    if (!meta) return;
    if (!provider.providerName || provider.providerName === "Plug") {
      provider.providerName = meta.name || provider.providerName;
    }
    if (!provider.providerAvatar || provider.providerAvatar === fallbackAvatar) {
      provider.providerAvatar = meta.avatar_url || provider.providerAvatar;
    }
    provider.providerOwnerId = meta.owner_id || provider.providerOwnerId || "";
  });

  state.providers = Object.values(providersById).sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  state.providers = state.providers.filter((provider) => provider.providerOwnerId !== state.user.id);
  if (queryProviderId && !state.providers.find((provider) => provider.providerId === queryProviderId)) {
    state.providers.unshift({
      providerId: queryProviderId,
      providerName: previewProvider?.name || queryProviderName || "Plug",
      providerOwnerId: previewProvider?.owner_id || "",
      providerAvatar: previewProvider?.avatar_url || queryProviderAvatar || fallbackAvatar,
      preview: "",
      lastMessageAt: null,
      messages: [],
      jobs: [],
      jobMap: {},
      activeJobId: null,
      jobCount: 0,
      channel: "direct",
    });
  }
  if (queryProviderId) {
    const existing = state.providers.find((provider) => provider.providerId === queryProviderId);
    if (existing) {
      if ((!existing.providerName || existing.providerName === "Plug") && queryProviderName) {
        existing.providerName = queryProviderName;
      }
      if ((!existing.providerAvatar || existing.providerAvatar === fallbackAvatar) && queryProviderAvatar) {
        existing.providerAvatar = queryProviderAvatar;
      }
    }
  }
  const previousSelected = preserveSelection ? state.selectedProviderId : null;
  state.selectedProviderId = previousSelected
    || queryProviderId
    || state.providers[0]?.providerId
    || null;

  if (state.selectedProviderId && queryJobId) {
    const selected = state.providers.find((provider) => provider.providerId === state.selectedProviderId);
    if (selected && selected.jobMap[queryJobId]) {
      selected.activeJobId = queryJobId;
    }
  }

  await loadReadState();
  const onMessagesPage = window.location.pathname.includes("/client/client-messages.html");
  if (onMessagesPage) {
    await markAllProviderThreadsRead();
  }
  const selectedProvider = getSelectedProvider();
  if (selectedProvider && state.chatOpen) {
    await markProviderThreadRead(selectedProvider);
  }
  renderThreads();
  renderMessages();
  setChatMode(Boolean(state.selectedProviderId && (queryProviderId || state.chatOpen)));
  if (!silent) setStatus("");
};

const sendMessage = async (event) => {
  event.preventDefault();
  if (!supabase || !state.user || !state.selectedProviderId) return;
  const provider = getSelectedProvider();
  if (!provider) return;
  if (provider.providerOwnerId && provider.providerOwnerId === state.user.id) {
    setStatus("You cannot message your own provider profile.", "error");
    return;
  }
  const text = (inputEl?.value || "").trim();
  if (!text) return;

  const selectedJobId = provider.activeJobId || provider.jobs[0]?.jobId;
  if (sendEl) sendEl.disabled = true;
  setStatus("Sending...", "info");
  let error = null;
  if (selectedJobId) {
    const result = await supabase
      .from("job_messages")
      .insert({
        job_id: selectedJobId,
        provider_id: provider.providerId,
        client_id: state.user.id,
        sender_user_id: state.user.id,
        sender_role: "client",
        message_text: text,
      });
    error = result.error;
    if (error && (error.code === "42501" || error.status === 401 || error.status === 403)) {
      const directFallback = await supabase
        .from("direct_messages")
        .insert({
          provider_id: provider.providerId,
          client_id: state.user.id,
          sender_user_id: state.user.id,
          sender_role: "client",
          message_text: text,
        });
      error = directFallback.error;
    }
  } else {
    const result = await supabase
      .from("direct_messages")
      .insert({
        provider_id: provider.providerId,
        client_id: state.user.id,
        sender_user_id: state.user.id,
        sender_role: "client",
        message_text: text,
      });
    error = result.error;
  }
  if (error) {
    if (isMissingTableError(error)) {
      setStatus("Direct messaging is not enabled yet. Run supabase/direct_messages.sql", "error");
      if (sendEl) sendEl.disabled = false;
      return;
    }
    setStatus(error.message || "Could not send message.", "error");
    if (sendEl) sendEl.disabled = false;
    return;
  }

  provider.activeJobId = selectedJobId;
  if (inputEl) inputEl.value = "";
  setStatus("Message sent.", "success");
  await hydrate({ preserveSelection: true, silent: true });
  if (sendEl) sendEl.disabled = false;
};

formEl?.addEventListener("submit", sendMessage);
backButtonEl?.addEventListener("click", () => setChatMode(false));
hydrate();
