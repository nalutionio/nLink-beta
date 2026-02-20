const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const metaEl = document.getElementById("job-meta");
const descriptionEl = document.getElementById("job-description");
const galleryEl = document.getElementById("job-gallery");
const requestsEl = document.getElementById("job-requests");

let jobId = null;

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const loadJob = async (userId) => {
  if (!supabase || !jobId) return null;
  const { data } = await supabase
    .from("jobs")
    .select("title,location,budget_min,budget_max,sqft,description,status,client_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data || data.client_id !== userId) return null;
  return data;
};

const loadPhotos = async () => {
  const { data } = await supabase
    .from("job_photos")
    .select("url")
    .eq("job_id", jobId);
  return data || [];
};

const loadRequests = async () => {
  const { data } = await supabase
    .from("job_requests")
    .select("id,status,created_at,providers(name)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  return data || [];
};

const render = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  const job = await loadJob(user.id);
  if (!job) return;

  if (titleEl) titleEl.textContent = job.title;
  if (statusEl) statusEl.textContent = job.status || "open";
  if (metaEl) {
    const bits = [
      job.location,
      `$${job.budget_min} - $${job.budget_max}`,
      job.sqft ? `${job.sqft} sqft` : null,
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (descriptionEl) descriptionEl.textContent = job.description || "";

  if (galleryEl) {
    const photos = await loadPhotos();
    galleryEl.innerHTML = "";
    if (photos.length === 0) {
      galleryEl.innerHTML = "<p class='muted'>No photos uploaded.</p>";
    } else {
      photos.forEach((photo) => {
        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = job.title;
        galleryEl.appendChild(img);
      });
    }
  }

  if (requestsEl) {
    const requests = await loadRequests();
    requestsEl.innerHTML = "";
    if (requests.length === 0) {
      requestsEl.innerHTML = "<p class='muted'>No requests yet.</p>";
    } else {
      requests.forEach((request) => {
        const card = document.createElement("article");
        card.className = "job-card";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${request.providers?.name || "Provider"}</h4>
            <p class="muted">${new Date(request.created_at).toLocaleDateString()}</p>
          </div>
          <span class="pill">${request.status || "pending"}</span>
        `;
        requestsEl.appendChild(card);
      });
    }
  }
};

const init = () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  if (!jobId) return;
  render();
};

init();
