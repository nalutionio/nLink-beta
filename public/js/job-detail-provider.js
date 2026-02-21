const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const metaEl = document.getElementById("job-meta");
const descriptionEl = document.getElementById("job-description");
const galleryEl = document.getElementById("job-gallery");
const notesEl = document.getElementById("job-notes");
const requestButton = document.getElementById("request-quote");
const requestStatus = document.getElementById("request-status");
const clientAvatarEl = document.getElementById("job-client-avatar");
const clientNameEl = document.getElementById("job-client-name");
const clientMetaEl = document.getElementById("job-client-meta");
const clientLocationNoteEl = document.getElementById("job-client-location-note");

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
  const queries = [
    "title,location,budget_min,budget_max,sqft,timeline,description,status,client_id,client_name,client_avatar_url,client_location_public,client_email_verified,created_at",
    "title,location,budget_min,budget_max,sqft,timeline,description,status,client_id,created_at",
  ];
  for (let i = 0; i < queries.length; i += 1) {
    const { data, error } = await supabase
      .from("jobs")
      .select(queries[i])
      .eq("id", jobId)
      .maybeSingle();
    if (!error) return data || null;
    if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return null;
  }
  return null;
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

  if (clientAvatarEl) {
    clientAvatarEl.src = job.client_avatar_url || "../assets/nlinkiconblk.png";
  }
  if (clientNameEl) {
    clientNameEl.textContent = job.client_name || "Client";
  }
  if (clientMetaEl) {
    const bits = [
      formatMemberSince(job.created_at),
      job.client_email_verified === true ? "Email verified" : "Email unverified",
      toPublicLocation(job.client_location_public || job.location || ""),
    ].filter(Boolean);
    clientMetaEl.textContent = bits.join(" • ");
  }
  if (clientLocationNoteEl) {
    clientLocationNoteEl.textContent = "Street address remains private until the client chooses to share it.";
  }

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
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    requestButton.textContent = existing.status === "accepted" ? "Accepted" : "Requested";
    requestButton.disabled = true;
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
  requestButton.textContent = "Requested";
  requestButton.disabled = true;
};

const init = async () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  if (!jobId) return;
  providerId = await loadProviderId();
  await renderJob();
  if (!providerId || !jobId) return;
  const { data: existing } = await supabase
    .from("job_requests")
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (existing) {
    requestButton.textContent = existing.status === "accepted" ? "Accepted" : "Requested";
    requestButton.disabled = true;
  }
};

requestButton?.addEventListener("click", requestQuote);

init();
