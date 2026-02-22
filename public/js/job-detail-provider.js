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
const reviewToggleWrap = document.getElementById("provider-review-toggle-wrap");
const reviewToggleButton = document.getElementById("provider-review-toggle");
const reviewFormWrap = document.getElementById("provider-review-form-wrap");
const reviewTitleEl = document.getElementById("provider-review-title");
const reviewRatingInput = document.getElementById("provider-review-rating");
const reviewTextInput = document.getElementById("provider-review-text");
const reviewCancelButton = document.getElementById("provider-review-cancel");
const reviewSubmitButton = document.getElementById("provider-review-submit");
const reviewStatusEl = document.getElementById("provider-review-status");

let providerId = null;
let jobId = null;
let jobEventsTableAvailable = true;
let jobReviewsTableAvailable = true;
let providerUserId = null;
let currentJob = null;
let canRateClient = false;

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
  reviewToggleWrap?.classList.toggle("hidden", !canRateClient && !enabled);
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
  currentJob = job;

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

const refreshReviewEligibility = async () => {
  if (!supabase || !providerId || !jobId) return;
  const { data: requestRow } = await supabase
    .from("job_requests")
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();
  const hasCompletedRelationship = requestRow && (requestRow.status === "accepted" || requestRow.status === "closed");
  const myReview = await loadMyReview();
  canRateClient = Boolean(hasCompletedRelationship && !myReview && currentJob?.client_id);
  if (reviewToggleWrap) reviewToggleWrap.classList.toggle("hidden", !canRateClient);
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
  setStatus("Submitting proposal...", "info");

  const { data: existing } = await supabase
    .from("job_requests")
    .select("id,status")
    .eq("job_id", jobId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) {
    requestButton.textContent = existing.status === "accepted" ? "Accepted" : "Proposal Sent";
    requestButton.disabled = true;
    setStatus("Proposal already sent.", "success");
    return;
  }

  const { error } = await supabase.from("job_requests").insert({
    job_id: jobId,
    provider_id: providerId,
    status: "pending",
  });

  if (error) {
    setStatus(error.message || "Could not send proposal.", "error");
    return;
  }

  setStatus("Proposal sent.", "success");
  requestButton.textContent = "Proposal Sent";
  requestButton.disabled = true;
  await logJobEvent("request_sent", { source: "provider_job_detail" });
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
    requestButton.textContent = existing.status === "accepted" ? "Accepted" : "Proposal Sent";
    requestButton.disabled = true;
  }
  await refreshReviewEligibility();
};

requestButton?.addEventListener("click", requestQuote);
reviewToggleButton?.addEventListener("click", () => {
  if (!canRateClient) return;
  if (reviewTitleEl) reviewTitleEl.textContent = `Rate ${currentJob?.client_name || "Client"}`;
  setReviewMode(true);
});
reviewCancelButton?.addEventListener("click", () => setReviewMode(false));
reviewSubmitButton?.addEventListener("click", submitProviderReview);

init();
