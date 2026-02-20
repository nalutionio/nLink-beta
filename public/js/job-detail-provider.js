const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const metaEl = document.getElementById("job-meta");
const descriptionEl = document.getElementById("job-description");
const galleryEl = document.getElementById("job-gallery");
const notesEl = document.getElementById("job-notes");
const requestButton = document.getElementById("request-quote");
const requestStatus = document.getElementById("request-status");

let providerId = null;
let jobId = null;

const setStatus = (message, type = "") => {
  if (!requestStatus) return;
  requestStatus.textContent = message;
  requestStatus.className = `auth-status ${type}`.trim();
};

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

const loadJob = async () => {
  if (!supabase || !jobId) return null;
  const { data } = await supabase
    .from("jobs")
    .select("title,location,budget_min,budget_max,sqft,timeline,description,status")
    .eq("id", jobId)
    .maybeSingle();
  return data;
};

const loadPhotos = async () => {
  if (!supabase || !jobId) return [];
  const { data } = await supabase
    .from("job_photos")
    .select("url")
    .eq("job_id", jobId);
  return data || [];
};

const renderJob = async () => {
  const job = await loadJob();
  if (!job) return;

  if (titleEl) titleEl.textContent = job.title;
  if (statusEl) statusEl.textContent = job.status || "open";
  if (metaEl) {
    const bits = [
      job.location,
      `$${job.budget_min} - $${job.budget_max}`,
      job.sqft ? `${job.sqft} sqft` : null,
      job.timeline ? `Needed ${job.timeline}` : null,
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (descriptionEl) descriptionEl.textContent = job.description || "";

  if (notesEl) {
    notesEl.innerHTML = "";
    if (job.timeline) {
      const li = document.createElement("li");
      li.textContent = `Timeline: ${job.timeline}`;
      notesEl.appendChild(li);
    }
    if (job.sqft) {
      const li = document.createElement("li");
      li.textContent = `Square footage: ${job.sqft}`;
      notesEl.appendChild(li);
    }
    const li = document.createElement("li");
    li.textContent = `Budget: $${job.budget_min} - $${job.budget_max}`;
    notesEl.appendChild(li);
  }

  if (galleryEl) {
    const photos = await loadPhotos();
    galleryEl.innerHTML = "";
    if (photos.length === 0) {
      galleryEl.innerHTML = "<p class='muted'>No photos uploaded.</p>";
      return;
    }
    photos.forEach((photo) => {
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = job.title;
      galleryEl.appendChild(img);
    });
  }
};

const requestQuote = async () => {
  if (!supabase || !providerId || !jobId) return;
  setStatus("Submitting request...", "info");

  const { data: existing } = await supabase
    .from("job_requests")
    .select("id")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    setStatus("Request already sent.", "success");
    return;
  }

  const { error } = await supabase.from("job_requests").insert({
    job_id: jobId,
    provider_id: providerId,
    status: "pending",
  });

  if (error) {
    setStatus(error.message || "Could not send request.", "error");
    return;
  }

  setStatus("Request sent.", "success");
};

const init = async () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  if (!jobId) return;
  providerId = await loadProviderId();
  await renderJob();
};

requestButton?.addEventListener("click", requestQuote);

init();
