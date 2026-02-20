const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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

const renderRequests = async () => {
  if (!supabase) return;
  const providerId = await loadProviderId();
  if (!providerId) return;

  const { data } = await supabase
    .from("job_requests")
    .select("id,status,created_at,jobs(id,title,location,budget_min,budget_max)")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const requests = data || [];
  const pending = requests.filter((req) => req.status !== "closed");
  const closed = requests.filter((req) => req.status === "closed");

  if (pendingEl) {
    pendingEl.innerHTML = "";
    if (pending.length === 0) {
      pendingEl.innerHTML = "<p class='muted'>No requests yet.</p>";
    } else {
      pending.forEach((req) => {
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
            <p class="muted">Requested ${new Date(req.created_at).toLocaleDateString()}</p>
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
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${req.jobs?.title || "Job"}</h4>
            <p class="muted">${req.jobs?.location || ""} • $${req.jobs?.budget_min || 0} - $${req.jobs?.budget_max || 0}</p>
          </div>
          <span class="pill">Closed</span>
        `;
        closedEl.appendChild(card);
      });
    }
  }
};

renderRequests();
