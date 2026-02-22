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

  const queries = [
    "id,status,created_at,jobs(id,title,location,budget_min,budget_max,client_id,client_name,client_avatar_url,client_location_public,client_email_verified,created_at)",
    "id,status,created_at,jobs(id,title,location,budget_min,budget_max,client_id,created_at)",
  ];
  let data = [];
  for (let i = 0; i < queries.length; i += 1) {
    const result = await supabase
      .from("job_requests")
      .select(queries[i])
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (!result.error && Array.isArray(result.data)) {
      data = result.data;
      break;
    }
    if (!(result.error?.code === "42703" || result.error?.code === "PGRST204" || result.error?.code === "PGRST205")) {
      data = [];
      break;
    }
  }

  const requests = data || [];
  const pending = requests.filter((req) => (req.status || "pending") === "pending");
  const active = requests.filter((req) => req.status === "accepted");
  const closed = requests.filter((req) => req.status === "closed" || req.status === "declined");

  if (pendingEl) {
    pendingEl.innerHTML = "";
    if (pending.length === 0 && active.length === 0) {
      pendingEl.innerHTML = "<p class='muted'>No proposals yet.</p>";
    } else {
      [...pending, ...active].forEach((req) => {
        const clientName = req.jobs?.client_name || "Client";
        const clientAvatar = req.jobs?.client_avatar_url || "../assets/nlinkiconblk.png";
        const clientLocation = toPublicLocation(req.jobs?.client_location_public || req.jobs?.location || "");
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
            <p class="muted">Proposed ${new Date(req.created_at).toLocaleDateString()}</p>
            <div class="mini-client">
              <img src="${clientAvatar}" alt="${clientName}" />
              <div>
                <p class="muted">${clientName} • ${formatMemberSince(req.jobs?.created_at)}</p>
                <p class="muted">${clientLocation || "Location private"} ${req.jobs?.client_email_verified === true ? "• Email verified" : ""}</p>
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
      closedEl.innerHTML = "<p class='muted'>No closed proposals.</p>";
    } else {
      closed.forEach((req) => {
        const clientName = req.jobs?.client_name || "Client";
        const clientAvatar = req.jobs?.client_avatar_url || "../assets/nlinkiconblk.png";
        const clientLocation = toPublicLocation(req.jobs?.client_location_public || req.jobs?.location || "");
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
            <div class="mini-client">
              <img src="${clientAvatar}" alt="${clientName}" />
              <div>
                <p class="muted">${clientName} • ${formatMemberSince(req.jobs?.created_at)}</p>
                <p class="muted">${clientLocation || "Location private"} ${req.jobs?.client_email_verified === true ? "• Email verified" : ""}</p>
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
