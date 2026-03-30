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
const notesEl = document.getElementById("job-notes");
const requestButton = document.getElementById("request-quote");
const messageClientLink = document.getElementById("message-client-link");
const requestStatus = document.getElementById("request-status");
const clientAvatarEl = document.getElementById("job-client-avatar");
const clientNameEl = document.getElementById("job-client-name");
const clientMetaEl = document.getElementById("job-client-meta");
const clientChipsEl = document.getElementById("job-client-chips");
const clientLocationNoteEl = document.getElementById("job-client-location-note");
const clientViewFullButton = document.getElementById("job-client-view-full");
const reviewToggleButton = document.getElementById("provider-review-toggle");
const reviewFormWrap = document.getElementById("provider-review-form-wrap");
const reviewTitleEl = document.getElementById("provider-review-title");
const reviewRatingInput = document.getElementById("provider-review-rating");
const reviewTextInput = document.getElementById("provider-review-text");
const reviewCancelButton = document.getElementById("provider-review-cancel");
const reviewSubmitButton = document.getElementById("provider-review-submit");
const reviewStatusEl = document.getElementById("provider-review-status");
const backLink = document.getElementById("job-detail-back");
const proposalTypeInput = document.getElementById("proposal-type");
const proposalPricingBasisInput = document.getElementById("proposal-pricing-basis");
const proposalEstimateMinInput = document.getElementById("proposal-estimate-min");
const proposalEstimateMaxInput = document.getElementById("proposal-estimate-max");
const proposalInspectionFeeInput = document.getElementById("proposal-inspection-fee");
const proposalInspectionCreditableInput = document.getElementById("proposal-inspection-creditable");
const proposalInspectionWaivableInput = document.getElementById("proposal-inspection-waivable");
const proposalNotesInput = document.getElementById("proposal-notes");
const proposalFormWrap = document.getElementById("proposal-form-wrap");
const proposalSummaryPanel = document.getElementById("proposal-summary-panel");
const proposalSummaryCopy = document.getElementById("proposal-summary-copy");
const proposalSummaryStatus = document.getElementById("proposal-summary-status");
const proposalToggleView = document.getElementById("proposal-toggle-view");

let providerId = null;
let jobId = null;
let jobEventsTableAvailable = true;
let jobReviewsTableAvailable = true;
let providerUserId = null;
let currentJob = null;
let currentClientProfile = null;
let canRateClient = false;
let currentRequestStatus = null;
let proposalExpanded = true;

const normalizeRequestStatus = (status) => {
  const raw = String(status || "pending").toLowerCase();
  if (raw === "closed") return "completed";
  return raw;
};

const requestStatusLabel = (status) => {
  const normalized = normalizeRequestStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "declined") return "Declined";
  return "Pending";
};

const HOME_SERVICE_HINTS = [
  "roof", "painting", "paint", "plumbing", "electric", "electrical", "hvac", "cleaning",
  "lawn", "gutters", "handyman", "solar", "contractor", "home improvement",
];

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
        actor_role: "provider",
        event_type: eventType,
        metadata,
      });
    if (isMissingTableError(error)) jobEventsTableAvailable = false;
  } catch (_error) {
    jobEventsTableAvailable = false;
  }
};

const setReviewStatus = (message, type = "") => {
  if (!reviewStatusEl) return;
  reviewStatusEl.textContent = message;
  reviewStatusEl.className = `auth-status ${type}`.trim();
};

const setReviewMode = (enabled) => {
  reviewFormWrap?.classList.toggle("hidden", !enabled);
  reviewToggleButton?.classList.toggle("hidden", !canRateClient && !enabled);
  if (!enabled) {
    if (reviewRatingInput) reviewRatingInput.value = "5";
    if (reviewTextInput) reviewTextInput.value = "";
    setReviewStatus("");
  }
};

const loadProviderId = async () => {
  const user = await getSessionUser();
  if (!user) return null;
  providerUserId = user.id;
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  return data?.id || null;
};

const loadMyReview = async () => {
  if (!supabase || !jobId || !providerUserId || !jobReviewsTableAvailable) return null;
  const { data, error } = await supabase
    .from("job_reviews")
    .select("id")
    .eq("job_id", jobId)
    .eq("reviewer_user_id", providerUserId)
    .eq("reviewer_role", "provider")
    .maybeSingle();
  if (!error) return data || null;
  if (isMissingTableError(error)) {
    jobReviewsTableAvailable = false;
    return null;
  }
  return null;
};

const loadExistingRequest = async () => {
  if (!supabase || !jobId || !providerId) return null;
  const queries = [
    "id,status,proposal_type,estimated_price_min,estimated_price_max,pricing_basis,inspection_fee,inspection_fee_creditable,inspection_fee_waivable,proposal_notes",
    "id,status",
  ];
  for (let i = 0; i < queries.length; i += 1) {
    const { data, error } = await supabase
      .from("job_requests")
      .select(queries[i])
      .eq("job_id", jobId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!error) return data || null;
    if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return null;
  }
  return null;
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

const loadClientProfile = async (clientId) => {
  if (!supabase || !clientId) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", clientId)
    .maybeSingle();
  if (!error) return data || null;
  if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return null;
  return null;
};

const propertyCompletionCount = (profile) => {
  const value = (profile && typeof profile === "object") ? profile : {};
  const fields = [
    value.propertyType,
    value.ownership,
    value.yearBuilt,
    value.roofAge,
    value.hvacAge,
    value.panelAge,
    value.waterHeaterAge,
    value.renovationYear,
    String(value.accessNotes || "").trim(),
  ];
  return fields.filter((item) => String(item || "").trim().length > 0).length;
};

const closeClientFullProfileModal = () => {
  document.getElementById("provider-client-full-profile-modal")?.remove();
};

const openClientFullProfileModal = () => {
  if (!currentJob) return;
  closeClientFullProfileModal();

  const profile = currentClientProfile?.property_profile || {};
  const chips = [];
  if (profile.propertyType) chips.push(`Type: ${profile.propertyType}`);
  if (profile.ownership) chips.push(`Ownership: ${profile.ownership}`);
  if (profile.yearBuilt) chips.push(`Built: ${profile.yearBuilt}`);
  if (profile.roofAge) chips.push(`Roof: ${profile.roofAge}`);
  if (profile.hvacAge) chips.push(`HVAC: ${profile.hvacAge}`);
  if (profile.panelAge) chips.push(`Panel: ${profile.panelAge}`);
  if (profile.waterHeaterAge) chips.push(`Water Heater: ${profile.waterHeaterAge}`);
  if (profile.renovationYear) chips.push(`Last Reno: ${profile.renovationYear}`);

  const photos = Array.isArray(profile.photos)
    ? profile.photos.filter((item) => item && typeof item.url === "string" && item.url).slice(0, 3)
    : [];
  const completion = propertyCompletionCount(profile);
  const name = currentClientProfile?.full_name || currentJob.client_name || "Neighbor";
  const avatar = currentClientProfile?.avatar_url || currentJob.client_avatar_url || "../assets/neighborpp.png";
  const location = toPublicLocation(currentClientProfile?.location || currentClientProfile?.address || currentJob.client_location_public || currentJob.location || "");
  const memberSince = formatMemberSince(currentJob.created_at);

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "provider-client-full-profile-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="profile-inline-head">
          <img class="inline-avatar" src="${avatar}" alt="${name}" />
          <div>
            <h3>${name}</h3>
            <p class="muted">${memberSince} • ${location || "Location not set"}</p>
          </div>
        </div>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <div class="trust-chips">
        <span class="pill">${currentJob.client_email_verified === true ? "Email verified" : "Email unverified"}</span>
        <span class="pill">${completion}/9 property details</span>
      </div>
      <div class="tag-list">${chips.length ? chips.map((chip) => `<span class="pill">${chip}</span>`).join("") : "<span class=\"pill\">No property details yet</span>"}</div>
      <p class="muted">${profile.accessNotes ? profile.accessNotes : "No property access notes added."}</p>
      <div class="gallery-grid">${photos.map((photo, index) => `
        <article class="gallery-card property-photo-card">
          <img src="${photo.url}" alt="Property ${index + 1}" class="${photo.hidden ? "is-hidden-photo" : ""}" />
          <small class="pill property-photo-visibility">${photo.hidden ? "Hidden" : "Visible"}</small>
        </article>
      `).join("")}</div>
      <p class="muted">Exact address remains private unless the Neighbor shares it after acceptance.</p>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeClientFullProfileModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeClientFullProfileModal();
  });
};

const loadPhotos = async () => {
  if (!supabase || !jobId) return [];
  const { data } = await supabase
    .from("job_photos")
    .select("url")
    .eq("job_id", jobId);
  return data || [];
};

const inferDefaultProposalType = (job) => {
  const haystack = `${job?.title || ""} ${job?.description || ""}`.toLowerCase();
  const isHomeService = HOME_SERVICE_HINTS.some((term) => haystack.includes(term));
  return isHomeService ? "inspection_first" : "direct_service";
};

const hydrateProposalForm = (job, request = null) => {
  if (!proposalTypeInput || !proposalPricingBasisInput) return;
  const defaultType = inferDefaultProposalType(job);
  proposalTypeInput.value = request?.proposal_type || defaultType;
  proposalPricingBasisInput.value = request?.pricing_basis || (defaultType === "direct_service" ? "fixed" : "after_inspection");
  if (proposalEstimateMinInput) proposalEstimateMinInput.value = request?.estimated_price_min ?? "";
  if (proposalEstimateMaxInput) proposalEstimateMaxInput.value = request?.estimated_price_max ?? "";
  if (proposalInspectionFeeInput) proposalInspectionFeeInput.value = request?.inspection_fee ?? "";
  if (proposalInspectionCreditableInput) proposalInspectionCreditableInput.checked = Boolean(request?.inspection_fee_creditable);
  if (proposalInspectionWaivableInput) proposalInspectionWaivableInput.checked = Boolean(request?.inspection_fee_waivable);
  if (proposalNotesInput) proposalNotesInput.value = request?.proposal_notes || "";
};

const getProposalPayload = () => {
  const estimateMin = Number(proposalEstimateMinInput?.value || 0);
  const estimateMax = Number(proposalEstimateMaxInput?.value || 0);
  const inspectionFee = Number(proposalInspectionFeeInput?.value || 0);
  return {
    proposal_type: proposalTypeInput?.value || "inspection_first",
    pricing_basis: proposalPricingBasisInput?.value || "after_inspection",
    estimated_price_min: Number.isFinite(estimateMin) && estimateMin > 0 ? estimateMin : null,
    estimated_price_max: Number.isFinite(estimateMax) && estimateMax > 0 ? estimateMax : null,
    inspection_fee: Number.isFinite(inspectionFee) && inspectionFee > 0 ? inspectionFee : null,
    inspection_fee_creditable: Boolean(proposalInspectionCreditableInput?.checked),
    inspection_fee_waivable: Boolean(proposalInspectionWaivableInput?.checked),
    proposal_notes: (proposalNotesInput?.value || "").trim() || null,
  };
};

const setProposalInputsDisabled = (disabled) => {
  [
    proposalTypeInput,
    proposalPricingBasisInput,
    proposalEstimateMinInput,
    proposalEstimateMaxInput,
    proposalInspectionFeeInput,
    proposalInspectionCreditableInput,
    proposalInspectionWaivableInput,
    proposalNotesInput,
  ].forEach((input) => {
    if (input) input.disabled = disabled;
  });
};

const renderProposalSummary = (request) => {
  if (!proposalSummaryPanel || !proposalSummaryCopy || !proposalSummaryStatus) return;
  if (!request) {
    proposalSummaryPanel.classList.add("hidden");
    return;
  }
  const lines = [];
  const type = request.proposal_type || "inspection_first";
  const typeLabel = type === "direct_service" ? "Direct service" : type === "hybrid" ? "Hybrid" : "Inspection first";
  lines.push(`Type: ${typeLabel}`);
  if (request.pricing_basis) lines.push(`Pricing: ${request.pricing_basis.replace("_", " ")}`);
  if (request.estimated_price_min || request.estimated_price_max) {
    lines.push(`Estimate: $${request.estimated_price_min || 0} - $${request.estimated_price_max || 0}`);
  }
  if (request.inspection_fee) {
    lines.push(`Inspection fee: $${request.inspection_fee}${request.inspection_fee_creditable ? " (credited)" : ""}${request.inspection_fee_waivable ? " • waivable" : ""}`);
  }
  if (request.proposal_notes) lines.push(`Notes: ${request.proposal_notes}`);
  proposalSummaryCopy.innerHTML = lines.map((line) => `<p>${line}</p>`).join("");
  proposalSummaryStatus.textContent = requestStatusLabel(request.status);
  proposalSummaryPanel.classList.remove("hidden");
};

const setProposalView = (expanded) => {
  proposalExpanded = expanded;
  if (proposalFormWrap) proposalFormWrap.classList.toggle("hidden", !expanded);
  if (proposalToggleView) proposalToggleView.textContent = expanded ? "Hide Proposal" : "View Proposal";
};

const setProposalLocked = (locked, request = null) => {
  setProposalInputsDisabled(locked);
  renderProposalSummary(request);
  if (proposalToggleView) proposalToggleView.classList.toggle("hidden", !locked);
  if (locked) {
    setProposalView(false);
  } else {
    setProposalView(true);
    proposalSummaryPanel?.classList.add("hidden");
  }
};

const canMessageClientNow = async () => {
  if (!supabase || !providerId || !jobId || !currentJob?.client_id) return false;
  const normalized = normalizeRequestStatus(currentRequestStatus);
  if (!(normalized === "accepted" || normalized === "completed")) return false;
  const { data, error } = await supabase
    .from("job_messages")
    .select("id")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .eq("client_id", currentJob.client_id)
    .eq("sender_role", "client")
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
};

const updateMessageLinkState = async () => {
  if (!messageClientLink) return;
  const canMessage = await canMessageClientNow();
  if (canMessage && currentJob?.client_id && currentJob.client_id !== providerUserId) {
    const params = new URLSearchParams();
    params.set("job", jobId);
    params.set("client", currentJob.client_id);
    const clientName = currentClientProfile?.full_name || currentJob.client_name || "";
    const clientAvatar = currentClientProfile?.avatar_url || currentJob.client_avatar_url || "";
    if (clientName) params.set("clientName", clientName);
    if (clientAvatar) params.set("clientAvatar", clientAvatar);
    messageClientLink.href = `../provider/provider-messages.html?${params.toString()}`;
    messageClientLink.classList.remove("hidden");
    return;
  }
  messageClientLink.classList.add("hidden");
};

const renderJob = async () => {
  const job = await loadJob();
  if (!job) return;
  currentJob = job;
  hydrateProposalForm(job, null);

  if (titleEl) titleEl.textContent = job.title;
  if (statusEl) statusEl.textContent = job.status || "open";
  if (metaLocationEl) metaLocationEl.textContent = job.location || "Not set";
  if (metaBudgetEl) metaBudgetEl.textContent = `$${job.budget_min || 0} - $${job.budget_max || 0}`;
  if (metaSizeEl) metaSizeEl.textContent = job.sqft ? `${job.sqft} sqft` : "Not provided";
  if (metaTimelineEl) metaTimelineEl.textContent = job.timeline || "Flexible";
  if (descriptionEl) descriptionEl.textContent = job.description || "";

  currentClientProfile = await loadClientProfile(job.client_id);
  if (clientAvatarEl) {
    clientAvatarEl.src = currentClientProfile?.avatar_url || job.client_avatar_url || "../assets/neighborpp.png";
  }
  if (clientNameEl) {
    clientNameEl.textContent = currentClientProfile?.full_name || job.client_name || "Neighbor";
  }
  if (clientMetaEl) {
    const bits = [
      formatMemberSince(job.created_at),
      toPublicLocation(currentClientProfile?.location || currentClientProfile?.address || job.client_location_public || job.location || ""),
    ].filter(Boolean);
    clientMetaEl.textContent = bits.join(" • ");
  }
  if (clientChipsEl) {
    const propertyCompletion = propertyCompletionCount(currentClientProfile?.property_profile || {});
    const chips = [];
    chips.push(job.client_email_verified === true ? "Email verified" : "Email unverified");
    chips.push(`${propertyCompletion}/9 property details`);
    chips.push("Address private until shared");
    clientChipsEl.innerHTML = chips.map((chip) => `<span class="pill">${chip}</span>`).join("");
  }
  if (clientLocationNoteEl) {
    clientLocationNoteEl.textContent = "Street address remains private until the Neighbor chooses to share it.";
  }
  await updateMessageLinkState();

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

clientViewFullButton?.addEventListener("click", openClientFullProfileModal);

const refreshReviewEligibility = async () => {
  if (!supabase || !providerId || !jobId) return;
  const { data: requestRow } = await supabase
    .from("job_requests")
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();
  const hasCompletedRelationship = requestRow && normalizeRequestStatus(requestRow.status) === "completed";
  const myReview = await loadMyReview();
  canRateClient = Boolean(hasCompletedRelationship && !myReview && currentJob?.client_id);
  if (reviewToggleButton) reviewToggleButton.classList.toggle("hidden", !canRateClient);
  if (!canRateClient) setReviewMode(false);
};

const submitProviderReview = async () => {
  if (!supabase || !jobId || !providerId || !providerUserId || !currentJob?.client_id) return;
  if (!jobReviewsTableAvailable) {
    setReviewStatus("Reviews are not enabled yet.", "error");
    return;
  }
  const rating = Number(reviewRatingInput?.value || 0);
  const reviewText = reviewTextInput?.value.trim() || "";
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    setReviewStatus("Select a rating between 1 and 5.", "error");
    return;
  }

  setReviewStatus("Submitting review...", "info");
  const { error } = await supabase
    .from("job_reviews")
    .insert({
      job_id: jobId,
      provider_id: providerId,
      client_id: currentJob.client_id,
      reviewer_user_id: providerUserId,
      reviewer_role: "provider",
      reviewee_user_id: currentJob.client_id,
      reviewee_role: "client",
      rating,
      review_text: reviewText,
    });
  if (error) {
    if (isMissingTableError(error)) {
      jobReviewsTableAvailable = false;
      setReviewStatus("Reviews table is unavailable.", "error");
      return;
    }
    setReviewStatus(error.message || "Could not submit review.", "error");
    return;
  }
  setReviewStatus("Review submitted.", "success");
  setReviewMode(false);
  await refreshReviewEligibility();
};

const requestQuote = async () => {
  if (!supabase || !providerId || !jobId) return;
  if (currentJob?.client_id && providerUserId && currentJob.client_id === providerUserId) {
    setStatus("You cannot send a proposal to your own job.", "error");
    return;
  }
  setStatus("Submitting proposal...", "info");

  const existing = await loadExistingRequest();

  if (existing) {
    hydrateProposalForm(currentJob, existing);
    setProposalLocked(true, existing);
    currentRequestStatus = existing.status || "pending";
    const normalized = normalizeRequestStatus(existing.status);
    requestButton.textContent = normalized === "accepted"
      ? "Accepted"
      : normalized === "completed"
        ? "Completed"
        : normalized === "declined"
          ? "Declined"
        : "Proposal Sent";
    requestButton.disabled = true;
    setStatus("Proposal already sent.", "success");
    await updateMessageLinkState();
    return;
  }

  const proposalPayload = getProposalPayload();
  if (
    proposalPayload.estimated_price_min
    && proposalPayload.estimated_price_max
    && proposalPayload.estimated_price_min > proposalPayload.estimated_price_max
  ) {
    setStatus("Estimate min cannot be greater than estimate max.", "error");
    requestButton.disabled = false;
    return;
  }
  let { error } = await supabase.from("job_requests").insert({
    job_id: jobId,
    provider_id: providerId,
    status: "pending",
    ...proposalPayload,
  });
  if (error && (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205")) {
    const fallback = await supabase.from("job_requests").insert({
      job_id: jobId,
      provider_id: providerId,
      status: "pending",
    });
    error = fallback.error;
  }

  if (error) {
    setStatus(error.message || "Could not send proposal.", "error");
    return;
  }

  setStatus("Proposal sent.", "success");
  currentRequestStatus = "pending";
  setProposalLocked(true, { ...proposalPayload, status: "pending" });
  requestButton.textContent = "Proposal Sent";
  requestButton.disabled = true;
  await logJobEvent("request_sent", { source: "provider_job_detail" });
  await updateMessageLinkState();
};

const init = async () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  const composeMode = params.get("compose") === "1";
  if (!jobId) return;
  if (backLink) {
    backLink.href = "../provider/provider-jobs.html";
  }
  providerId = await loadProviderId();
  await renderJob();
  if (!providerId || !jobId) return;
  const existing = await loadExistingRequest();
  if (existing) {
    hydrateProposalForm(currentJob, existing);
    setProposalLocked(true, existing);
  } else {
    setProposalLocked(false, null);
    if (composeMode) {
      setProposalView(true);
      proposalTypeInput?.focus();
      proposalFormWrap?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  currentRequestStatus = existing?.status || null;
  if (existing) {
    const normalized = normalizeRequestStatus(existing.status);
    requestButton.textContent = normalized === "accepted"
      ? "Accepted"
      : normalized === "completed"
        ? "Completed"
        : normalized === "declined"
          ? "Declined"
        : "Proposal Sent";
    requestButton.disabled = true;
  }
  await updateMessageLinkState();
  await refreshReviewEligibility();
};

requestButton?.addEventListener("click", requestQuote);
reviewToggleButton?.addEventListener("click", () => {
  if (!canRateClient) return;
  if (reviewTitleEl) reviewTitleEl.textContent = `Rate ${currentJob?.client_name || "Neighbor"}`;
  setReviewMode(true);
});
reviewCancelButton?.addEventListener("click", () => setReviewMode(false));
reviewSubmitButton?.addEventListener("click", submitProviderReview);
proposalToggleView?.addEventListener("click", () => {
  setProposalView(!proposalExpanded);
});

init();
