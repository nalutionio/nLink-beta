const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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
    const status = job.status || "open";

    const card = document.createElement("a");
    card.className = "job-card job-link-card";
    card.href = `../client/client-job-detail.html?id=${job.id}`;
    card.innerHTML = `
      <img class="job-thumb" src="${thumb}" alt="${job.title}" />
      <div class="job-card-body">
        <h4>${job.title}</h4>
        <p class="muted">${job.location} • $${job.budget_min} - $${job.budget_max}${job.sqft ? ` • ${job.sqft} sqft` : ""}</p>
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

  setStatus("Posting job...", "info");

  const payload = {
    client_id: user.id,
    title: titleInput.value.trim(),
    category: categoryInput.value.trim(),
    description: descriptionInput.value.trim(),
    budget_min: Number(budgetMinInput.value),
    budget_max: Number(budgetMaxInput.value),
    sqft: sqftInput.value ? Number(sqftInput.value) : null,
    timeline: timelineInput.value.trim(),
    location: locationInput.value.trim(),
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

  const files = Array.from(photosInput.files || []);
  if (files.length) {
    try {
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
