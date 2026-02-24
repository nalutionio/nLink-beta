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
  providerId: null,
  clients: [],
  selectedClientId: null,
  tableAvailable: true,
  directTableAvailable: true,
  chatOpen: false,
};

const fallbackAvatar = "../assets/nlinkiconblk.png";

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

const loadProviderId = async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  return data?.id || null;
};

const getSelectedClient = () => state.clients.find((item) => item.clientId === state.selectedClientId) || null;

const renderThreads = () => {
  if (!threadListEl) return;
  threadListEl.innerHTML = "";
  if (!state.clients.length) {
    threadListEl.innerHTML = "<p class='muted'>No conversations yet. Clients must message first.</p>";
    return;
  }
  state.clients.forEach((client) => {
    const item = document.createElement("button");
    item.className = `message-thread-item ${state.selectedClientId === client.clientId ? "active" : ""}`;
    item.type = "button";
    item.innerHTML = `
      <img class="message-thread-avatar" src="${client.clientAvatar || fallbackAvatar}" alt="${client.clientName || "Client"}" />
      <strong>${client.clientName || "Client"}</strong>
      <p class="muted">${client.jobCount > 0 ? `${client.jobCount} ${client.jobCount === 1 ? "job" : "jobs"}` : "Direct chat"}</p>
      <span class="message-thread-kind ${client.channel === "direct" ? "direct" : "job"}">${client.channel === "direct" ? "Direct" : "Job"}</span>
      <p class="muted">${client.preview || "No messages yet."}</p>
      <span class="pill">${formatTime(client.lastMessageAt)}</span>
    `;
    item.addEventListener("click", () => {
      state.selectedClientId = client.clientId;
      renderThreads();
      renderMessages();
      setChatMode(true);
    });
    threadListEl.appendChild(item);
  });
};

const renderMessages = () => {
  if (!feedEl) return;
  const client = getSelectedClient();
  if (!client) {
    feedEl.innerHTML = "<p class='muted'>Choose a conversation.</p>";
    if (threadTitleEl) threadTitleEl.textContent = "Select a conversation";
    if (sendEl) sendEl.disabled = true;
    setChatMode(false);
    return;
  }

  if (threadTitleEl) threadTitleEl.textContent = client.clientName || "Client";
  if (sendEl) sendEl.disabled = false;

  const rows = client.messages || [];
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

const loadThreads = async () => {
  const { data, error } = await supabase
    .from("job_requests")
    .select("job_id,provider_id,status,created_at,jobs(id,title,location,client_id,client_name,client_avatar_url)")
    .eq("provider_id", state.providerId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data;
};

const loadMessages = async () => {
  if (!state.tableAvailable) return [];
  const { data, error } = await supabase
    .from("job_messages")
    .select("id,job_id,provider_id,client_id,sender_user_id,sender_role,message_text,created_at")
    .eq("provider_id", state.providerId)
    .order("created_at", { ascending: true });
  if (!error && Array.isArray(data)) return data;
  if (isMissingTableError(error)) {
    state.tableAvailable = false;
    setStatus("Messaging table is not available yet. Run supabase/job_messages.sql", "error");
  }
  return [];
};

const loadDirectMessages = async () => {
  if (!state.directTableAvailable) return [];
  const { data, error } = await supabase
    .from("direct_messages")
    .select("id,provider_id,client_id,sender_user_id,sender_role,message_text,created_at")
    .eq("provider_id", state.providerId)
    .order("created_at", { ascending: true });
  if (!error && Array.isArray(data)) return data;
  if (isMissingTableError(error)) {
    state.directTableAvailable = false;
  }
  return [];
};

const hydrate = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  state.user = user;
  state.providerId = await loadProviderId();
  if (!state.providerId) return;

  const params = new URLSearchParams(window.location.search);
  const queryClientId = params.get("client");

  const [threadsRaw, messages, directMessages] = await Promise.all([
    loadThreads(),
    loadMessages(),
    loadDirectMessages(),
  ]);
  const clientsById = {};

  threadsRaw.forEach((row) => {
    const clientId = row.jobs?.client_id || "";
    if (!clientId) return;
    if (clientId === state.user.id) return;
    if (!clientsById[clientId]) {
      clientsById[clientId] = {
        clientId,
        clientName: row.jobs?.client_name || "Client",
        clientAvatar: row.jobs?.client_avatar_url || fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobCount: 0,
        jobIds: new Set(),
        anchorJobId: row.job_id,
        clientInitiated: false,
        channel: "job",
      };
    }
    const client = clientsById[clientId];
    if (!client.jobIds.has(row.job_id)) {
      client.jobIds.add(row.job_id);
      client.jobCount += 1;
    }
  });

  messages.forEach((row) => {
    if (row.client_id === state.user.id) return;
    if (!clientsById[row.client_id]) {
      clientsById[row.client_id] = {
        clientId: row.client_id,
        clientName: "Client",
        clientAvatar: fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobCount: 0,
        jobIds: new Set(),
        anchorJobId: row.job_id,
        clientInitiated: false,
        channel: "job",
      };
    }
    const client = clientsById[row.client_id];
    client.messages.push(row);
    if (row.sender_role === "client") client.clientInitiated = true;
    client.preview = row.message_text;
    client.lastMessageAt = row.created_at;
    if (!client.jobIds.has(row.job_id)) {
      client.jobIds.add(row.job_id);
      client.jobCount += 1;
    }
    client.anchorJobId = row.job_id;
  });

  directMessages.forEach((row) => {
    if (row.client_id === state.user.id) return;
    if (!clientsById[row.client_id]) {
      clientsById[row.client_id] = {
        clientId: row.client_id,
        clientName: "Client",
        clientAvatar: fallbackAvatar,
        preview: "",
        lastMessageAt: row.created_at,
        messages: [],
        jobCount: 0,
        jobIds: new Set(),
        anchorJobId: null,
        clientInitiated: false,
        channel: "direct",
      };
    }
    const client = clientsById[row.client_id];
    if (client.channel !== "job") {
      client.channel = "direct";
      client.anchorJobId = null;
    }
    client.messages.push(row);
    if (row.sender_role === "client") client.clientInitiated = true;
    client.preview = row.message_text;
    client.lastMessageAt = row.created_at;
  });

  state.clients = Object.values(clientsById)
    .filter((client) => client.clientInitiated)
    .map((client) => ({ ...client, jobIds: undefined }))
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  state.selectedClientId = queryClientId || state.clients[0]?.clientId || null;

  renderThreads();
  renderMessages();
  setChatMode(Boolean(state.selectedClientId && (queryClientId || state.chatOpen)));
};

const sendMessage = async (event) => {
  event.preventDefault();
  if (!supabase || !state.user || !state.selectedClientId) return;
  const client = getSelectedClient();
  if (!client) return;
  if (client.clientId === state.user.id) {
    setStatus("You cannot message your own client profile.", "error");
    return;
  }
  const text = (inputEl?.value || "").trim();
  if (!text) return;

  const anchorJobId = client.anchorJobId;
  if (!client.clientInitiated) {
    setStatus("Client must message first after accepting your proposal.", "error");
    return;
  }

  if (sendEl) sendEl.disabled = true;
  setStatus("Sending...", "info");
  let error = null;
  if (anchorJobId) {
    const result = await supabase
      .from("job_messages")
      .insert({
        job_id: anchorJobId,
        provider_id: state.providerId,
        client_id: client.clientId,
        sender_user_id: state.user.id,
        sender_role: "provider",
        message_text: text,
      });
    error = result.error;
    if (error && (error.code === "42501" || error.status === 401 || error.status === 403)) {
      const directFallback = await supabase
        .from("direct_messages")
        .insert({
          provider_id: state.providerId,
          client_id: client.clientId,
          sender_user_id: state.user.id,
          sender_role: "provider",
          message_text: text,
        });
      error = directFallback.error;
    }
  } else {
    const result = await supabase
      .from("direct_messages")
      .insert({
        provider_id: state.providerId,
        client_id: client.clientId,
        sender_user_id: state.user.id,
        sender_role: "provider",
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

  if (inputEl) inputEl.value = "";
  setStatus("Message sent.", "success");
  await hydrate();
  if (sendEl) sendEl.disabled = false;
};

formEl?.addEventListener("submit", sendMessage);
backButtonEl?.addEventListener("click", () => setChatMode(false));
hydrate();
