const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("job-form");
const statusEl = document.getElementById("job-status");
const jobList = document.getElementById("job-list");

const titleInput = document.getElementById("job-title");
const categoryInput = document.getElementById("job-category");
const descriptionInput = document.getElementById("job-description");
const budgetMinInput = document.getElementById("job-budget-min");
const budgetMaxInput = document.getElementById("job-budget-max");
const sqftInput = document.getElementById("job-sqft");
const timelineInput = document.getElementById("job-timeline");
const locationInput = document.getElementById("job-location");
const photosInput = document.getElementById("job-photos");
const MAX_JOB_PHOTOS = 6;
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const fallbackAvatar = "../assets/nlinkiconblk.png";

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const isMissingColumnError = (error) => Boolean(error)
  && ["42703", "PGRST204", "PGRST205"].includes(error.code);

const selectClientProfile = async (userId) => {
  const tries = [
    "full_name,avatar_url,location,address",
    "full_name,avatar_url,location",
    "full_name,avatar_url,address",
    "full_name,avatar_url",
    "full_name",
  ];
  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await supabase
      .from("clients")
      .select(tries[i])
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return data || null;
    if (!isMissingColumnError(error)) return null;
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

const normalizeJobStatus = (status) => {
  if (status === "accepted") return "in_progress";
  if (status === "declined") return "open";
  return status || "open";
};

const uploadJobPhoto = async (file, jobId, index) => {
  const extension = file.type.split("/")[1] || "jpg";
  const path = `jobs/${jobId}/${index}.${extension}`;
  const { error } = await supabase.storage.from("job-media").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("job-media").getPublicUrl(path);
  return { url: data?.publicUrl || "", storage_path: path };
};

const renderJobs = async () => {
  if (!supabase || !jobList) return;
  const user = await getSessionUser();
  if (!user) return;
  const profile = await selectClientProfile(user.id);
  const meta = user.user_metadata || {};
  const clientName = profile?.full_name || meta.client_name || user.email?.split("@")[0] || "Client";
  const clientAvatar = profile?.avatar_url || meta.client_avatar_url || fallbackAvatar;
  const clientArea = toPublicLocation(profile?.location || profile?.address || meta.client_location || "");

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id,title,location,budget_min,budget_max,sqft,status,created_at")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !jobs) return;

  const jobIds = jobs.map((job) => job.id);
  let photos = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("job_photos")
      .select("job_id,url")
      .in("job_id", jobIds);
    photos = data || [];
  }

  jobList.innerHTML = "";
  jobs.forEach((job) => {
    const photo = photos.find((item) => item.job_id === job.id);
    const thumb = photo?.url || "../assets/nlinkiconblk.png";
    const status = normalizeJobStatus(job.status);

    const card = document.createElement("a");
    card.className = "job-card job-link-card";
    card.href = `../client/client-job-detail.html?id=${job.id}`;
    card.innerHTML = `
      <img class="job-thumb" src="${thumb}" alt="${job.title}" />
      <div class="job-card-body">
        <h4>${job.title}</h4>
        <p class="muted">${job.location} • $${job.budget_min} - $${job.budget_max}${job.sqft ? ` • ${job.sqft} sqft` : ""}</p>
        <div class="mini-client">
          <img src="${clientAvatar}" alt="${clientName}" />
          <div>
            <p class="muted">${clientName}</p>
            <p class="muted">${clientArea || "Location private"}</p>
          </div>
        </div>
        <span class="job-link">View details</span>
      </div>
      <span class="pill">${status}</span>
    `;
    jobList.appendChild(card);
  });
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const user = await getSessionUser();
  if (!user) return;

  const title = titleInput.value.trim();
  const category = categoryInput.value.trim();
  const description = descriptionInput.value.trim();
  const location = locationInput.value.trim();
  const budgetMin = Number(budgetMinInput.value);
  const budgetMax = Number(budgetMaxInput.value);

  if (!title || !category || !description || !location) {
    setStatus("Complete all required fields.", "error");
    return;
  }
  if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax) || budgetMin < 0 || budgetMax < budgetMin) {
    setStatus("Budget range is invalid.", "error");
    return;
  }

  setStatus("Posting job...", "info");

  const payload = {
    client_id: user.id,
    title,
    category,
    description,
    budget_min: budgetMin,
    budget_max: budgetMax,
    sqft: sqftInput.value ? Number(sqftInput.value) : null,
    timeline: timelineInput.value.trim(),
    location,
    status: "open",
  };

  const { data: inserted, error } = await supabase
    .from("jobs")
    .insert(payload)
    .select("id")
    .single();

  if (error || !inserted) {
    setStatus(error?.message || "Could not post job.", "error");
    return;
  }

  const files = Array.from(photosInput.files || []).slice(0, MAX_JOB_PHOTOS);
  if (files.length) {
    try {
      const invalidFile = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES);
      if (invalidFile) {
        setStatus(`Use image files up to ${MAX_IMAGE_MB}MB.`, "error");
        await renderJobs();
        return;
      }
      const photoRows = [];
      for (const [index, file] of files.entries()) {
        const uploaded = await uploadJobPhoto(file, inserted.id, index);
        photoRows.push({
          job_id: inserted.id,
          url: uploaded.url,
          storage_path: uploaded.storage_path,
        });
      }
      if (photoRows.length) {
        await supabase.from("job_photos").insert(photoRows);
      }
    } catch (error) {
      setStatus("Job posted, but photo upload failed.", "error");
      await renderJobs();
      return;
    }
  }

  form.reset();
  setStatus("Job posted.", "success");
  await renderJobs();
});

renderJobs();
