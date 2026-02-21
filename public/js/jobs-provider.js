const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const feedEl = document.getElementById("job-feed");
const filterCategory = document.getElementById("filter-category");
const filterCategoryTags = document.getElementById("filter-category-tags");
const filterLocation = document.getElementById("filter-location");
const filterBudgetMin = document.getElementById("filter-budget-min");
const filterBudgetMax = document.getElementById("filter-budget-max");
const applyFiltersButton = document.getElementById("apply-filters");

let jobsCache = [];
let providerId = null;
const requestStatusByJobId = {};
const clientProfileById = {};

if (window.NLINK_SERVICE_TAGS && filterCategoryTags && filterCategory) {
  window.NLINK_SERVICE_TAGS.renderTagPicker({
    container: filterCategoryTags,
    input: filterCategory,
    options: window.NLINK_SERVICE_TAGS.allServiceTags,
    multiple: false,
    allowAll: true,
    allLabel: "All",
  });
}

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

const fetchJobs = async () => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select("id,title,category,location,budget_min,budget_max,sqft,timeline,created_at,status,client_id")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data;
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

const fetchProviderRequests = async () => {
  if (!providerId) return;
  const { data } = await supabase
    .from("job_requests")
    .select("job_id,status")
    .eq("provider_id", providerId);
  (data || []).forEach((row) => {
    requestStatusByJobId[row.job_id] = row.status || "pending";
  });
};

const fetchPhotos = async (jobIds) => {
  if (!jobIds.length) return [];
  const { data } = await supabase
    .from("job_photos")
    .select("job_id,url")
    .in("job_id", jobIds);
  return data || [];
};

const matchesFilters = (job) => {
  const category = filterCategory.value.trim();
  const location = filterLocation.value.trim().toLowerCase();
  const minBudget = Number(filterBudgetMin.value) || 0;
  const maxBudget = Number(filterBudgetMax.value) || Number.POSITIVE_INFINITY;

  const matchesCategory = !category || category === "all" || (job.category || "") === category;
  const matchesLocation = !location || job.location.toLowerCase().includes(location);
  const matchesBudget = job.budget_max >= minBudget && job.budget_min <= maxBudget;

  return matchesCategory && matchesLocation && matchesBudget;
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

const renderJobs = async () => {
  if (!feedEl) return;
  const filtered = jobsCache.filter(matchesFilters);
  const photos = await fetchPhotos(filtered.map((job) => job.id));

  feedEl.innerHTML = "";
  filtered.forEach((job) => {
    const photo = photos.find((item) => item.job_id === job.id);
    const thumb = photo?.url || "../assets/nlinkiconblk.png";
    const client = clientProfileById[job.client_id] || null;
    const clientName = client?.full_name || "Client";
    const clientAvatar = client?.avatar_url || "../assets/nlinkiconblk.png";
    const clientVerified = client?.email_verified === true;
    const clientLocation = toPublicLocation(client?.location || client?.address || job.location || "");
    const clientMember = formatMemberSince(client?.created_at);
    const card = document.createElement("div");
    card.className = "job-card job-link-card";
    card.dataset.href = `../provider/job-detail.html?id=${job.id}`;
    card.innerHTML = `
      <img class="job-thumb" src="${thumb}" alt="${job.title}" />
      <div class="job-card-body">
        <h4>${job.title}</h4>
        <p class="muted">${job.location} • $${job.budget_min} - $${job.budget_max}${job.sqft ? ` • ${job.sqft} sqft` : ""}</p>
        <p class="muted">${job.timeline ? job.timeline : "Flexible timing"} • Posted ${new Date(job.created_at).toLocaleDateString()}</p>
        <div class="mini-client">
          <img src="${clientAvatar}" alt="${clientName}" />
          <div>
            <p class="muted">${clientName} • ${clientMember}</p>
            <p class="muted">${clientLocation || "Location private"} ${clientVerified ? "• Email verified" : ""}</p>
          </div>
        </div>
        <span class="job-link">View details</span>
      </div>
      <div class="job-actions">
        <span class="pill">Open</span>
        <button class="primary-button" data-job-id="${job.id}">${
          requestStatusByJobId[job.id]
            ? (requestStatusByJobId[job.id] === "accepted" ? "Accepted" : "Requested")
            : "Request to Quote"
        }</button>
      </div>
    `;
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      window.location.href = card.dataset.href;
    });
    card.querySelector("button")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const jobId = event.currentTarget.dataset.jobId;
      await requestQuote(jobId, event.currentTarget);
    });
    const actionButton = card.querySelector("button");
    if (actionButton && requestStatusByJobId[job.id]) {
      actionButton.disabled = true;
    }
    feedEl.appendChild(card);
  });
};

const requestQuote = async (jobId, button) => {
  if (!supabase) return;
  if (!providerId) {
    alert("Create your provider profile before requesting jobs.");
    return;
  }

  button.disabled = true;
  const { data: existing } = await supabase
    .from("job_requests")
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    const status = existing.status || "pending";
    requestStatusByJobId[jobId] = status;
    button.textContent = status === "accepted" ? "Accepted" : "Requested";
    button.disabled = true;
    return;
  }

  const { error } = await supabase.from("job_requests").insert({
    job_id: jobId,
    provider_id: providerId,
    status: "pending",
  });

  if (error) {
    alert(error.message || "Could not request this job.");
    button.disabled = false;
    return;
  }

  requestStatusByJobId[jobId] = "pending";
  button.textContent = "Requested";
  button.disabled = true;
};

const init = async () => {
  if (!supabase) return;
  providerId = await loadProviderId();
  await fetchProviderRequests();
  jobsCache = await fetchJobs();
  const clients = await fetchClients(jobsCache.map((job) => job.client_id));
  clients.forEach((client) => {
    if (client?.user_id) clientProfileById[client.user_id] = client;
  });
  await renderJobs();
};

applyFiltersButton?.addEventListener("click", renderJobs);

init();
