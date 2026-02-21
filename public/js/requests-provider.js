const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const pendingEl = document.getElementById("request-list");
const closedEl = document.getElementById("request-closed");

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
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

const fetchClients = async (clientIds) => {
  if (!supabase || !Array.isArray(clientIds) || !clientIds.length) return [];
  const ids = Array.from(new Set(clientIds.filter(Boolean)));
  if (!ids.length) return [];
  const tries = [
    "user_id,full_name,avatar_url,location,address,created_at,email_verified",
    "user_id,full_name,avatar_url,location,address,created_at",
    "user_id,full_name,avatar_url,location,created_at",
    "user_id,full_name,avatar_url,created_at",
  ];
  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await supabase
      .from("clients")
      .select(tries[i])
      .in("user_id", ids);
    if (!error && Array.isArray(data)) return data;
    if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return [];
  }
  return [];
};

const toPublicLocation = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
};

const formatMemberSince = (value) => {
  if (!value) return "Member";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member";
  return `Member since ${date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
};

const renderRequests = async () => {
  if (!supabase) return;
  const providerId = await loadProviderId();
  if (!providerId) return;

  const { data } = await supabase
    .from("job_requests")
    .select("id,status,created_at,jobs(id,title,location,budget_min,budget_max,client_id)")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const requests = data || [];
  const clients = await fetchClients(requests.map((req) => req.jobs?.client_id));
  const clientById = {};
  clients.forEach((client) => {
    if (client?.user_id) clientById[client.user_id] = client;
  });
  const pending = requests.filter((req) => (req.status || "pending") === "pending");
  const active = requests.filter((req) => req.status === "accepted");
  const closed = requests.filter((req) => req.status === "closed" || req.status === "declined");

  if (pendingEl) {
    pendingEl.innerHTML = "";
    if (pending.length === 0 && active.length === 0) {
      pendingEl.innerHTML = "<p class='muted'>No requests yet.</p>";
    } else {
      [...pending, ...active].forEach((req) => {
        const client = clientById[req.jobs?.client_id] || null;
        const clientName = client?.full_name || "Client";
        const clientAvatar = client?.avatar_url || "../assets/nlinkiconblk.png";
        const clientLocation = toPublicLocation(client?.location || client?.address || req.jobs?.location || "");
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
            <p class="muted">Requested ${new Date(req.created_at).toLocaleDateString()}</p>
            <div class="mini-client">
              <img src="${clientAvatar}" alt="${clientName}" />
              <div>
                <p class="muted">${clientName} • ${formatMemberSince(client?.created_at)}</p>
                <p class="muted">${clientLocation || "Location private"} ${client?.email_verified === true ? "• Email verified" : ""}</p>
              </div>
            </div>
          </div>
          <div class="job-actions">
            <span class="pill">${req.status || "pending"}</span>
            <a class="ghost-button" href="../provider/job-detail.html?id=${req.jobs?.id || ""}">View</a>
          </div>
        `;
        pendingEl.appendChild(card);
      });
    }
  }

  if (closedEl) {
    closedEl.innerHTML = "";
    if (closed.length === 0) {
      closedEl.innerHTML = "<p class='muted'>No closed requests.</p>";
    } else {
      closed.forEach((req) => {
        const client = clientById[req.jobs?.client_id] || null;
        const clientName = client?.full_name || "Client";
        const clientAvatar = client?.avatar_url || "../assets/nlinkiconblk.png";
        const clientLocation = toPublicLocation(client?.location || client?.address || req.jobs?.location || "");
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
            <div class="mini-client">
              <img src="${clientAvatar}" alt="${clientName}" />
              <div>
                <p class="muted">${clientName} • ${formatMemberSince(client?.created_at)}</p>
                <p class="muted">${clientLocation || "Location private"} ${client?.email_verified === true ? "• Email verified" : ""}</p>
              </div>
            </div>
          </div>
          <span class="pill">Closed</span>
        `;
        closedEl.appendChild(card);
      });
    }
  }
};

renderRequests();
