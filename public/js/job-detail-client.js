const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const descriptionEl = document.getElementById("job-description");
const metaLocationEl = document.getElementById("job-meta-location");
const metaBudgetEl = document.getElementById("job-meta-budget");
const metaSizeEl = document.getElementById("job-meta-size");
const metaTimelineEl = document.getElementById("job-meta-timeline");
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
const reviewWrap = document.getElementById("client-review-form-wrap");
const reviewTitleEl = document.getElementById("client-review-title");
const reviewRatingInput = document.getElementById("client-review-rating");
const reviewTextInput = document.getElementById("client-review-text");
const reviewCancelButton = document.getElementById("client-review-cancel");
const reviewSubmitButton = document.getElementById("client-review-submit");
const reviewStatusEl = document.getElementById("client-review-status");
const bookingWrap = document.getElementById("client-booking-wrap");
const bookingSummaryEl = document.getElementById("client-booking-summary");
const bookingSlotsEl = document.getElementById("client-booking-slots");
const bookingNoteInput = document.getElementById("client-booking-note");
const bookingAddressWrap = document.getElementById("client-booking-address-wrap");
const bookingAddressInput = document.getElementById("client-booking-address");
const bookingConfirmButton = document.getElementById("client-booking-confirm");
const bookingShareAddressButton = document.getElementById("client-booking-share-address");
const bookingStatusEl = document.getElementById("client-booking-status");
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
let editMode = false;
let jobEventsTableAvailable = true;
let jobReviewsTableAvailable = true;
let bookingTableAvailable = true;
let reviewTarget = null;
let currentAppointment = null;
let currentAcceptedRequest = null;
let selectedBookingSlot = "";
let currentClientAddress = "";
let reviewSubmitInFlight = false;

const normalizeRequestStatus = (status) => {
  const raw = String(status || "pending").toLowerCase();
  return raw;
};

const requestStatusLabel = (status) => {
  const normalized = normalizeRequestStatus(status);
  if (normalized === "requested") return "Direct Request";
  if (normalized === "completed") return "Work Completed";
  if (normalized === "closed") return "Completed";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "declined") return "Declined";
  return "Pending";
};

const deriveDisplayJobStatus = (jobStatus, requestRows = []) => {
  const statuses = (Array.isArray(requestRows) ? requestRows : [])
    .map((row) => String(row?.status || "").toLowerCase())
    .filter(Boolean);
  if (statuses.includes("closed")) return "closed";
  if (statuses.includes("accepted") || statuses.includes("completed")) return "in_progress";
  return String(jobStatus || "open").toLowerCase();
};

const MAX_JOB_PHOTOS = 6;
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"]);

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

const setReviewStatus = (message, type = "") => {
  if (!reviewStatusEl) return;
  reviewStatusEl.textContent = message;
  reviewStatusEl.className = `auth-status ${type}`.trim();
};

const setBookingStatus = (message, type = "") => {
  if (!bookingStatusEl) return;
  bookingStatusEl.textContent = message;
  bookingStatusEl.className = `auth-status ${type}`.trim();
};

const normalizeReviewText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const validateReviewText = (value) => {
  const text = normalizeReviewText(value);
  if (!text) return { ok: true, text: "" };
  if (text.length > 600) {
    return { ok: false, text, message: "Review comments must be 600 characters or fewer." };
  }
  const bannedPattern = /(https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4})/i;
  if (bannedPattern.test(text)) {
    return { ok: false, text, message: "Please remove links, email addresses, or phone numbers from the review." };
  }
  return { ok: true, text };
};

const setReviewMode = (target = null) => {
  reviewTarget = target;
  reviewWrap?.classList.toggle("hidden", !target);
  if (!target) {
    if (reviewTitleEl) reviewTitleEl.textContent = "Rate Plug";
    if (reviewRatingInput) reviewRatingInput.value = "5";
    if (reviewTextInput) reviewTextInput.value = "";
    setReviewStatus("");
    return;
  }
  if (reviewTitleEl) reviewTitleEl.textContent = `Rate ${target.providerName || "Plug"}`;
  if (reviewRatingInput) reviewRatingInput.value = "5";
  if (reviewTextInput) reviewTextInput.value = "";
  setReviewStatus("");
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
  const queries = [
    "id,status,created_at,provider_id,proposal_type,estimated_price_min,estimated_price_max,pricing_basis,inspection_fee,inspection_fee_creditable,inspection_fee_waivable,proposal_notes,providers(name,owner_id,avatar_url)",
    "id,status,created_at,provider_id,providers(name,owner_id,avatar_url)",
    "id,status,created_at,provider_id,providers(name,owner_id)",
  ];
  for (let i = 0; i < queries.length; i += 1) {
    const { data, error } = await supabase
      .from("job_requests")
      .select(queries[i])
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (!error) return data || [];
    if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return [];
  }
  return [];
};

const formatProposalType = (value) => {
  if (!value) return "General proposal";
  if (value === "inspection_first") return "Inspection first";
  if (value === "direct_service") return "Direct service";
  if (value === "hybrid") return "Hybrid";
  return "General proposal";
};

const formatPricingBasis = (value) => {
  if (!value) return "Pricing basis not set";
  if (value === "after_inspection") return "Price after inspection";
  if (value === "per_sqft") return "Per sqft pricing";
  return `${value[0].toUpperCase()}${value.slice(1)} pricing`;
};

const formatEstimateRange = (min, max) => {
  const minVal = Number(min || 0);
  const maxVal = Number(max || 0);
  if (minVal > 0 && maxVal > 0) return `Estimate: $${minVal} - $${maxVal}`;
  if (minVal > 0) return `Estimate from: $${minVal}`;
  if (maxVal > 0) return `Estimate up to: $${maxVal}`;
  return "Estimate: shared in proposal notes";
};

const loadMyReviews = async (userId) => {
  if (!supabase || !jobReviewsTableAvailable || !jobId || !userId) return [];
  const { data, error } = await supabase
    .from("job_reviews")
    .select("id,provider_id")
    .eq("job_id", jobId)
    .eq("reviewer_user_id", userId)
    .eq("reviewer_role", "client");
  if (!error && Array.isArray(data)) return data;
  if (isMissingTableError(error)) {
    jobReviewsTableAvailable = false;
    return [];
  }
  return [];
};

const formatSlotLabel = (isoValue) => {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const loadAppointment = async (requestId) => {
  if (!supabase || !bookingTableAvailable || !requestId) return null;
  const { data, error } = await supabase
    .from("job_appointments")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!error) return data || null;
  if (isMissingTableError(error)) {
    bookingTableAvailable = false;
    return null;
  }
  return null;
};

const loadClientAddress = async (userId) => {
  if (!supabase || !userId) return "";
  const { data, error } = await supabase
    .from("clients")
    .select("address,location")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return "";
  return String(data.address || data.location || "").trim();
};

const renderBookingPanel = () => {
  if (!bookingWrap || !bookingSummaryEl || !bookingSlotsEl || !bookingConfirmButton) return;
  if (!bookingTableAvailable || !currentAcceptedRequest) {
    bookingWrap.classList.add("hidden");
    return;
  }
  bookingWrap.classList.remove("hidden");
  bookingSlotsEl.innerHTML = "";
  setBookingStatus("");

  const requestStatus = normalizeRequestStatus(currentAcceptedRequest.status);
  const appointmentStatus = String(currentAppointment?.status || "").toLowerCase();
  const isCompleted = requestStatus === "completed" || requestStatus === "closed" || appointmentStatus === "completed";
  const isScheduled = appointmentStatus === "scheduled";
  const slots = Array.isArray(currentAppointment?.proposed_slots)
    ? currentAppointment.proposed_slots.filter(Boolean).slice(0, 3)
    : [];

  if (!currentAppointment || !slots.length) {
    bookingSummaryEl.textContent = "No appointment availability shared yet.";
    bookingConfirmButton.classList.add("hidden");
    bookingConfirmButton.disabled = true;
    bookingShareAddressButton?.classList.add("hidden");
    bookingAddressWrap?.classList.add("hidden");
    if (bookingNoteInput) bookingNoteInput.disabled = true;
    return;
  }

  if (isCompleted) {
    bookingSummaryEl.textContent = "This job is completed. Appointment is locked.";
  } else if (isScheduled) {
    bookingSummaryEl.textContent = currentAppointment.selected_slot
      ? `Scheduled for ${formatSlotLabel(currentAppointment.selected_slot)}`
      : "Appointment scheduled.";
  } else {
    bookingSummaryEl.textContent = "Choose a slot to confirm your appointment.";
  }

  if (bookingNoteInput) {
    bookingNoteInput.value = currentAppointment.client_notes || "";
    bookingNoteInput.disabled = isCompleted;
  }

  if (bookingAddressInput) {
    bookingAddressInput.value = String(currentAppointment.client_shared_address || currentClientAddress || "").trim();
    bookingAddressInput.disabled = isCompleted;
  }

  selectedBookingSlot = isScheduled ? (currentAppointment.selected_slot || "") : selectedBookingSlot;

  if (isScheduled || isCompleted) {
    const selectedLabel = document.createElement("article");
    selectedLabel.className = "settings-item";
    selectedLabel.innerHTML = `<span>${formatSlotLabel(currentAppointment.selected_slot || selectedBookingSlot) || "Scheduled slot"}</span>`;
    bookingSlotsEl.appendChild(selectedLabel);
  } else {
    slots.forEach((slot, index) => {
      const option = document.createElement("label");
      option.className = "settings-item";
      option.innerHTML = `
        <span>${formatSlotLabel(slot) || "Invalid slot"}</span>
        <input type="radio" name="booking-slot" value="${slot}" ${selectedBookingSlot === slot ? "checked" : ""} />
      `;
      option.querySelector("input")?.addEventListener("change", () => {
        selectedBookingSlot = slot;
        bookingConfirmButton.disabled = false;
      });
      bookingSlotsEl.appendChild(option);
      if (index === 0 && !selectedBookingSlot) {
        selectedBookingSlot = slot;
        const input = option.querySelector("input");
        if (input) input.checked = true;
      }
    });
  }

  if (isCompleted || isScheduled) {
    bookingConfirmButton.classList.add("hidden");
    bookingConfirmButton.disabled = true;
  } else {
    bookingConfirmButton.classList.remove("hidden");
    bookingConfirmButton.disabled = !selectedBookingSlot;
  }

  const showAddressControls = Boolean(isScheduled || isCompleted);
  bookingAddressWrap?.classList.toggle("hidden", !showAddressControls);
  bookingShareAddressButton?.classList.toggle("hidden", !showAddressControls);
  if (bookingShareAddressButton) bookingShareAddressButton.disabled = isCompleted;
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
  if (nextStatus === "accepted") {
    const acceptResult = await supabase
      .from("job_requests")
      .update({ status: "accepted" })
      .eq("id", requestId)
      .eq("job_id", jobId);
    if (acceptResult.error) return;

    const { data: siblingRequests } = await supabase
      .from("job_requests")
      .select("id,status")
      .eq("job_id", jobId)
      .neq("id", requestId);
    // Keep the state machine clear: one accepted proposal per job.
    if (Array.isArray(siblingRequests) && siblingRequests.length) {
      const siblingIds = siblingRequests
        .filter((row) => {
          const status = String(row?.status || "").toLowerCase();
          return status === "pending" || status === "requested";
        })
        .map((row) => row.id)
        .filter(Boolean);
      if (siblingIds.length) {
        await supabase
          .from("job_requests")
          .update({ status: "declined" })
          .in("id", siblingIds);
      }
    }
  } else {
    const result = await supabase
      .from("job_requests")
      .update({ status: nextStatus })
      .eq("id", requestId)
      .eq("job_id", jobId);
    if (result.error) return;
  }

  if (nextStatus === "accepted") await logJobEvent("request_accepted", { request_id: requestId });
  if (nextStatus === "declined") await logJobEvent("request_declined", { request_id: requestId });
  if (nextStatus === "closed") await logJobEvent("request_closed", { request_id: requestId });

  if (nextStatus === "accepted") {
    await supabase
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", jobId);
  }
  if (nextStatus === "closed") {
    await supabase
      .from("jobs")
      .update({ status: "closed" })
      .eq("id", jobId);
    if (bookingTableAvailable) {
      await supabase
        .from("job_appointments")
        .update({ status: "completed" })
        .eq("request_id", requestId)
        .eq("job_id", jobId);
    }
  }
  await render();
};

const confirmAppointmentSlot = async () => {
  if (!supabase || !currentAppointment?.id || !selectedBookingSlot) return;
  if (!bookingTableAvailable) {
    setBookingStatus("Booking is not enabled yet.", "error");
    return;
  }
  setBookingStatus("Confirming appointment...", "info");
  const { data, error } = await supabase
    .from("job_appointments")
    .update({
      status: "scheduled",
      selected_slot: selectedBookingSlot,
      client_notes: (bookingNoteInput?.value || "").trim() || null,
    })
    .eq("id", currentAppointment.id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      bookingTableAvailable = false;
      bookingWrap?.classList.add("hidden");
      setBookingStatus("Booking table is unavailable.", "error");
      return;
    }
    setBookingStatus(error.message || "Could not confirm appointment.", "error");
    return;
  }
  currentAppointment = data || currentAppointment;
  setBookingStatus("Appointment confirmed.", "success");
  await logJobEvent("appointment_scheduled", { request_id: currentAcceptedRequest?.id || null });
  renderBookingPanel();
};

const shareAppointmentAddress = async () => {
  if (!supabase || !currentAppointment?.id) return;
  if (!bookingTableAvailable) {
    setBookingStatus("Booking is not enabled yet.", "error");
    return;
  }
  const address = String(bookingAddressInput?.value || "").trim();
  if (!address) {
    setBookingStatus("Enter an address to share.", "error");
    return;
  }
  setBookingStatus("Sharing address...", "info");
  const { data, error } = await supabase
    .from("job_appointments")
    .update({
      client_shared_address: address,
      client_shared_at: new Date().toISOString(),
      client_notes: (bookingNoteInput?.value || "").trim() || null,
    })
    .eq("id", currentAppointment.id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      bookingTableAvailable = false;
      bookingWrap?.classList.add("hidden");
      setBookingStatus("Booking table is unavailable.", "error");
      return;
    }
    setBookingStatus(error.message || "Could not share address.", "error");
    return;
  }
  currentAppointment = data || currentAppointment;
  setBookingStatus("Address shared with Plug.", "success");
  await logJobEvent("appointment_address_shared", { request_id: currentAcceptedRequest?.id || null });
  renderBookingPanel();
};

const uploadJobPhoto = async (file, index) => {
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
  const path = `jobs/${jobId}/${Date.now()}-${index}.${extension}`;
  const { error } = await supabase.storage.from("job-media").upload(path, uploadBlob, {
    upsert: true,
    contentType,
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
  const category = toCanonicalTag(editCategoryInput?.value || "");
  const description = editDescriptionInput?.value.trim() || "";
  const location = normalizeLocation(editLocationInput?.value || "");
  const locationValidation = await (window.NLINK_SERVICE_TAGS?.validateLocation?.(location)
    || Promise.resolve({ ok: true, normalized: location }));
  if (!locationValidation.ok) {
    setEditStatus(locationValidation.message || "Enter a valid location.", "error");
    return;
  }
  const verifiedLocation = locationValidation.normalized || location;
  if (editLocationInput) editLocationInput.value = verifiedLocation;
  const budgetMin = Number(editBudgetMinInput?.value);
  const budgetMax = Number(editBudgetMaxInput?.value);
  const sqftValue = editSqftInput?.value ? Number(editSqftInput.value) : null;
  const timeline = editTimelineInput?.value.trim() || "";

  if (!title || !category || !description || !verifiedLocation) {
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
      location: verifiedLocation,
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

const submitClientReview = async () => {
  if (!supabase || !jobId || !reviewTarget) return;
  if (reviewSubmitInFlight) return;
  const user = await getSessionUser();
  if (!user) return;
  if (!jobReviewsTableAvailable) {
    setReviewStatus("Reviews are not enabled yet.", "error");
    return;
  }

  const rating = Number(reviewRatingInput?.value || 0);
  const reviewValidation = validateReviewText(reviewTextInput?.value || "");
  if (!reviewValidation.ok) {
    setReviewStatus(reviewValidation.message || "Review text is invalid.", "error");
    return;
  }
  const reviewText = reviewValidation.text;
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    setReviewStatus("Select a rating between 1 and 5.", "error");
    return;
  }
  if (!reviewTarget.providerUserId) {
    setReviewStatus("This provider cannot be reviewed yet.", "error");
    return;
  }

  setReviewStatus("Submitting review...", "info");
  reviewSubmitInFlight = true;
  if (reviewSubmitButton) reviewSubmitButton.disabled = true;
  const { error } = await supabase.from("job_reviews").insert({
    job_id: jobId,
    job_request_id: reviewTarget.requestId || null,
    provider_id: reviewTarget.providerId,
    client_id: user.id,
    reviewer_user_id: user.id,
    reviewer_role: "client",
    reviewee_user_id: reviewTarget.providerUserId,
    reviewee_role: "provider",
    rating,
    review_text: reviewText,
  });

  if (error) {
    reviewSubmitInFlight = false;
    if (reviewSubmitButton) reviewSubmitButton.disabled = false;
    if (isMissingTableError(error)) {
      jobReviewsTableAvailable = false;
      setReviewStatus("Reviews table is unavailable.", "error");
      return;
    }
    setReviewStatus(error.message || "Could not submit review.", "error");
    return;
  }

  reviewSubmitInFlight = false;
  if (reviewSubmitButton) reviewSubmitButton.disabled = false;
  setReviewStatus("Review submitted.", "success");
  setReviewMode(null);
  await render();
};

const render = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  currentClientAddress = await loadClientAddress(user.id);
  const job = await loadJob(user.id);
  if (!job) return;

  currentJob = job;
  hydrateEditForm(job);
  if (!editMode) setEditMode(false);
  setReviewMode(null);

  const requests = await loadRequests();
  const displayJobStatus = deriveDisplayJobStatus(job.status, requests);

  if (titleEl) titleEl.textContent = job.title;
  if (statusEl) statusEl.textContent = displayJobStatus;
  if (closeButton) closeButton.disabled = displayJobStatus === "closed";
  if (reopenButton) reopenButton.disabled = displayJobStatus === "open" || displayJobStatus === "in_progress";
  if (metaLocationEl) metaLocationEl.textContent = job.location || "Not set";
  if (metaBudgetEl) metaBudgetEl.textContent = `$${job.budget_min || 0} - $${job.budget_max || 0}`;
  if (metaSizeEl) metaSizeEl.textContent = job.sqft ? `${job.sqft} sqft` : "Not provided";
  if (metaTimelineEl) metaTimelineEl.textContent = job.timeline || "Flexible";
  if (descriptionEl) descriptionEl.textContent = job.description || "";

  currentPhotos = await loadPhotos();
  renderPhotos();

  if (requestsEl) {
    const myReviews = await loadMyReviews(user.id);
    const reviewedProviderIds = new Set(myReviews.map((row) => row.provider_id).filter(Boolean));
    requestsEl.innerHTML = "";
    if (requests.length === 0) {
      requestsEl.innerHTML = "<p class='muted'>No proposals yet.</p>";
    } else {
      requests.forEach((request) => {
        const card = document.createElement("article");
        card.className = "job-card";
        const normalizedStatus = normalizeRequestStatus(request.status);
        const isPending = normalizedStatus === "pending";
        const isRequested = normalizedStatus === "requested";
        const isAccepted = normalizedStatus === "accepted";
        const isCompleted = normalizedStatus === "completed";
        const isClosed = normalizedStatus === "closed";
        const canRate = isClosed
          && Boolean(request.provider_id)
          && Boolean(request.providers?.owner_id)
          && !reviewedProviderIds.has(request.provider_id);
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${request.providers?.name || "Plug"}</h4>
            <p class="muted">${new Date(request.created_at).toLocaleDateString()}</p>
            ${isRequested ? `<p class="muted">Direct request sent. Waiting for this Plug to submit a proposal.</p>` : ""}
            ${isRequested ? "" : `<p class="muted">${formatProposalType(request.proposal_type)} • ${formatPricingBasis(request.pricing_basis)}</p>`}
            ${isRequested ? "" : `<p class="muted">${formatEstimateRange(request.estimated_price_min, request.estimated_price_max)}</p>`}
            ${request.inspection_fee ? `<p class="muted">Inspection fee: $${request.inspection_fee}${request.inspection_fee_creditable ? " (credited)" : ""}${request.inspection_fee_waivable ? " • can be waived" : ""}</p>` : ""}
            ${request.proposal_notes ? `<p class="muted">${request.proposal_notes}</p>` : ""}
          </div>
          <div class="job-actions">
            <span class="pill">${requestStatusLabel(request.status)}</span>
            ${isPending ? `
              <button class="ghost-button" data-request-action="decline" data-request-id="${request.id}">Decline Proposal</button>
              <button class="primary-button" data-request-action="accept" data-request-id="${request.id}">Accept Proposal</button>
            ` : ""}
            ${isCompleted ? `<button class="ghost-button" data-request-action="close" data-request-id="${request.id}">Confirm Completion</button>` : ""}
            ${(isPending || isAccepted || isCompleted || isClosed) && request.provider_id && request.providers?.owner_id !== user.id ? `
              <a
                class="ghost-button"
                href="../client/client-messages.html?job=${jobId}&provider=${encodeURIComponent(request.provider_id)}${request.providers?.name ? `&providerName=${encodeURIComponent(request.providers.name)}` : ""}${request.providers?.avatar_url ? `&providerAvatar=${encodeURIComponent(request.providers.avatar_url)}` : ""}"
              >Message</a>
            ` : ""}
            ${canRate ? `<button class="ghost-button" data-request-action="rate" data-request-id="${request.id}">Rate</button>` : ""}
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
          if (action === "rate") {
            const request = requests.find((row) => row.id === requestId);
            if (!request?.provider_id) return;
            setReviewMode({
              requestId: request.id,
              providerId: request.provider_id,
              providerUserId: request.providers?.owner_id || null,
              providerName: request.providers?.name || "Plug",
            });
          }
        });
      });
    }
  }

  currentAcceptedRequest = requests.find((request) => {
    const normalized = normalizeRequestStatus(request.status);
    return normalized === "accepted" || normalized === "completed" || normalized === "closed";
  }) || null;
  selectedBookingSlot = "";
  currentAppointment = currentAcceptedRequest?.id
    ? await loadAppointment(currentAcceptedRequest.id)
    : null;
  renderBookingPanel();
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

  const invalid = files.find((file) => {
    const type = String(file.type || "").toLowerCase();
    const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
    const looksImage = type.startsWith("image/") || ALLOWED_IMAGE_EXTS.has(ext);
    return !looksImage || file.size > MAX_IMAGE_BYTES;
  });
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

reviewCancelButton?.addEventListener("click", () => setReviewMode(null));
reviewSubmitButton?.addEventListener("click", submitClientReview);
bookingConfirmButton?.addEventListener("click", confirmAppointmentSlot);
bookingShareAddressButton?.addEventListener("click", shareAppointmentAddress);
