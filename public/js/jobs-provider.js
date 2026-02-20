const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const feedEl = document.getElementById("job-feed");
const filterCategory = document.getElementById("filter-category");
const filterLocation = document.getElementById("filter-location");
const filterBudgetMin = document.getElementById("filter-budget-min");
const filterBudgetMax = document.getElementById("filter-budget-max");
const applyFiltersButton = document.getElementById("apply-filters");

let jobsCache = [];
let providerId = null;

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
    .select("id,title,category,location,budget_min,budget_max,sqft,timeline,created_at,status")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data;
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
  const category = filterCategory.value.trim().toLowerCase();
  const location = filterLocation.value.trim().toLowerCase();
  const minBudget = Number(filterBudgetMin.value) || 0;
  const maxBudget = Number(filterBudgetMax.value) || Number.POSITIVE_INFINITY;

  const matchesCategory = !category || job.title.toLowerCase().includes(category) || job.category?.toLowerCase().includes(category);
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
    const photo = photos.find((item) => item.job_id === job.id);
    const thumb = photo?.url || "../assets/nlinkiconblk.png";
    const card = document.createElement("div");
    card.className = "job-card job-link-card";
    card.dataset.href = `../provider/job-detail.html?id=${job.id}`;
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
        <button class="primary-button" data-job-id="${job.id}">Request to Quote</button>
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
    .select("id")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    button.textContent = "Requested";
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

  button.textContent = "Requested";
};

const init = async () => {
  if (!supabase) return;
  providerId = await loadProviderId();
  jobsCache = await fetchJobs();
  await renderJobs();
};

applyFiltersButton?.addEventListener("click", renderJobs);

init();
