const dashboardSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const savedCountEl = document.getElementById("client-stat-saved");
const savedTrendEl = document.getElementById("client-stat-saved-trend");
const bookingsEl = document.getElementById("client-stat-bookings");
const reviewsEl = document.getElementById("client-stat-reviews");
const headingEl = document.querySelector(".topbar-title h1");
const savedSummaryEl = document.getElementById("dashboard-saved-summary");
const previousProvidersEl = document.getElementById("dashboard-previous-providers");
const openJobsEl = document.getElementById("dashboard-open-jobs");
const inProgressJobsEl = document.getElementById("dashboard-in-progress-jobs");
const completedJobsEl = document.getElementById("dashboard-completed-jobs");
const pendingRequestsEl = document.getElementById("dashboard-pending-requests");

const storageKey = "nlink_saved";
const fallbackAvatar = "../assets/nlinkiconblk.png";

const isMissingColumnError = (error) => Boolean(error)
  && ["42703", "PGRST204", "PGRST205"].includes(error.code);

const getSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch (_error) {
    return [];
  }
};

const selectClientProfile = async (userId) => {
  const tries = [
    "id,full_name,nick_name,email,phone,avatar_url,banner_url,location,address",
    "id,full_name,nick_name,email,phone,avatar_url,location,address",
    "id,full_name,nick_name,email,phone,avatar_url,location",
    "id,full_name,nick_name,email,phone,avatar_url",
  ];

  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await dashboardSupabase
      .from("clients")
      .select(tries[i])
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return data || null;
    if (!isMissingColumnError(error)) return null;
  }
  return null;
};

const fetchProviders = async (providerIds) => {
  if (!Array.isArray(providerIds) || !providerIds.length) return [];
  const uniqueIds = Array.from(new Set(providerIds.filter(Boolean)));
  if (!uniqueIds.length) return [];
  const tries = [
    "id,name,avatar_url,location,category",
    "id,name,avatar_url,location",
    "id,name,avatar_url",
    "id,name",
  ];
  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await dashboardSupabase
      .from("providers")
      .select(tries[i])
      .in("id", uniqueIds);
    if (!error && Array.isArray(data)) return data;
    if (!isMissingColumnError(error)) return [];
  }
  return [];
};

const normalizeJobStatus = (status) => {
  if (status === "accepted") return "in_progress";
  if (!status) return "open";
  return status;
};

const renderPreviousProviders = (rows, providerById) => {
  if (!previousProvidersEl) return;
  previousProvidersEl.innerHTML = "";
  if (!rows.length) {
    previousProvidersEl.innerHTML = "<p class='muted'>No completed providers yet.</p>";
    return;
  }
  rows.slice(0, 3).forEach((row) => {
    const provider = providerById[row.provider_id] || null;
    const name = provider?.name || "Provider";
    const avatar = provider?.avatar_url || fallbackAvatar;
    const location = provider?.location || "";
    const item = document.createElement("div");
    item.className = "settings-item";
    item.innerHTML = `
      <div class="mini-client">
        <img src="${avatar}" alt="${name}" />
        <div>
          <h4>${name}</h4>
          <p class="muted">${location || "Location not set"}</p>
        </div>
      </div>
    `;
    previousProvidersEl.appendChild(item);
  });
};

const loadDashboard = async () => {
  const saved = getSaved();
  if (savedCountEl) savedCountEl.textContent = String(saved.length);
  if (savedTrendEl) {
    savedTrendEl.textContent = saved.length
      ? `${saved.length} provider${saved.length === 1 ? "" : "s"} in your shortlist`
      : "Start swiping to build your shortlist";
    savedTrendEl.classList.toggle("up", saved.length > 0);
  }
  if (savedSummaryEl) {
    savedSummaryEl.textContent = saved.length
      ? `${saved.length} saved provider${saved.length === 1 ? "" : "s"} ready for follow-up.`
      : "No saved providers yet. Swipe to build your shortlist.";
  }
  if (bookingsEl) bookingsEl.textContent = "0";
  if (reviewsEl) reviewsEl.textContent = "0";

  if (!dashboardSupabase) return;
  const { data } = await dashboardSupabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const meta = user.user_metadata || {};
  const profile = await selectClientProfile(user.id);
  const displayName = profile?.full_name || meta.client_name || user.email?.split("@")[0] || "there";
  if (headingEl) headingEl.textContent = `Welcome back, ${displayName}.`;

  const { data: jobs } = await dashboardSupabase
    .from("jobs")
    .select("id,status")
    .eq("client_id", user.id);
  const jobIds = (jobs || []).map((job) => job.id).filter(Boolean);
  const openJobs = (jobs || []).filter((job) => normalizeJobStatus(job.status) === "open").length;
  const inProgressJobs = (jobs || []).filter((job) => normalizeJobStatus(job.status) === "in_progress").length;
  const completedJobs = (jobs || []).filter((job) => normalizeJobStatus(job.status) === "closed").length;

  let acceptedRequests = 0;
  let pendingRequests = 0;
  let completedRequestRows = [];
  if (jobIds.length > 0) {
    const { count } = await dashboardSupabase
      .from("job_requests")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .eq("status", "accepted");
    acceptedRequests = count || 0;

    const { count: pendingCount } = await dashboardSupabase
      .from("job_requests")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .eq("status", "pending");
    pendingRequests = pendingCount || 0;

    const { data: completedRows } = await dashboardSupabase
      .from("job_requests")
      .select("provider_id,status,created_at")
      .in("job_id", jobIds)
      .in("status", ["accepted", "closed"])
      .order("created_at", { ascending: false });
    completedRequestRows = completedRows || [];
  }

  if (bookingsEl) bookingsEl.textContent = String(acceptedRequests);
  if (reviewsEl) reviewsEl.textContent = String(openJobs);
  if (openJobsEl) openJobsEl.textContent = String(openJobs);
  if (inProgressJobsEl) inProgressJobsEl.textContent = String(inProgressJobs);
  if (completedJobsEl) completedJobsEl.textContent = String(completedJobs);
  if (pendingRequestsEl) pendingRequestsEl.textContent = String(pendingRequests);

  const providers = await fetchProviders(completedRequestRows.map((row) => row.provider_id));
  const providerById = {};
  providers.forEach((provider) => {
    if (provider?.id) providerById[provider.id] = provider;
  });
  renderPreviousProviders(completedRequestRows, providerById);
};

loadDashboard();
