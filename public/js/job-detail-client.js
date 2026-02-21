const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const metaEl = document.getElementById("job-meta");
const descriptionEl = document.getElementById("job-description");
const galleryEl = document.getElementById("job-gallery");
const requestsEl = document.getElementById("job-requests");
const closeButton = document.getElementById("job-close-btn");
const reopenButton = document.getElementById("job-reopen-btn");
const editToggleButton = document.getElementById("job-edit-toggle");
const editCancelButton = document.getElementById("job-edit-cancel");
const editSaveButton = document.getElementById("job-edit-save");
const editStatusEl = document.getElementById("job-edit-status");
const photoStatusEl = document.getElementById("job-photo-status");
const inlineEditWrap = document.getElementById("job-inline-edit");
const inlineEditActions = document.getElementById("job-edit-actions");
const photoUploadWrap = document.getElementById("job-photo-upload-wrap");
const photoUploadInput = document.getElementById("job-photo-upload");
const editTitleInput = document.getElementById("edit-job-title");
const editCategoryInput = document.getElementById("edit-job-category");
const editDescriptionInput = document.getElementById("edit-job-description");
const editBudgetMinInput = document.getElementById("edit-job-budget-min");
const editBudgetMaxInput = document.getElementById("edit-job-budget-max");
const editSqftInput = document.getElementById("edit-job-sqft");
const editTimelineInput = document.getElementById("edit-job-timeline");
const editLocationInput = document.getElementById("edit-job-location");

let jobId = null;
let currentJob = null;
let currentPhotos = [];
let editMode = false;
let jobEventsTableAvailable = true;

const MAX_JOB_PHOTOS = 6;
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

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

const logJobEvent = async (eventType, metadata = {}) => {
  if (!supabase || !jobEventsTableAvailable || !jobId || !eventType) return;
  try {
    const user = await getSessionUser();
    const { error } = await supabase
      .from("job_events")
      .insert({
        job_id: jobId,
        actor_user_id: user?.id || null,
        actor_role: "client",
        event_type: eventType,
        metadata,
      });
    if (isMissingTableError(error)) jobEventsTableAvailable = false;
  } catch (_error) {
    jobEventsTableAvailable = false;
  }
};

const setEditStatus = (message, type = "") => {
  if (!editStatusEl) return;
  editStatusEl.textContent = message;
  editStatusEl.className = `auth-status ${type}`.trim();
};

const setPhotoStatus = (message, type = "") => {
  if (!photoStatusEl) return;
  photoStatusEl.textContent = message;
  photoStatusEl.className = `auth-status ${type}`.trim();
};

const setEditMode = (enabled) => {
  editMode = enabled;
  inlineEditWrap?.classList.toggle("hidden", !enabled);
  inlineEditActions?.classList.toggle("hidden", !enabled);
  photoUploadWrap?.classList.toggle("hidden", !enabled);
  if (editToggleButton) editToggleButton.textContent = enabled ? "Editing" : "Edit";
  if (editToggleButton) editToggleButton.disabled = enabled;
  setEditStatus("");
  setPhotoStatus("");
  renderPhotos();
};

const hydrateEditForm = (job) => {
  if (!job) return;
  if (editTitleInput) editTitleInput.value = job.title || "";
  if (editCategoryInput) editCategoryInput.value = job.category || "";
  if (editDescriptionInput) editDescriptionInput.value = job.description || "";
  if (editBudgetMinInput) editBudgetMinInput.value = job.budget_min ?? "";
  if (editBudgetMaxInput) editBudgetMaxInput.value = job.budget_max ?? "";
  if (editSqftInput) editSqftInput.value = job.sqft ?? "";
  if (editTimelineInput) editTimelineInput.value = job.timeline || "";
  if (editLocationInput) editLocationInput.value = job.location || "";
};

const loadJob = async (userId) => {
  if (!supabase || !jobId) return null;
  const { data } = await supabase
    .from("jobs")
    .select("title,category,location,budget_min,budget_max,sqft,timeline,description,status,client_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data || data.client_id !== userId) return null;
  return data;
};

const loadPhotos = async () => {
  if (!supabase || !jobId) return [];
  const withStorage = await supabase
    .from("job_photos")
    .select("id,url,storage_path")
    .eq("job_id", jobId);
  if (!withStorage.error && Array.isArray(withStorage.data)) return withStorage.data;
  if (!(withStorage.error?.code === "42703" || withStorage.error?.code === "PGRST204" || withStorage.error?.code === "PGRST205")) {
    return [];
  }
  const legacy = await supabase
    .from("job_photos")
    .select("id,url")
    .eq("job_id", jobId);
  return legacy.data || [];
};

const loadRequests = async () => {
  const { data } = await supabase
    .from("job_requests")
    .select("id,status,created_at,provider_id,providers(name)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  return data || [];
};

const updateJobStatus = async (nextStatus) => {
  if (!supabase || !jobId) return;
  const user = await getSessionUser();
  if (!user) return;
  await supabase
    .from("jobs")
    .update({ status: nextStatus })
    .eq("id", jobId)
    .eq("client_id", user.id);
  if (nextStatus === "closed") await logJobEvent("job_closed");
  if (nextStatus === "open") await logJobEvent("job_reopened");
  await render();
};

const updateRequestStatus = async (requestId, nextStatus) => {
  if (!supabase || !jobId || !requestId) return;
  await supabase
    .from("job_requests")
    .update({ status: nextStatus })
    .eq("id", requestId)
    .eq("job_id", jobId);

  if (nextStatus === "accepted") await logJobEvent("request_accepted", { request_id: requestId });
  if (nextStatus === "declined") await logJobEvent("request_declined", { request_id: requestId });
  if (nextStatus === "closed") await logJobEvent("request_closed", { request_id: requestId });

  if (nextStatus === "accepted") {
    await supabase
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", jobId);
  }
  await render();
};

const uploadJobPhoto = async (file, index) => {
  const extension = file.type.split("/")[1] || "jpg";
  const path = `jobs/${jobId}/${Date.now()}-${index}.${extension}`;
  const { error } = await supabase.storage.from("job-media").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("job-media").getPublicUrl(path);
  return { url: data?.publicUrl || "", storage_path: path };
};

const renderPhotos = () => {
  if (!galleryEl) return;
  galleryEl.innerHTML = "";
  if (!currentPhotos.length) {
    galleryEl.innerHTML = "<p class='muted'>No photos uploaded.</p>";
    return;
  }
  currentPhotos.forEach((photo) => {
    if (editMode) {
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.innerHTML = `
        <img src="${photo.url}" alt="${currentJob?.title || "Job"} photo" />
        <button class="ghost-button" type="button" data-remove-photo="${photo.id}">Remove</button>
      `;
      card.querySelector("button")?.addEventListener("click", async () => {
        if (!photo.id) return;
        setPhotoStatus("Removing photo...", "info");
        await supabase.from("job_photos").delete().eq("id", photo.id).eq("job_id", jobId);
        if (photo.storage_path) {
          await supabase.storage.from("job-media").remove([photo.storage_path]);
        }
        currentPhotos = await loadPhotos();
        renderPhotos();
        setPhotoStatus("Photo removed.", "success");
      });
      galleryEl.appendChild(card);
      return;
    }
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = currentJob?.title || "Job photo";
    galleryEl.appendChild(img);
  });
};

const saveInlineEdit = async () => {
  if (!supabase || !jobId) return;
  const user = await getSessionUser();
  if (!user) return;

  const title = editTitleInput?.value.trim() || "";
  const category = editCategoryInput?.value.trim() || "";
  const description = editDescriptionInput?.value.trim() || "";
  const location = editLocationInput?.value.trim() || "";
  const budgetMin = Number(editBudgetMinInput?.value);
  const budgetMax = Number(editBudgetMaxInput?.value);
  const sqftValue = editSqftInput?.value ? Number(editSqftInput.value) : null;
  const timeline = editTimelineInput?.value.trim() || "";

  if (!title || !category || !description || !location) {
    setEditStatus("Complete all required fields.", "error");
    return;
  }
  if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax) || budgetMin < 0 || budgetMax < budgetMin) {
    setEditStatus("Budget range is invalid.", "error");
    return;
  }

  setEditStatus("Saving changes...", "info");
  const { error } = await supabase
    .from("jobs")
    .update({
      title,
      category,
      description,
      location,
      budget_min: budgetMin,
      budget_max: budgetMax,
      sqft: Number.isFinite(sqftValue) ? sqftValue : null,
      timeline,
    })
    .eq("id", jobId)
    .eq("client_id", user.id);

  if (error) {
    setEditStatus(error.message || "Could not save changes.", "error");
    return;
  }
  await logJobEvent("job_updated", { source: "client_job_detail_inline_edit" });
  setEditStatus("Job updated.", "success");
  setEditMode(false);
  await render();
};

const render = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  const job = await loadJob(user.id);
  if (!job) return;

  currentJob = job;
  hydrateEditForm(job);
  if (!editMode) setEditMode(false);

  if (titleEl) titleEl.textContent = job.title;
  const jobStatus = job.status || "open";
  if (statusEl) statusEl.textContent = jobStatus;
  if (closeButton) closeButton.disabled = jobStatus === "closed";
  if (reopenButton) reopenButton.disabled = jobStatus === "open" || jobStatus === "in_progress";
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

  currentPhotos = await loadPhotos();
  renderPhotos();

  if (requestsEl) {
    const requests = await loadRequests();
    requestsEl.innerHTML = "";
    if (requests.length === 0) {
      requestsEl.innerHTML = "<p class='muted'>No requests yet.</p>";
    } else {
      requests.forEach((request) => {
        const card = document.createElement("article");
        card.className = "job-card";
        const isPending = (request.status || "pending") === "pending";
        const isAccepted = request.status === "accepted";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${request.providers?.name || "Provider"}</h4>
            <p class="muted">${new Date(request.created_at).toLocaleDateString()}</p>
          </div>
          <div class="job-actions">
            <span class="pill">${request.status || "pending"}</span>
            ${isPending ? `
              <button class="ghost-button" data-request-action="decline" data-request-id="${request.id}">Decline</button>
              <button class="primary-button" data-request-action="accept" data-request-id="${request.id}">Accept</button>
            ` : ""}
            ${isAccepted ? `<button class="ghost-button" data-request-action="close" data-request-id="${request.id}">Mark Closed</button>` : ""}
          </div>
        `;
        requestsEl.appendChild(card);
      });
      requestsEl.querySelectorAll("button[data-request-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const requestId = button.dataset.requestId;
          const action = button.dataset.requestAction;
          if (!requestId || !action) return;
          if (action === "accept") await updateRequestStatus(requestId, "accepted");
          if (action === "decline") await updateRequestStatus(requestId, "declined");
          if (action === "close") await updateRequestStatus(requestId, "closed");
        });
      });
    }
  }
};

const init = () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  if (!jobId) return;
  setEditMode(false);
  render();
};

init();

closeButton?.addEventListener("click", async () => {
  await updateJobStatus("closed");
});

reopenButton?.addEventListener("click", async () => {
  await updateJobStatus("open");
});

editToggleButton?.addEventListener("click", () => {
  setEditMode(true);
});

editCancelButton?.addEventListener("click", () => {
  if (currentJob) hydrateEditForm(currentJob);
  setEditMode(false);
});

editSaveButton?.addEventListener("click", async () => {
  await saveInlineEdit();
});

photoUploadInput?.addEventListener("change", async (event) => {
  if (!editMode || !supabase || !jobId) return;
  const files = Array.from(event.target.files || []).slice(0, MAX_JOB_PHOTOS);
  if (!files.length) return;

  const invalid = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES);
  if (invalid) {
    setPhotoStatus(`Use image files up to ${MAX_IMAGE_MB}MB.`, "error");
    return;
  }

  setPhotoStatus("Uploading photos...", "info");
  try {
    const existingCount = currentPhotos.length;
    const allowedCount = Math.max(0, MAX_JOB_PHOTOS - existingCount);
    const toUpload = files.slice(0, allowedCount);
    if (!toUpload.length) {
      setPhotoStatus(`Maximum ${MAX_JOB_PHOTOS} photos per job.`, "error");
      return;
    }
    const rows = [];
    for (const [index, file] of toUpload.entries()) {
      const uploaded = await uploadJobPhoto(file, index);
      rows.push({
        job_id: jobId,
        url: uploaded.url,
        storage_path: uploaded.storage_path,
      });
    }
    if (rows.length) {
      const insertWithStorage = await supabase.from("job_photos").insert(rows);
      if (insertWithStorage.error && (insertWithStorage.error.code === "42703" || insertWithStorage.error.code === "PGRST204" || insertWithStorage.error.code === "PGRST205")) {
        const legacyRows = rows.map((row) => ({ job_id: row.job_id, url: row.url }));
        const legacyInsert = await supabase.from("job_photos").insert(legacyRows);
        if (legacyInsert.error) throw legacyInsert.error;
      } else if (insertWithStorage.error) {
        throw insertWithStorage.error;
      }
    }
    currentPhotos = await loadPhotos();
    renderPhotos();
    setPhotoStatus("Photos uploaded.", "success");
  } catch (error) {
    setPhotoStatus(error.message || "Photo upload failed.", "error");
  } finally {
    if (photoUploadInput) photoUploadInput.value = "";
  }
});
