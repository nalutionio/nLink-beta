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
const filterToggleButton = document.getElementById("filter-toggle");
const filtersContent = document.getElementById("filters-content");

let jobsCache = [];
let providerId = null;
let providerUserId = null;
const requestStatusByJobId = {};
const clientInitiatedByJobId = {};
let jobEventsTableAvailable = true;

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

const isMissingTableError = (error) => Boolean(error)
  && (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.status === 404
  );

const logJobEvent = async (jobId, eventType, metadata = {}) => {
  if (!supabase || !jobEventsTableAvailable || !jobId || !eventType) return;
  try {
    const user = await getSessionUser();
    const { error } = await supabase
      .from("job_events")
      .insert({
        job_id: jobId,
        actor_user_id: user?.id || null,
        actor_role: "provider",
        event_type: eventType,
        metadata,
      });
    if (isMissingTableError(error)) jobEventsTableAvailable = false;
  } catch (_error) {
    jobEventsTableAvailable = false;
  }
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
  const user = await getSessionUser();
  if (!user) return [];
  providerUserId = user.id;
  const queries = [
    "id,title,category,location,budget_min,budget_max,sqft,timeline,created_at,status,client_id,client_name,client_avatar_url,client_location_public,client_email_verified",
    "id,title,category,location,budget_min,budget_max,sqft,timeline,created_at,status,client_id",
  ];
  for (let i = 0; i < queries.length; i += 1) {
    const { data, error } = await supabase
      .from("jobs")
      .select(queries[i])
      .eq("status", "open")
      .neq("client_id", user.id)
      .order("created_at", { ascending: false });
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

const fetchClientInitiatedMessages = async (jobIds) => {
  Object.keys(clientInitiatedByJobId).forEach((key) => delete clientInitiatedByJobId[key]);
  if (!jobIds.length) return;
  const { data } = await supabase
    .from("job_messages")
    .select("job_id,sender_role")
    .eq("provider_id", providerId)
    .eq("sender_role", "client")
    .in("job_id", jobIds);
  (data || []).forEach((row) => {
    if (row.job_id) clientInitiatedByJobId[row.job_id] = true;
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

const renderJobs = async () => {
  if (!feedEl) return;
  const filtered = jobsCache.filter(matchesFilters);
  const photos = await fetchPhotos(filtered.map((job) => job.id));

  feedEl.innerHTML = "";
  filtered.forEach((job) => {
    if (providerUserId && job.client_id === providerUserId) return;
    const photo = photos.find((item) => item.job_id === job.id);
    const thumb = photo?.url || "../assets/nlinkiconblk.png";
    const requestStatus = requestStatusByJobId[job.id];
    const canMessage = requestStatus === "accepted" && clientInitiatedByJobId[job.id];
    const card = document.createElement("div");
    card.className = "job-card job-link-card";
    card.dataset.href = `../provider/job-detail.html?id=${job.id}&from=discover`;
    card.innerHTML = `
      <img class="job-thumb" src="${thumb}" alt="${job.title}" />
      <div class="job-card-body">
        <h4>${job.title}</h4>
        <p class="muted">${job.location} • $${job.budget_min} - $${job.budget_max}${job.sqft ? ` • ${job.sqft} sqft` : ""}</p>
        <p class="muted">${job.timeline ? job.timeline : "Flexible timing"} • Posted ${new Date(job.created_at).toLocaleDateString()}</p>
        <span class="job-link">View details</span>
      </div>
      <div class="job-actions">
        <span class="pill">Open</span>
        <button class="primary-button" data-job-id="${job.id}">${
          requestStatus
            ? (requestStatus === "accepted" ? "Accepted" : "Proposal Sent")
            : "Build Proposal"
        }</button>
        ${canMessage && job.client_id && job.client_id !== providerUserId ? `<a class="ghost-button" href="../provider/provider-messages.html?job=${job.id}&client=${job.client_id || ""}">Message</a>` : ""}
      </div>
    `;
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      window.location.href = card.dataset.href;
    });
    card.querySelector("button")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const jobId = event.currentTarget.dataset.jobId;
      const status = requestStatusByJobId[jobId];
      if (status) return;
      window.location.href = `../provider/job-detail.html?id=${jobId}&from=discover&compose=1`;
    });
    const actionButton = card.querySelector("button");
    if (actionButton && requestStatusByJobId[job.id]) {
      actionButton.disabled = true;
    }
    feedEl.appendChild(card);
  });
};

const setFilterVisibility = (isVisible) => {
  if (!filtersContent || !filterToggleButton) return;
  filtersContent.classList.toggle("hidden", !isVisible);
  filterToggleButton.textContent = isVisible ? "Hide" : "Show";
  filterToggleButton.setAttribute("aria-expanded", isVisible ? "true" : "false");
};

const initFilterToggle = () => {
  if (!filtersContent || !filterToggleButton) return;
  const mobileDefaultClosed = window.matchMedia("(max-width: 900px)").matches;
  setFilterVisibility(!mobileDefaultClosed);
  filterToggleButton.addEventListener("click", () => {
    const currentlyVisible = !filtersContent.classList.contains("hidden");
    setFilterVisibility(!currentlyVisible);
  });
};

const init = async () => {
  if (!supabase) return;
  initFilterToggle();
  providerId = await loadProviderId();
  await fetchProviderRequests();
  jobsCache = await fetchJobs();
  await fetchClientInitiatedMessages(jobsCache.map((job) => job.id));
  await renderJobs();
};

applyFiltersButton?.addEventListener("click", async () => {
  await renderJobs();
  if (window.matchMedia("(max-width: 900px)").matches) {
    setFilterVisibility(false);
  }
});

init();
