const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("job-form");
const statusEl = document.getElementById("job-status");
const jobList = document.getElementById("job-list");
const myJobsPanel = document.getElementById("my-jobs-panel");
const proposalInboxPanel = document.getElementById("proposal-inbox-panel");
const proposalInboxList = document.getElementById("proposal-inbox-list");
const jobFormTitleEl = document.getElementById("job-form-title");
const jobSubmitButton = document.getElementById("job-submit-button");
const jobFormToggleButton = document.getElementById("job-form-toggle");
const jobFormContent = document.getElementById("job-form-content");

const titleInput = document.getElementById("job-title");
const serviceCategoryInput = document.getElementById("job-service-category");
const serviceNameInput = document.getElementById("job-service-name");
const serviceTagsInput = document.getElementById("job-service-tags");
const descriptionInput = document.getElementById("job-description");
const budgetMinInput = document.getElementById("job-budget-min");
const budgetMaxInput = document.getElementById("job-budget-max");
const sqftInput = document.getElementById("job-sqft");
const timelineInput = document.getElementById("job-timeline");
const locationInput = document.getElementById("job-location");
const photosInput = document.getElementById("job-photos");
const urlParams = new URLSearchParams(window.location.search);
const directProviderId = String(urlParams.get("direct_provider_id") || "").trim();
const directProviderName = String(urlParams.get("direct_provider_name") || "").trim();
const MAX_JOB_PHOTOS = 6;
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"]);
const fallbackAvatar = "../assets/neighborpp.png";
let jobEventsTableAvailable = true;
let targetProviderColumnAvailable = null;
const toCanonicalService = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalService
    ? window.NLINK_SERVICE_TAGS.toCanonicalService(value)
    : String(value || "").trim()
);
const toCanonicalCategory = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalCategory
    ? window.NLINK_SERVICE_TAGS.toCanonicalCategory(value)
    : String(value || "").trim()
);
const toCanonicalTag = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalTag
    ? window.NLINK_SERVICE_TAGS.toCanonicalTag(value)
    : String(value || "").trim()
);
const normalizeLocation = (value) => (
  window.NLINK_SERVICE_TAGS?.normalizeLocation
    ? window.NLINK_SERVICE_TAGS.normalizeLocation(value)
    : String(value || "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim()
);

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

const isMissingTableError = (error) => Boolean(error)
  && (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.status === 404
  );

const logJobEvent = async (jobId, eventType, metadata = {}) => {
  if (!supabase || !jobEventsTableAvailable || !jobId || !eventType) return;
  const allowedEventTypes = new Set([
    "job_created",
    "job_updated",
    "job_closed",
    "job_reopened",
    "request_sent",
    "request_accepted",
    "request_declined",
    "request_closed",
  ]);
  if (!allowedEventTypes.has(String(eventType || "").trim())) return;
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

const isMissingColumnError = (error) => Boolean(error)
  && ["42703", "PGRST204", "PGRST205"].includes(error.code);

const isMissingTargetProviderColumn = (error) => Boolean(error)
  && (
    error.code === "42703"
    || error.code === "PGRST204"
    || error.code === "PGRST205"
    || String(error.message || "").toLowerCase().includes("target_provider_id")
  );

const checkTargetProviderColumn = async () => {
  if (!supabase) return false;
  if (targetProviderColumnAvailable !== null) return targetProviderColumnAvailable;
  const { error } = await supabase
    .from("jobs")
    .select("target_provider_id")
    .limit(1);
  targetProviderColumnAvailable = !isMissingTargetProviderColumn(error);
  return targetProviderColumnAvailable;
};

const selectClientProfile = async (userId) => {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!error) return data || null;
  if (!isMissingColumnError(error)) return null;
  return null;
};

const toPublicLocation = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
};

const getClientSnapshot = async (user) => {
  const profile = await selectClientProfile(user.id);
  const meta = user.user_metadata || {};
  return {
    client_name: profile?.full_name || meta.client_name || user.email?.split("@")[0] || "Neighbor",
    client_avatar_url: profile?.avatar_url || meta.client_avatar_url || fallbackAvatar,
    client_location_public: toPublicLocation(profile?.location || profile?.address || meta.client_location || ""),
    client_email_verified: Boolean(profile?.email_verified ?? meta.client_email_verified ?? user.email_confirmed_at),
  };
};

const resetServiceOptions = () => {
  if (!serviceNameInput) return;
  const selectedCategory = toCanonicalCategory(serviceCategoryInput?.value || "");
  const services = window.NLINK_SERVICE_TAGS?.getServicesForCategory?.(selectedCategory) || [];
  serviceNameInput.innerHTML = '<option value="">Select a service</option>';
  services.forEach((service) => {
    const option = document.createElement("option");
    option.value = service;
    option.textContent = service;
    serviceNameInput.appendChild(option);
  });
  resetTagOptions();
};

const resetTagOptions = () => {
  if (!serviceTagsInput) return;
  const selectedService = toCanonicalService(serviceNameInput?.value || "");
  const tags = window.NLINK_SERVICE_TAGS?.getTagsForService?.(selectedService) || [];
  serviceTagsInput.innerHTML = "";
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    serviceTagsInput.appendChild(option);
  });
};

if (window.NLINK_SERVICE_TAGS && serviceCategoryInput) {
  serviceCategoryInput.innerHTML = '<option value="">Select a category</option>';
  (window.NLINK_SERVICE_TAGS.categories || []).forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    serviceCategoryInput.appendChild(option);
  });
  serviceCategoryInput.addEventListener("change", resetServiceOptions);
  serviceNameInput?.addEventListener("change", resetTagOptions);
  resetServiceOptions();
}

const normalizeJobStatus = (status) => {
  if (status === "accepted") return "in_progress";
  if (status === "declined") return "open";
  return status || "open";
};

const deriveDisplayJobStatus = (jobStatus, requestRows = []) => {
  const statuses = (Array.isArray(requestRows) ? requestRows : [])
    .map((row) => String(row?.status || "").toLowerCase())
    .filter(Boolean);
  if (statuses.includes("closed")) return "closed";
  if (statuses.includes("accepted")) return "in_progress";
  return normalizeJobStatus(jobStatus);
};

const normalizeRequestStatus = (status) => String(status || "").toLowerCase();

const requestStatusLabel = (status) => {
  const normalized = normalizeRequestStatus(status);
  if (normalized === "requested") return "Request Sent";
  if (normalized === "pending") return "Proposal Received";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "completed") return "Awaiting Confirmation";
  if (normalized === "closed") return "Completed";
  if (normalized === "declined") return "Declined";
  return "Awaiting Proposal";
};

const requestStatusClass = (status) => `proposal-status-pill status-${normalizeRequestStatus(status) || "pending"}`;

const updateRequestStatusQuick = async (requestId, nextStatus) => {
  if (!supabase || !requestId || !nextStatus) return false;
  const { error } = await supabase
    .from("job_requests")
    .update({ status: nextStatus })
    .eq("id", requestId);
  if (error) return false;
  return true;
};

const renderProposalInbox = async (user) => {
  if (!proposalInboxList || !proposalInboxPanel || !supabase || !user?.id) return;
  const { data: requests, error } = await supabase
    .from("job_requests")
    .select("id,status,created_at,job_id,provider_id,proposal_type,estimated_price_min,estimated_price_max,providers(id,name,avatar_url,owner_id),jobs(id,title,location,client_id)")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(requests)) {
    proposalInboxPanel.hidden = true;
    return;
  }

  const relevant = requests
    .filter((row) => row?.jobs?.client_id === user.id)
    .filter((row) => ["pending", "accepted", "requested", "completed"].includes(normalizeRequestStatus(row.status)));

  if (!relevant.length) {
    proposalInboxPanel.hidden = true;
    return;
  }

  proposalInboxPanel.hidden = false;
  proposalInboxList.innerHTML = "";

  relevant.slice(0, 6).forEach((request) => {
    const status = normalizeRequestStatus(request.status);
    const providerName = request.providers?.name || "Plug";
    const providerAvatar = request.providers?.avatar_url || "../assets/plugprofilepic.png";
    const jobTitle = request.jobs?.title || "Job";
    const estimate = (Number.isFinite(Number(request.estimated_price_min)) || Number.isFinite(Number(request.estimated_price_max)))
      ? `$${Number(request.estimated_price_min || 0)} - $${Number(request.estimated_price_max || 0)}`
      : "Custom quote";
    const canMessage = ["accepted", "completed"].includes(status) && request.provider_id;
    const card = document.createElement("article");
    card.className = "job-card proposal-inbox-card";
    card.innerHTML = `
      <img class="job-thumb" src="${providerAvatar}" alt="${providerName}" />
      <div class="job-card-body">
        <h4>${providerName} • ${jobTitle}</h4>
        <p class="muted proposal-inbox-meta">${request.jobs?.location || "Location private"} • ${estimate}</p>
        <p class="muted proposal-inbox-meta">${new Date(request.created_at).toLocaleDateString()}</p>
        <span class="job-link">View details</span>
      </div>
      <div class="job-actions">
        <span class="pill ${requestStatusClass(request.status)}">${requestStatusLabel(request.status)}</span>
        <a class="ghost-button" href="../client/client-job-detail.html?id=${encodeURIComponent(request.job_id || "")}">View</a>
        ${status === "pending" ? `<button class="primary-button" data-request-action="accept" data-request-id="${request.id}">Accept</button>` : ""}
        ${status === "pending" ? `<button class="ghost-button" data-request-action="decline" data-request-id="${request.id}">Decline</button>` : ""}
        ${canMessage ? `<a class="ghost-button" href="../client/client-messages.html?job=${encodeURIComponent(request.job_id || "")}&provider=${encodeURIComponent(request.provider_id || "")}${providerName ? `&providerName=${encodeURIComponent(providerName)}` : ""}${providerAvatar ? `&providerAvatar=${encodeURIComponent(providerAvatar)}` : ""}">Message</a>` : ""}
      </div>
    `;
    proposalInboxList.appendChild(card);
  });

  proposalInboxList.querySelectorAll("button[data-request-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const requestId = button.dataset.requestId;
      const action = button.dataset.requestAction;
      if (!requestId || !action) return;
      button.disabled = true;
      const ok = await updateRequestStatusQuick(requestId, action === "accept" ? "accepted" : "declined");
      if (!ok) {
        setStatus("Could not update proposal status. Try again.", "error");
        button.disabled = false;
        return;
      }
      await renderJobs();
    });
  });
};

const uploadJobPhoto = async (file, jobId, index) => {
  let uploadBlob = file;
  let contentType = file.type || "image/jpeg";
  let extension = (contentType.split("/")[1] || "").toLowerCase();
  if (typeof window.nlinkPrepareImageForUpload === "function") {
    const prepared = await window.nlinkPrepareImageForUpload(file, { forceJpeg: true });
    uploadBlob = prepared.blob;
    contentType = prepared.type || "image/jpeg";
    extension = prepared.ext || "jpg";
  } else if (!extension || !ALLOWED_IMAGE_EXTS.has(extension)) {
    extension = "jpg";
    contentType = "image/jpeg";
  }
  const path = `jobs/${jobId}/${index}.${extension}`;
  const { error } = await supabase.storage.from("job-media").upload(path, uploadBlob, {
    upsert: true,
    contentType,
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
  const clientName = profile?.full_name || meta.client_name || user.email?.split("@")[0] || "Neighbor";
  const clientAvatar = profile?.avatar_url || meta.client_avatar_url || fallbackAvatar;
  const clientArea = toPublicLocation(profile?.location || profile?.address || meta.client_location || "");

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id,title,location,budget_min,budget_max,sqft,status,created_at")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !jobs) return;

  const jobIds = jobs.map((job) => job.id);
  const requestRowsByJobId = {};
  if (jobIds.length) {
    const { data: requestRows } = await supabase
      .from("job_requests")
      .select("job_id,status")
      .in("job_id", jobIds);
    (requestRows || []).forEach((row) => {
      if (!row?.job_id) return;
      if (!requestRowsByJobId[row.job_id]) requestRowsByJobId[row.job_id] = [];
      requestRowsByJobId[row.job_id].push(row);
    });
  }
  let photos = [];
  if (jobIds.length) {
    const { data } = await supabase
      .from("job_photos")
      .select("job_id,url")
      .in("job_id", jobIds);
    photos = data || [];
  }

  const renderJobCard = (job) => {
    const photo = photos.find((item) => item.job_id === job.id);
    const thumb = photo?.url || "../assets/jobrequestpic.png";
    const status = deriveDisplayJobStatus(job.status, requestRowsByJobId[job.id] || []);

    const card = document.createElement("a");
    card.className = `job-card job-link-card ${status === "closed" ? "job-card-closed" : ""}`.trim();
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
    return card;
  };

  const activeJobs = jobs.filter((job) => normalizeJobStatus(job.status) !== "closed");
  const closedJobs = jobs.filter((job) => normalizeJobStatus(job.status) === "closed");

  jobList.innerHTML = "";

  if (!activeJobs.length && !closedJobs.length) {
    jobList.innerHTML = "<p class='muted'>No jobs yet.</p>";
    return;
  }

  if (activeJobs.length) {
    const activeTitle = document.createElement("p");
    activeTitle.className = "job-group-title";
    activeTitle.textContent = "Active";
    jobList.appendChild(activeTitle);
    activeJobs.forEach((job) => jobList.appendChild(renderJobCard(job)));
  }

  if (closedJobs.length) {
    const closedTitle = document.createElement("p");
    closedTitle.className = "job-group-title";
    closedTitle.textContent = "Closed";
    jobList.appendChild(closedTitle);
    closedJobs.forEach((job) => jobList.appendChild(renderJobCard(job)));
  }

  await renderProposalInbox(user);
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const user = await getSessionUser();
  if (!user) return;

  const title = titleInput.value.trim();
  const serviceCategory = toCanonicalCategory(serviceCategoryInput?.value || "");
  const serviceName = toCanonicalService(serviceNameInput?.value || "");
  const selectedServiceTags = Array.from(serviceTagsInput?.selectedOptions || [])
    .map((option) => toCanonicalTag(option.value))
    .filter(Boolean)
    .slice(0, 6);
  const description = descriptionInput.value.trim();
  const location = normalizeLocation(locationInput.value);
  const locationValidation = await (window.NLINK_SERVICE_TAGS?.validateLocation?.(location)
    || Promise.resolve({ ok: true, normalized: location }));
  if (!locationValidation.ok) {
    setStatus(locationValidation.message || "Enter a valid location.", "error");
    return;
  }
  const verifiedLocation = locationValidation.normalized || location;
  if (locationInput) locationInput.value = verifiedLocation;
  const budgetMin = Number(budgetMinInput.value);
  const budgetMax = Number(budgetMaxInput.value);

  if (!title || !serviceCategory || !serviceName || !description || !verifiedLocation) {
    setStatus("Complete all required fields.", "error");
    return;
  }
  if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax) || budgetMin < 0 || budgetMax < budgetMin) {
    setStatus("Budget range is invalid.", "error");
    return;
  }

  setStatus("Sending request...", "info");

  const payload = {
    client_id: user.id,
    title,
    category: serviceName,
    description,
    budget_min: budgetMin,
    budget_max: budgetMax,
    sqft: sqftInput.value ? Number(sqftInput.value) : null,
    timeline: timelineInput.value.trim(),
    location: verifiedLocation,
    status: "open",
    ...(await getClientSnapshot(user)),
  };

  if (directProviderId) {
    const hasTargetProviderColumn = await checkTargetProviderColumn();
    if (!hasTargetProviderColumn) {
      setStatus("Direct request is not enabled yet. Please run the direct request DB migration first.", "error");
      return;
    }
    payload.target_provider_id = directProviderId;
  }

  const insertResult = await supabase
    .from("jobs")
    .insert(payload)
    .select("id")
    .single();
  const { data: inserted, error } = insertResult;

  if (error || !inserted) {
    setStatus(error?.message || "Could not send request.", "error");
    return;
  }

  if (directProviderId) {
    const directRequestPayload = {
      job_id: inserted.id,
      provider_id: directProviderId,
      status: "requested",
      proposal_notes: "Direct request from Neighbor profile booking.",
    };
    const { error: directRequestError } = await supabase
      .from("job_requests")
      .insert(directRequestPayload);
    if (directRequestError) {
      setStatus(directRequestError.message || "Request posted, but direct request could not be sent.", "error");
      await renderJobs();
      return;
    }
    await logJobEvent(inserted.id, "direct_request_created", {
      target_provider_id: directProviderId,
    });
  }

  await logJobEvent(inserted.id, "job_created", {
    source: "client_jobs_form",
    service_category: serviceCategory,
    service_name: serviceName,
    service_tags: selectedServiceTags,
  });

  const files = Array.from(photosInput.files || []).slice(0, MAX_JOB_PHOTOS);
  if (files.length) {
    try {
      const invalidFile = files.find((file) => {
        const type = String(file.type || "").toLowerCase();
        const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
        const looksImage = type.startsWith("image/") || ALLOWED_IMAGE_EXTS.has(ext);
        return !looksImage || file.size > MAX_IMAGE_BYTES;
      });
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
      setStatus("Request posted, but photo upload failed.", "error");
      await renderJobs();
      return;
    }
  }

  form.reset();
  setStatus(
    directProviderId
      ? `Direct request sent${directProviderName ? ` to ${directProviderName}` : ""}.`
      : "Request sent.",
    "success",
  );
  await renderJobs();
});

const initDirectRequestMode = async () => {
  if (!directProviderId) return;
  if (myJobsPanel) myJobsPanel.classList.add("hidden");
  if (jobFormTitleEl) jobFormTitleEl.textContent = "Quick Request Details";
  if (jobSubmitButton) jobSubmitButton.textContent = "Send Request";
  if (jobFormContent) jobFormContent.classList.remove("hidden");
  if (jobFormToggleButton) jobFormToggleButton.textContent = "Collapse";
  const hasTargetProviderColumn = await checkTargetProviderColumn();
  if (!hasTargetProviderColumn) {
    setStatus("Direct request is not enabled yet. Please run the direct request DB migration first.", "error");
    if (jobSubmitButton) jobSubmitButton.disabled = true;
    return;
  }
  if (jobSubmitButton) jobSubmitButton.disabled = false;
  const user = await getSessionUser();
  if (!user) return;
  const { data: provider, error } = await supabase
    .from("providers")
    .select("id,name,owner_id,category,location")
    .eq("id", directProviderId)
    .maybeSingle();
  if (!error && provider?.owner_id && provider.owner_id === user.id) {
    setStatus("You cannot create a direct request to your own Plug account.", "error");
    return;
  }
  if (provider?.name) {
    setStatus(`Quick request mode: this request will be sent to ${provider.name} only.`, "info");
  } else if (directProviderName) {
    setStatus(`Quick request mode: this request will be sent to ${directProviderName} only.`, "info");
  } else {
    setStatus("Quick request mode: this request will be sent to one Plug only.", "info");
  }
  if (provider?.category && !serviceNameInput?.value) {
    const inferredCategory = window.NLINK_SERVICE_TAGS?.inferCategoryForService?.(provider.category) || "";
    if (inferredCategory && serviceCategoryInput) {
      serviceCategoryInput.value = toCanonicalCategory(inferredCategory);
      resetServiceOptions();
    }
    if (serviceNameInput) {
      serviceNameInput.value = toCanonicalService(provider.category);
      resetTagOptions();
    }
  }
  if (provider?.location && locationInput && !locationInput.value.trim()) {
    locationInput.value = normalizeLocation(provider.location);
  }
};

jobFormToggleButton?.addEventListener("click", () => {
  if (!jobFormContent) return;
  const isHidden = jobFormContent.classList.toggle("hidden");
  jobFormToggleButton.textContent = isHidden ? "Expand" : "Collapse";
});

initDirectRequestMode();
renderJobs();
