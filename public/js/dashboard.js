const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;
const clientReady = Boolean(supabase);

const statusEl = document.getElementById("dashboard-status");
const form = document.getElementById("profile-form");
const nameInput = document.getElementById("profile-name");
const categoryInput = document.getElementById("profile-category");
const locationInput = document.getElementById("profile-location");
const budgetInput = document.getElementById("profile-budget");
const descriptionInput = document.getElementById("profile-description");
const taglineInput = document.getElementById("profile-tagline");
const servicesInput = document.getElementById("profile-services");
const availabilityInput = document.getElementById("profile-availability");
const availabilityDaysInput = document.getElementById("profile-availability-days");
const availabilityStartInput = document.getElementById("profile-availability-start");
const availabilityEndInput = document.getElementById("profile-availability-end");
const serviceAreaZipInput = document.getElementById("profile-service-area-zip");
const serviceRadiusInput = document.getElementById("profile-service-radius");
const phoneInput = document.getElementById("profile-phone");
const websiteInput = document.getElementById("profile-website");
const addressInput = document.getElementById("profile-address");
const pricingDetailsInput = document.getElementById("profile-pricing-details");
const socialInstagramInput = document.getElementById("profile-social-instagram");
const socialFacebookInput = document.getElementById("profile-social-facebook");
const socialLinkedinInput = document.getElementById("profile-social-linkedin");
const socialTiktokInput = document.getElementById("profile-social-tiktok");
const bannerUpload = document.getElementById("banner-upload");
const avatarUpload = document.getElementById("avatar-upload");
const bannerPresets = document.getElementById("banner-presets");
const bannerUploadName = document.getElementById("banner-upload-name");
const avatarUploadName = document.getElementById("avatar-upload-name");
const previewEl = document.getElementById("profile-preview");
const providerNameHeaderEl = document.getElementById("provider-name-header");
const providerAvatarHeaderEl = document.getElementById("provider-avatar-header");
const fbCoverEl = document.querySelector(".fb-cover");
const galleryUpload = document.getElementById("gallery-upload");
const galleryGrid = document.getElementById("gallery-grid");
const galleryEmpty = document.getElementById("gallery-empty");
const isEditPage = Boolean(form);
const fullProfileButton = document.getElementById("view-full-profile");
const statProfileViewsEl = document.getElementById("stat-profile-views");
const statSavesEl = document.getElementById("stat-saves");
const statRequestsEl = document.getElementById("stat-requests");
const statContactClicksEl = document.getElementById("stat-contact-clicks");
const statBookingClicksEl = document.getElementById("stat-booking-clicks");
const ratingValueEl = document.getElementById("service-rating-value");
const ratingCountEl = document.getElementById("service-rating-count");
const ratingStarsEl = document.getElementById("service-rating-stars");
const profileStatusPillEl = document.getElementById("profile-status-pill");
const profileCompletionTextEl = document.getElementById("profile-completion-text");
const profileCompletionBarEl = document.getElementById("profile-completion-bar");
const profileMissingListEl = document.getElementById("profile-missing-list");
const saveDraftButton = document.getElementById("save-draft-btn");
const publishProfileButton = document.getElementById("publish-profile-btn");
const pauseProfileButton = document.getElementById("pause-profile-btn");
const dashboardListingStatusEl = document.getElementById("dashboard-listing-status");
const labels = window.NLINK_UI_LABELS || {};
const labelCommon = labels.common || {};
const labelRating = labels.rating || {};
const labelProfile = labels.profile || {};
const labelPricing = labels.pricing || {};
const labelActions = labels.actions || {};
const labelBeta = labels.beta || {};

const state = {
  user: null,
  provider: null,
  gallery: [],
  metrics: {
    profileViews: null,
    saves: null,
    requests: 0,
    contactClicks: 0,
    bookingClicks: 0,
    ratingAverage: 0,
    reviewCount: 0,
    reviews: [],
  },
  meta: {
    tagline: "",
    services: [],
    availability: "",
    availabilityDays: "",
    availabilityStart: "",
    availabilityEnd: "",
    serviceAreaZip: "",
    serviceRadiusMiles: "",
    address: "",
    phone: "",
    website: "",
    pricingDetails: "",
    socialInstagram: "",
    socialFacebook: "",
    socialLinkedin: "",
    socialTiktok: "",
    listingStatus: "draft",
    profileCompletion: 0,
  },
  readiness: {
    completion: 0,
    missing: [],
  },
};

const providerMetaKey = "nlink_provider_meta";
const primaryProviderKey = "nlink_primary_provider_id";
const providerListingStatusKey = "nlink_provider_listing_status";
const providerListingStatusGlobalKey = "nlink_provider_listing_status_active";
let profileMetaBackendAvailable = true;
let providerEventsTableAvailable = true;
const providerMetricsTablesAvailable = {
  reviews: false,
  views: false,
  saves: false,
};

const isMissingTableError = (error) => (
  Boolean(error)
  && (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.status === 404
  )
);

const getLocalMetaStore = () => {
  try {
    return JSON.parse(localStorage.getItem(providerMetaKey)) || {};
  } catch (_error) {
    return {};
  }
};

const setLocalMetaStore = (store) => {
  localStorage.setItem(providerMetaKey, JSON.stringify(store));
};

const getMetaKey = () => {
  if (state.provider?.id) return `provider:${state.provider.id}`;
  if (state.user?.id) return `owner:${state.user.id}`;
  return "local";
};

const getLocalListingStatusStore = () => {
  try {
    return JSON.parse(localStorage.getItem(providerListingStatusKey)) || {};
  } catch (_error) {
    return {};
  }
};

const setLocalListingStatusStore = (store) => {
  localStorage.setItem(providerListingStatusKey, JSON.stringify(store));
};

const saveLocalListingStatus = (providerId, status) => {
  if (!providerId || !status) return;
  const store = getLocalListingStatusStore();
  store[providerId] = status;
  setLocalListingStatusStore(store);
};

const getLocalListingStatus = (providerId) => {
  if (!providerId) return null;
  const store = getLocalListingStatusStore();
  return store[providerId] || null;
};

const saveGlobalListingStatus = (status) => {
  if (!status) return;
  localStorage.setItem(providerListingStatusGlobalKey, status);
};

const getGlobalListingStatus = () => localStorage.getItem(providerListingStatusGlobalKey);

const normalizeListingStatus = (status) => (
  status === "published" || status === "paused" || status === "draft" ? status : null
);

const pickPreferredListingStatus = (...statuses) => {
  const priority = { published: 3, paused: 2, draft: 1 };
  const normalized = statuses.map(normalizeListingStatus).filter(Boolean);
  if (!normalized.length) return null;
  return normalized.sort((a, b) => priority[b] - priority[a])[0];
};

const saveProviderMeta = (meta) => {
  const store = getLocalMetaStore();
  store[getMetaKey()] = meta;
  setLocalMetaStore(store);
};

const loadLocalProviderMeta = () => {
  const store = getLocalMetaStore();
  const providerKey = state.provider?.id ? `provider:${state.provider.id}` : null;
  const ownerKey = state.user?.id ? `owner:${state.user.id}` : null;
  return store[providerKey] || store[ownerKey] || store.local || null;
};

const isPlaceholderUrl = (value) => typeof value === "string" && value.toLowerCase().includes("placeholder");

const pickBestProviderRecord = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const preferredId = localStorage.getItem(primaryProviderKey);
  const score = (row) => {
    let total = 0;
    if (preferredId && row.id === preferredId) total += 1;
    if (row.name) total += 2;
    if (row.category) total += 2;
    if (row.location) total += 2;
    if (Number.isFinite(row.budget_min) || Number.isFinite(row.budget_max)) total += 1;
    if (row.description) total += 1;
    if (row.banner_url && !isPlaceholderUrl(row.banner_url)) total += 3;
    if (row.avatar_url && !isPlaceholderUrl(row.avatar_url)) total += 3;
    if (row.created_at) total += 0.1;
    return total;
  };
  return rows.slice().sort((a, b) => score(b) - score(a))[0];
};

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const getErrorText = (error, fallback = "Something went wrong.") => {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return parts.length ? parts.join(" • ") : fallback;
};

const normalizeServices = (value) => value
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
  .slice(0, 12);

const renderStars = (rating) => {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  return "★".repeat(fullStars) + (hasHalf ? "☆" : "") + "✩".repeat(emptyStars);
};

const syncMetaFromInputs = () => {
  state.meta = {
    tagline: taglineInput?.value.trim() || "",
    services: normalizeServices(servicesInput?.value || ""),
    availability: availabilityInput?.value.trim() || "",
    availabilityDays: availabilityDaysInput?.value.trim() || "",
    availabilityStart: availabilityStartInput?.value || "",
    availabilityEnd: availabilityEndInput?.value || "",
    serviceAreaZip: serviceAreaZipInput?.value.trim() || "",
    serviceRadiusMiles: serviceRadiusInput?.value ? String(Number(serviceRadiusInput.value)) : "",
    address: addressInput?.value.trim() || "",
    phone: phoneInput?.value.trim() || "",
    website: websiteInput?.value.trim() || "",
    pricingDetails: pricingDetailsInput?.value.trim() || "",
    socialInstagram: socialInstagramInput?.value.trim() || "",
    socialFacebook: socialFacebookInput?.value.trim() || "",
    socialLinkedin: socialLinkedinInput?.value.trim() || "",
    socialTiktok: socialTiktokInput?.value.trim() || "",
  };
};

const applyMetaToInputs = () => {
  if (taglineInput) taglineInput.value = state.meta.tagline || "";
  if (servicesInput) servicesInput.value = (state.meta.services || []).join(", ");
  if (availabilityInput) availabilityInput.value = state.meta.availability || "";
  if (availabilityDaysInput) availabilityDaysInput.value = state.meta.availabilityDays || "";
  if (availabilityStartInput) availabilityStartInput.value = state.meta.availabilityStart || "";
  if (availabilityEndInput) availabilityEndInput.value = state.meta.availabilityEnd || "";
  if (serviceAreaZipInput) serviceAreaZipInput.value = state.meta.serviceAreaZip || "";
  if (serviceRadiusInput) serviceRadiusInput.value = state.meta.serviceRadiusMiles || "";
  if (addressInput) addressInput.value = state.meta.address || "";
  if (phoneInput) phoneInput.value = state.meta.phone || "";
  if (websiteInput) websiteInput.value = state.meta.website || "";
  if (pricingDetailsInput) pricingDetailsInput.value = state.meta.pricingDetails || "";
  if (socialInstagramInput) socialInstagramInput.value = state.meta.socialInstagram || "";
  if (socialFacebookInput) socialFacebookInput.value = state.meta.socialFacebook || "";
  if (socialLinkedinInput) socialLinkedinInput.value = state.meta.socialLinkedin || "";
  if (socialTiktokInput) socialTiktokInput.value = state.meta.socialTiktok || "";
};

const normalizeMeta = (value) => ({
  tagline: value?.tagline || "",
  services: Array.isArray(value?.services) ? value.services : [],
  availability: value?.availability || "",
  availabilityDays: value?.availability_days || value?.availabilityDays || "",
  availabilityStart: value?.availability_start || value?.availabilityStart || "",
  availabilityEnd: value?.availability_end || value?.availabilityEnd || "",
  serviceAreaZip: value?.service_area_zip || value?.serviceAreaZip || "",
  serviceRadiusMiles: value?.service_radius_miles ? String(value.service_radius_miles) : (value?.serviceRadiusMiles || ""),
  address: value?.address || "",
  phone: value?.phone || "",
  website: value?.website || "",
  pricingDetails: value?.pricing_details || value?.pricingDetails || "",
  socialInstagram: value?.social_instagram || value?.socialInstagram || "",
  socialFacebook: value?.social_facebook || value?.socialFacebook || "",
  socialLinkedin: value?.social_linkedin || value?.socialLinkedin || "",
  socialTiktok: value?.social_tiktok || value?.socialTiktok || "",
  listingStatus: value?.listing_status || value?.listingStatus || "draft",
  profileCompletion: Number(value?.profile_completion ?? value?.profileCompletion ?? 0) || 0,
});

const pickBestMetaRow = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const statusPriority = (status) => {
    if (status === "published") return 3;
    if (status === "paused") return 2;
    if (status === "draft") return 1;
    return 0;
  };
  const score = (row) => {
    let total = 0;
    total += statusPriority(row?.listing_status) * 100;
    if (Array.isArray(row?.services) && row.services.length > 0) total += 1;
    if (row?.phone) total += 1;
    if (row?.address) total += 1;
    if (row?.pricing_details) total += 1;
    total += Number(row?.profile_completion || 0) / 100;
    return total;
  };
  return rows.slice().sort((a, b) => score(b) - score(a))[0];
};

const getPersistedListingStatus = async () => {
  if (!supabase || !state.provider?.id || !profileMetaBackendAvailable) return null;
  const { data, error } = await supabase
    .from("provider_profiles")
    .select("listing_status")
    .eq("provider_id", state.provider.id)
    .limit(25);
  if (error) return null;
  if (!Array.isArray(data) || data.length === 0) return null;
  if (data.some((row) => row?.listing_status === "published")) return "published";
  if (data.some((row) => row?.listing_status === "paused")) return "paused";
  if (data.some((row) => row?.listing_status === "draft")) return "draft";
  return null;
};

const getListingStatusFromMetadata = () => {
  const metadata = state.user?.user_metadata || {};
  const status = metadata.provider_listing_status;
  return (status === "published" || status === "paused" || status === "draft") ? status : null;
};

const persistListingStatusToMetadata = async (status) => {
  if (!supabase || !state.user?.id || !status) return;
  const metadata = state.user.user_metadata || {};
  const current = metadata.provider_listing_status;
  if (current === status) return;
  const payload = {
    ...metadata,
    provider_listing_status: status,
  };
  if (state.provider?.id) payload.provider_listing_provider_id = state.provider.id;
  const { error } = await supabase.auth.updateUser({ data: payload });
  if (!error) {
    state.user = {
      ...state.user,
      user_metadata: payload,
    };
  }
};

const MAX_UPLOAD_SIZE_MB = 10;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

const isValidImageUpload = (file) => {
  if (!file) return false;
  if (!file.type || !file.type.startsWith("image/")) return false;
  if (ALLOWED_IMAGE_TYPES.size > 0 && !ALLOWED_IMAGE_TYPES.has(file.type)) return false;
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return false;
  return true;
};

const formatMetricValue = (value) => {
  if (value === null || value === undefined) return "—";
  return String(value);
};

const getReadinessChecklist = () => {
  const provider = state.provider || {};
  const checks = [
    {
      label: "Add business name",
      done: Boolean(provider.name && provider.name.trim()),
    },
    {
      label: "Add service category",
      done: Boolean(provider.category && provider.category.trim()),
    },
    {
      label: "Add location",
      done: Boolean(provider.location && provider.location.trim()),
    },
    {
      label: "Add budget range",
      done: Number.isFinite(provider.budget_min) && Number.isFinite(provider.budget_max) && provider.budget_max >= provider.budget_min,
    },
    {
      label: "Add business description",
      done: Boolean(provider.description && provider.description.trim().length >= 24),
    },
    {
      label: "Upload a logo",
      done: Boolean(provider.avatar_url),
    },
    {
      label: "Upload a banner",
      done: Boolean(provider.banner_url || provider.hero_url),
    },
    {
      label: "Add at least one service tag",
      done: Array.isArray(state.meta.services) && state.meta.services.length > 0,
    },
    {
      label: "Add phone number",
      done: Boolean(state.meta.phone && state.meta.phone.trim()),
    },
    {
      label: "Upload at least 2 gallery photos",
      done: Array.isArray(state.gallery) && state.gallery.length >= 2,
    },
  ];
  const doneCount = checks.filter((item) => item.done).length;
  const completion = Math.round((doneCount / checks.length) * 100);
  const missing = checks.filter((item) => !item.done).map((item) => item.label);
  return { completion, missing };
};

const renderReadinessUi = () => {
  if (!profileCompletionBarEl && !profileCompletionTextEl && !profileStatusPillEl && !dashboardListingStatusEl) return;
  const status = state.meta.listingStatus || "draft";
  const { completion, missing } = getReadinessChecklist();
  state.readiness = { completion, missing };
  state.meta.profileCompletion = completion;

  if (profileCompletionTextEl) profileCompletionTextEl.textContent = `${completion}% complete`;
  if (profileCompletionBarEl) profileCompletionBarEl.style.width = `${Math.max(0, Math.min(completion, 100))}%`;
  if (profileMissingListEl) {
    profileMissingListEl.innerHTML = "";
    if (missing.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Profile is publish-ready.";
      profileMissingListEl.appendChild(item);
    } else {
      missing.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        profileMissingListEl.appendChild(item);
      });
    }
  }

  const applyStatusBadge = (el) => {
    if (!el) return;
    el.classList.remove("badge-success", "badge-muted");
    if (status === "published") {
      el.textContent = "Published";
      el.classList.add("badge-success");
    } else if (status === "paused") {
      el.textContent = "Paused";
      el.classList.add("badge-muted");
    } else {
      el.textContent = "Draft";
      el.classList.add("badge-muted");
    }
  };
  applyStatusBadge(profileStatusPillEl);
  applyStatusBadge(dashboardListingStatusEl);

  if (publishProfileButton) publishProfileButton.disabled = !state.provider?.id || missing.length > 0;
  if (pauseProfileButton) pauseProfileButton.disabled = !state.provider?.id || status !== "published";
};

const updateMetricsUi = () => {
  if (statProfileViewsEl) statProfileViewsEl.textContent = formatMetricValue(state.metrics.profileViews);
  if (statSavesEl) statSavesEl.textContent = formatMetricValue(state.metrics.saves);
  if (statRequestsEl) statRequestsEl.textContent = formatMetricValue(state.metrics.requests);
  if (statContactClicksEl) statContactClicksEl.textContent = formatMetricValue(state.metrics.contactClicks);
  if (statBookingClicksEl) statBookingClicksEl.textContent = formatMetricValue(state.metrics.bookingClicks);

  if (ratingValueEl) {
    ratingValueEl.textContent = state.metrics.ratingAverage > 0
      ? state.metrics.ratingAverage.toFixed(1)
      : (labelRating.unrated || "Unrated");
  }
  if (ratingCountEl) {
    ratingCountEl.textContent = state.metrics.reviewCount > 0
      ? `${state.metrics.reviewCount} reviews`
      : (labelRating.noReviews || "No reviews yet");
  }
  if (ratingStarsEl) {
    ratingStarsEl.textContent = state.metrics.ratingAverage > 0
      ? renderStars(state.metrics.ratingAverage)
      : "☆☆☆☆☆";
  }
};

const loadProviderMetrics = async () => {
  if (!supabase || !state.provider?.id) return;
  if (!statProfileViewsEl && !statSavesEl && !statRequestsEl && !statContactClicksEl && !statBookingClicksEl && !ratingValueEl && !ratingCountEl && !ratingStarsEl) {
    return;
  }

  const { count: requestCount, error: requestError } = await supabase
    .from("job_requests")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", state.provider.id);
  if (!requestError) {
    state.metrics.requests = requestCount || 0;
  }

  if (providerMetricsTablesAvailable.reviews) {
    const { data: reviewRows, error: reviewError } = await supabase
      .from("provider_reviews")
      .select("*")
      .eq("provider_id", state.provider.id);
    if (!reviewError && Array.isArray(reviewRows)) {
      state.metrics.reviews = reviewRows.map((row) => ({
        name: row.reviewer_name || row.name || "Anonymous",
        rating: Number(row.rating) || 0,
        text: row.text || row.comment || row.body || "",
      }));
      state.metrics.reviewCount = state.metrics.reviews.length;
      state.metrics.ratingAverage = state.metrics.reviewCount > 0
        ? state.metrics.reviews.reduce((sum, row) => sum + row.rating, 0) / state.metrics.reviewCount
        : 0;
    } else if (isMissingTableError(reviewError)) {
      providerMetricsTablesAvailable.reviews = false;
      state.metrics.reviews = [];
      state.metrics.reviewCount = 0;
      state.metrics.ratingAverage = 0;
    }
  }

  if (providerMetricsTablesAvailable.views) {
    const { count: viewsCount, error: viewsError } = await supabase
      .from("provider_views")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", state.provider.id);
    if (!viewsError) {
      state.metrics.profileViews = viewsCount || 0;
    } else if (isMissingTableError(viewsError)) {
      providerMetricsTablesAvailable.views = false;
      state.metrics.profileViews = null;
    }
  }

  if (providerMetricsTablesAvailable.saves) {
    const { count: savesCount, error: savesError } = await supabase
      .from("provider_saves")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", state.provider.id);
    if (!savesError) {
      state.metrics.saves = savesCount || 0;
    } else if (isMissingTableError(savesError)) {
      providerMetricsTablesAvailable.saves = false;
      state.metrics.saves = null;
    }
  }

  if (providerEventsTableAvailable) {
    const [{ count: viewEventCount, error: viewEventError }, { count: saveEventCount, error: saveEventError }, { count: contactEventCount, error: contactEventError }, { count: bookingEventCount, error: bookingEventError }] = await Promise.all([
      supabase.from("provider_events").select("id", { count: "exact", head: true }).eq("provider_id", state.provider.id).eq("event_type", "profile_view"),
      supabase.from("provider_events").select("id", { count: "exact", head: true }).eq("provider_id", state.provider.id).eq("event_type", "save_click"),
      supabase.from("provider_events").select("id", { count: "exact", head: true }).eq("provider_id", state.provider.id).eq("event_type", "contact_click"),
      supabase.from("provider_events").select("id", { count: "exact", head: true }).eq("provider_id", state.provider.id).eq("event_type", "booking_click"),
    ]);

    const missingEventsTable = isMissingTableError(viewEventError)
      || isMissingTableError(saveEventError)
      || isMissingTableError(contactEventError)
      || isMissingTableError(bookingEventError);

    if (missingEventsTable) {
      providerEventsTableAvailable = false;
    } else {
      state.metrics.contactClicks = contactEventCount || 0;
      state.metrics.bookingClicks = bookingEventCount || 0;
      if (state.metrics.profileViews === null) state.metrics.profileViews = viewEventCount || 0;
      if (state.metrics.saves === null) state.metrics.saves = saveEventCount || 0;
    }
  }

  updateMetricsUi();
};

const updateProviderRow = async (changes) => {
  if (!state.provider?.id) throw new Error("Provider profile not found.");
  const providerId = state.provider.id;
  const { data: ownerScopedRows, error: ownerScopedError } = await supabase
    .from("providers")
    .update(changes)
    .eq("id", providerId)
    .eq("owner_id", state.user.id)
    .select("id");
  if (ownerScopedError) throw ownerScopedError;

  if (Array.isArray(ownerScopedRows) && ownerScopedRows.length > 0) {
    await reloadProviderById(providerId);
    const applied = state.provider
      && Object.entries(changes).every(([key, value]) => state.provider[key] === value);
    if (!applied) throw new Error("Provider update did not persist.");
    localStorage.setItem(primaryProviderKey, state.provider.id);
    return state.provider;
  }

  // If current provider id is stale, switch to the latest row owned by this user.
  const { data: ownedRows, error: ownedReadError } = await supabase
    .from("providers")
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
    .eq("owner_id", state.user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ownedReadError) throw ownedReadError;
  const ownedProvider = ownedRows?.[0] || null;
  if (ownedProvider) {
    const { data: ownedUpdateRows, error: ownedUpdateError } = await supabase
      .from("providers")
      .update(changes)
      .eq("id", ownedProvider.id)
      .eq("owner_id", state.user.id)
      .select("id")
      .limit(1);
    if (ownedUpdateError) throw ownedUpdateError;
    if (Array.isArray(ownedUpdateRows) && ownedUpdateRows.length > 0) {
      state.provider = ownedProvider;
      await reloadProviderById(ownedProvider.id);
      localStorage.setItem(primaryProviderKey, ownedProvider.id);
      return state.provider;
    }
  }

  // Legacy repair: if this row is not updatable by owner scope, create a new owned row and continue there.
  const repairedProviderId = crypto.randomUUID();
  const repairedPayload = {
    id: repairedProviderId,
    owner_id: state.user.id,
    name: changes.name ?? state.provider.name ?? "",
    category: changes.category ?? state.provider.category ?? "",
    location: changes.location ?? state.provider.location ?? "",
    budget_min: changes.budget_min ?? state.provider.budget_min ?? 0,
    budget_max: changes.budget_max ?? state.provider.budget_max ?? 0,
    description: changes.description ?? state.provider.description ?? "",
    hero_url: changes.hero_url ?? state.provider.hero_url ?? null,
    banner_url: changes.banner_url ?? state.provider.banner_url ?? null,
    avatar_url: changes.avatar_url ?? state.provider.avatar_url ?? null,
  };
  const { data: repairedRow, error: repairError } = await supabase
    .from("providers")
    .insert(repairedPayload)
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
    .single();
  if (repairError) {
    if (repairError.code === "23505") {
      const { data: latestOwnedRows, error: latestOwnedError } = await supabase
        .from("providers")
        .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
        .eq("owner_id", state.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (latestOwnedError) throw latestOwnedError;
      const latestOwned = latestOwnedRows?.[0];
      if (latestOwned) {
        const { data: latestUpdateRows, error: latestUpdateError } = await supabase
          .from("providers")
          .update(changes)
          .eq("id", latestOwned.id)
          .eq("owner_id", state.user.id)
          .select("id")
          .limit(1);
        if (latestUpdateError) throw latestUpdateError;
        if (Array.isArray(latestUpdateRows) && latestUpdateRows.length > 0) {
          state.provider = latestOwned;
          await reloadProviderById(latestOwned.id);
          localStorage.setItem(primaryProviderKey, latestOwned.id);
          return state.provider;
        }
      }
    }
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from("providers")
      .update(changes)
      .eq("id", providerId)
      .select("id");
    if (fallbackError) throw fallbackError;
    if (!fallbackRows?.length) {
      throw new Error("Could not save changes on this provider profile.");
    }
    await reloadProviderById(providerId);
    const appliedFallback = state.provider
      && Object.entries(changes).every(([key, value]) => state.provider[key] === value);
    if (!appliedFallback) throw new Error("Provider update did not persist.");
    localStorage.setItem(primaryProviderKey, state.provider.id);
    return state.provider;
  }

  state.provider = repairedRow;
  // Migrate dependent rows so gallery/meta stay attached after legacy-row repair.
  await supabase
    .from("provider_photos")
    .update({ provider_id: repairedProviderId })
    .eq("provider_id", providerId);
  await supabase
    .from("provider_profiles")
    .update({ provider_id: repairedProviderId, owner_id: state.user.id })
    .eq("provider_id", providerId);
  state.gallery = state.gallery.map((photo) => ({ ...photo, provider_id: repairedProviderId }));
  localStorage.setItem(primaryProviderKey, repairedProviderId);
  await saveProviderMetaToBackend();
  return state.provider;
};

const loadProviderMetaFromBackend = async () => {
  const localMeta = loadLocalProviderMeta();
  if (!clientReady || !supabase || !state.provider?.id || !profileMetaBackendAvailable) {
    state.meta = normalizeMeta(localMeta || state.meta);
    const metadataStatus = getListingStatusFromMetadata();
    if (metadataStatus) state.meta.listingStatus = metadataStatus;
    const globalStatus = getGlobalListingStatus();
    const localStatus = getLocalListingStatus(state.provider?.id);
    state.meta.listingStatus = pickPreferredListingStatus(
      state.meta.listingStatus,
      metadataStatus,
      localStatus,
      globalStatus,
    ) || "draft";
    return;
  }

  const { data, error } = await supabase
    .from("provider_profiles")
    .select("tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok,listing_status,profile_completion")
    .eq("provider_id", state.provider.id)
    .limit(10);

  if (error) {
    if (error.code === "42P01" || error.code === "42703") {
      profileMetaBackendAvailable = false;
      state.meta = normalizeMeta(localMeta || state.meta);
      return;
    }
    throw error;
  }

  const picked = pickBestMetaRow(data);
  state.meta = normalizeMeta(picked || localMeta || state.meta);
  const metadataStatus = getListingStatusFromMetadata();
  if (metadataStatus) state.meta.listingStatus = metadataStatus;
  const localStatus = getLocalListingStatus(state.provider?.id);
  const globalStatus = getGlobalListingStatus();
  state.meta.listingStatus = pickPreferredListingStatus(
    state.meta.listingStatus,
    metadataStatus,
    localStatus,
    globalStatus,
  ) || "draft";
};

const saveProviderMetaToBackend = async () => {
  saveProviderMeta(state.meta);
  if (!clientReady || !supabase || !state.user?.id || !state.provider?.id || !profileMetaBackendAvailable) {
    return;
  }

  const payload = {
    provider_id: state.provider.id,
    owner_id: state.user.id,
    tagline: state.meta.tagline || null,
    services: Array.isArray(state.meta.services) ? state.meta.services : [],
    availability: state.meta.availability || null,
    availability_days: state.meta.availabilityDays || null,
    availability_start: state.meta.availabilityStart || null,
    availability_end: state.meta.availabilityEnd || null,
    service_area_zip: state.meta.serviceAreaZip || null,
    service_radius_miles: state.meta.serviceRadiusMiles ? Number(state.meta.serviceRadiusMiles) : null,
    address: state.meta.address || null,
    phone: state.meta.phone || null,
    website: state.meta.website || null,
    pricing_details: state.meta.pricingDetails || null,
    social_instagram: state.meta.socialInstagram || null,
    social_facebook: state.meta.socialFacebook || null,
    social_linkedin: state.meta.socialLinkedin || null,
    social_tiktok: state.meta.socialTiktok || null,
    listing_status: state.meta.listingStatus || "draft",
    profile_completion: Number(state.meta.profileCompletion || 0),
  };

  const writeLegacyPayload = async () => {
    const legacyPayload = {
      provider_id: state.provider.id,
      owner_id: state.user.id,
      tagline: state.meta.tagline || null,
      services: Array.isArray(state.meta.services) ? state.meta.services : [],
      availability: state.meta.availability || null,
      availability_days: state.meta.availabilityDays || null,
      availability_start: state.meta.availabilityStart || null,
      availability_end: state.meta.availabilityEnd || null,
      service_area_zip: state.meta.serviceAreaZip || null,
      service_radius_miles: state.meta.serviceRadiusMiles ? Number(state.meta.serviceRadiusMiles) : null,
      address: state.meta.address || null,
      phone: state.meta.phone || null,
      website: state.meta.website || null,
      pricing_details: state.meta.pricingDetails || null,
      social_instagram: state.meta.socialInstagram || null,
      social_facebook: state.meta.socialFacebook || null,
      social_linkedin: state.meta.socialLinkedin || null,
      social_tiktok: state.meta.socialTiktok || null,
    };
    const { data: updatedRows, error: updateLegacyError } = await supabase
      .from("provider_profiles")
      .update(legacyPayload)
      .eq("provider_id", state.provider.id)
      .select("provider_id")
      .limit(1);
    if (updateLegacyError) throw updateLegacyError;
    if (Array.isArray(updatedRows) && updatedRows.length > 0) return;
    const { error: insertLegacyError } = await supabase
      .from("provider_profiles")
      .insert(legacyPayload);
    if (insertLegacyError) throw insertLegacyError;
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("provider_profiles")
    .update(payload)
    .eq("provider_id", state.provider.id)
    .select("provider_id")
    .limit(1);

  if (updateError) {
    if (updateError.code === "42P01") {
      profileMetaBackendAvailable = false;
      return;
    }
    if (updateError.code === "42703") {
      await writeLegacyPayload();
      return;
    }
    throw updateError;
  }

  if (Array.isArray(updatedRows) && updatedRows.length > 0) return;

  const { error: insertError } = await supabase
    .from("provider_profiles")
    .insert(payload);
  if (insertError) {
    if (insertError.code === "42703") {
      await writeLegacyPayload();
      return;
    }
    throw insertError;
  }
};

const parseBudgetRange = (value) => {
  const cleaned = value.replace(/[^0-9-]/g, "");
  const [min, max] = cleaned.split("-").map((part) => Number(part.trim()));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
};

const createSolidBannerDataUrl = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 540"><rect width="1200" height="540" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const uploadFile = async (file, path) => {
  const extension = file.type.split("/")[1] || "jpg";
  const finalPath = `${path}.${extension}`;
  let uploadError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await supabase.storage.from("provider-media").upload(finalPath, file, {
      upsert: true,
      contentType: file.type,
    });
    uploadError = error || null;
    if (!uploadError) break;
  }
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("provider-media").getPublicUrl(finalPath);
  return { url: data?.publicUrl || null, storagePath: finalPath };
};

const updatePreview = () => {
  const provider = state.provider;
  if (!provider) {
    if (providerNameHeaderEl) providerNameHeaderEl.textContent = "Business Profile";
    if (previewEl) {
      previewEl.innerHTML = `<p class='muted'>${labelProfile.noProfileFound || "No provider profile found."}</p>`;
    }
    return;
  }

  const metadataAvatar = state.user?.user_metadata?.provider_avatar_url || "";
  const metadataBanner = state.user?.user_metadata?.provider_banner_url || "";
  const bannerSrc = provider.banner_url || provider.hero_url || metadataBanner || "../assets/nlinkblack.png";
  const avatarSrc = provider.avatar_url || metadataAvatar || "../assets/nlinkiconblk.png";
  if (providerNameHeaderEl) providerNameHeaderEl.textContent = provider.name || (labelCommon.unavailable || "Not provided");
  if (providerAvatarHeaderEl) providerAvatarHeaderEl.src = avatarSrc;
  if (fbCoverEl) {
    fbCoverEl.style.backgroundImage = `linear-gradient(180deg, rgba(15,23,42,0.25), rgba(15,23,42,0.55)), url('${bannerSrc}')`;
    fbCoverEl.style.backgroundSize = "cover";
    fbCoverEl.style.backgroundPosition = "center";
  }

  if (previewEl) {
    previewEl.innerHTML = `
      <article class="card preview-card-inner">
        <img src="${avatarSrc}" alt="${provider.name || "Logo"}" />
        <div class="card-content">
          <div class="meta-row">
            <h2 class="card-title" style="margin:0;">${provider.name || (labelCommon.unavailable || "Not provided")}</h2>
            <span class="badge">Preview</span>
          </div>
          <div class="card-meta">
            ${state.meta.tagline ? `<div class="meta-row"><span>${state.meta.tagline}</span></div>` : ""}
            <div class="meta-row">
              <span class="meta-pill">${provider.category || (labelCommon.unavailable || "Not provided")}</span>
              <span class="rating">${
                state.metrics.ratingAverage > 0
                  ? `${renderStars(state.metrics.ratingAverage)} ${state.metrics.ratingAverage.toFixed(1)}`
                  : (labelRating.unrated || "Unrated")
              }</span>
            </div>
            <div class="meta-row">
              <span>Budget: $${provider.budget_min || 0} - $${provider.budget_max || 0}</span>
              <span>${provider.location || (labelCommon.notSet || "Not set")}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }
  renderReadinessUi();
};

const renderGallery = () => {
  if (!galleryGrid || !galleryEmpty) return;
  galleryGrid.innerHTML = "";
  if (state.gallery.length === 0) {
    galleryEmpty.hidden = false;
    return;
  }
  galleryEmpty.hidden = true;

  state.gallery.forEach((photo) => {
    const card = document.createElement("div");
    card.className = "gallery-card";
    card.innerHTML = `
      <img src="${photo.url}" alt="Gallery photo" />
      <button class="ghost-button" type="button" data-id="${photo.id}">Remove</button>
    `;
    card.querySelector("button").addEventListener("click", () => deletePhoto(photo));
    galleryGrid.appendChild(card);
  });
  renderReadinessUi();
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const fileToBlob = async (file, crop) => {
  if (!crop) return file;
  return crop.blob || file;
};

const openCropEditor = async ({ file, aspectRatio = 1, circle = false, title = "Crop Image", outputWidth = 1200 }) => {
  const source = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-card cropper-card">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="ghost-button" type="button" data-action="cancel">Cancel</button>
        </div>
        <p class="muted">Drag image to position and use zoom to fit the frame.</p>
        <div class="cropper-frame ${circle ? "cropper-avatar" : ""}" id="inline-cropper-frame" style="${circle ? "border-radius:50%;" : ""}">
          <img id="inline-cropper-image" alt="Crop preview" src="${source}" />
          <div class="cropper-guides" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
        <label class="cropper-zoom">
          Zoom
          <input type="range" id="inline-cropper-zoom" min="0.4" max="4" step="0.01" value="1" />
        </label>
        <div class="cta-row">
          <button class="ghost-button" type="button" data-action="skip">Use Original</button>
          <button class="primary-button" type="button" data-action="save">Save Crop</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const frame = modal.querySelector("#inline-cropper-frame");
    const image = modal.querySelector("#inline-cropper-image");
    const zoom = modal.querySelector("#inline-cropper-zoom");
    if (frame && aspectRatio && !circle) {
      frame.style.aspectRatio = `${aspectRatio}`;
      frame.style.height = "auto";
    }

    const stateCrop = { x: 0, y: 0, scale: 1, minScale: 0.4, maxScale: 4 };
    const getFrameMetrics = () => {
      const frameRect = frame.getBoundingClientRect();
      const frameW = frameRect.width || 1;
      const frameH = frameRect.height || 1;
      const naturalW = image.naturalWidth || 1;
      const naturalH = image.naturalHeight || 1;
      const imageRatio = naturalW / naturalH;
      const frameRatio = frameW / frameH;
      let baseW = frameW;
      let baseH = frameH;
      if (imageRatio > frameRatio) {
        baseW = frameH * imageRatio;
        baseH = frameH;
      } else {
        baseW = frameW;
        baseH = frameW / imageRatio;
      }
      return { frameW, frameH, naturalW, naturalH, baseW, baseH };
    };
    const clampPan = () => {
      const { frameW, frameH, baseW, baseH } = getFrameMetrics();
      const drawW = baseW * stateCrop.scale;
      const drawH = baseH * stateCrop.scale;
      const maxX = Math.max(0, (drawW - frameW) / 2);
      const maxY = Math.max(0, (drawH - frameH) / 2);
      stateCrop.x = Math.max(-maxX, Math.min(maxX, stateCrop.x));
      stateCrop.y = Math.max(-maxY, Math.min(maxY, stateCrop.y));
    };
    const applyTransform = () => {
      clampPan();
      image.style.transform = `translate(${stateCrop.x}px, ${stateCrop.y}px) scale(${stateCrop.scale})`;
    };

    let dragging = false;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    frame.addEventListener("pointerdown", (event) => {
      dragging = true;
      sx = event.clientX;
      sy = event.clientY;
      ox = stateCrop.x;
      oy = stateCrop.y;
      frame.setPointerCapture(event.pointerId);
    });
    frame.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      stateCrop.x = ox + (event.clientX - sx);
      stateCrop.y = oy + (event.clientY - sy);
      applyTransform();
    });
    const stopDrag = (event) => {
      dragging = false;
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    };
    frame.addEventListener("pointerup", stopDrag);
    frame.addEventListener("pointercancel", stopDrag);

    zoom.addEventListener("input", () => {
      stateCrop.scale = Number(zoom.value);
      applyTransform();
    });

    const initializeScaleBounds = () => {
      const { frameW, frameH, baseW, baseH } = getFrameMetrics();
      const containScale = Math.min(frameW / baseW, frameH / baseH);
      stateCrop.minScale = Math.max(0.25, containScale);
      stateCrop.maxScale = 4;
      zoom.min = String(stateCrop.minScale);
      zoom.max = String(stateCrop.maxScale);
      stateCrop.scale = Math.max(stateCrop.minScale, 1);
      zoom.value = String(stateCrop.scale);
      stateCrop.x = 0;
      stateCrop.y = 0;
      applyTransform();
    };
    if (image.complete) {
      initializeScaleBounds();
    } else {
      image.addEventListener("load", initializeScaleBounds, { once: true });
    }
    window.addEventListener("resize", initializeScaleBounds);

    const closeWith = (value) => {
      window.removeEventListener("resize", initializeScaleBounds);
      modal.remove();
      resolve(value);
    };

    modal.querySelector("[data-action='cancel']").addEventListener("click", () => closeWith(null));
    modal.querySelector("[data-action='skip']").addEventListener("click", () => closeWith({ blob: file, previewDataUrl: source }));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeWith(null);
    });

    modal.querySelector("[data-action='save']").addEventListener("click", async () => {
      const { naturalW, naturalH, frameW, frameH, baseW, baseH } = getFrameMetrics();

      const drawW = baseW * stateCrop.scale;
      const drawH = baseH * stateCrop.scale;
      const offsetX = (frameW - drawW) / 2 + stateCrop.x;
      const offsetY = (frameH - drawH) / 2 + stateCrop.y;

      const sxPx = Math.max(0, -offsetX * (naturalW / drawW));
      const syPx = Math.max(0, -offsetY * (naturalH / drawH));
      const swPx = Math.min(naturalW - sxPx, frameW * (naturalW / drawW));
      const shPx = Math.min(naturalH - syPx, frameH * (naturalH / drawH));

      const outW = outputWidth;
      const outH = Math.round(outputWidth / aspectRatio);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(image, sxPx, syPx, swPx, shPx, 0, 0, outW, outH);

      const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/jpeg", 0.9));
      closeWith({ blob, previewDataUrl: canvas.toDataURL("image/jpeg", 0.9) });
    });
  });
};

const deletePhoto = async (photo) => {
  try {
    if (!state.user) throw new Error("Sign in required.");

    await supabase.storage.from("provider-media").remove([photo.storage_path]);
    await supabase.from("provider_photos").delete().eq("id", photo.id);
    state.gallery = state.gallery.filter((item) => item.id !== photo.id);
    renderGallery();
  } catch (error) {
    setStatus(getErrorText(error, "Could not remove photo."), "error");
  }
};

const loadProvider = async () => {
  const preferredId = state.provider?.id || localStorage.getItem(primaryProviderKey);
  if (preferredId) {
    const { data: preferred, error: preferredError } = await supabase
      .from("providers")
      .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
      .eq("id", preferredId)
      .eq("owner_id", state.user.id)
      .maybeSingle();
    if (preferredError) throw preferredError;
    if (preferred) return preferred;
  }

  const { data, error } = await supabase
    .from("providers")
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
    .eq("owner_id", state.user.id)
    .limit(25);

  if (error) throw error;
  return pickBestProviderRecord(data);
};

const reloadProviderById = async (providerId) => {
  if (!providerId) return;
  const { data, error } = await supabase
    .from("providers")
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  if (data) state.provider = data;
};

const reloadProviderFromServer = async () => {
  if (!state.user) return;
  if (state.provider?.id) {
    await reloadProviderById(state.provider.id);
    if (state.provider?.id) {
      localStorage.setItem(primaryProviderKey, state.provider.id);
      return;
    }
  }
  const latest = await loadProvider();
  if (latest) {
    state.provider = latest;
    localStorage.setItem(primaryProviderKey, latest.id);
  }
};

const loadGallery = async (providerId) => {
  const { data, error } = await supabase
    .from("provider_photos")
    .select("id,url,storage_path,created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

const createProvider = async (payload) => {
  const { data: existingRows, error: existingError } = await supabase
    .from("providers")
    .select("id")
    .eq("owner_id", state.user.id)
    .limit(1);
  if (existingError) throw existingError;
  const existingId = existingRows?.[0]?.id;
  if (existingId) {
    const { data: updated, error: updateError } = await supabase
      .from("providers")
      .update(payload)
      .eq("id", existingId)
      .eq("owner_id", state.user.id)
      .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url")
      .single();
    if (updateError) throw updateError;
    localStorage.setItem(primaryProviderKey, updated.id);
    return updated;
  }

  const providerId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("providers")
    .insert({
      id: providerId,
      owner_id: state.user.id,
      ...payload,
      hero_url: null,
      banner_url: null,
      avatar_url: null,
    })
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url")
    .single();
  if (error) throw error;
  localStorage.setItem(primaryProviderKey, data.id);
  return data;
};

const renderFullProfileMarkup = () => {
  const provider = state.provider;
  if (!provider) {
    return `<p class='muted'>${labelProfile.noProfile || "No profile data yet."}</p>`;
  }

  const ratingValue = state.metrics.ratingAverage > 0
    ? `${renderStars(state.metrics.ratingAverage)} ${state.metrics.ratingAverage.toFixed(1)}`
    : (labelRating.unrated || "Unrated");
  const reviewCount = state.metrics.reviewCount || 0;
  const photoItems = state.gallery.slice(0, 6).map((photo) => `
    <img src="${photo.url}" alt="Business photo" style="width:100%;height:110px;object-fit:cover;border-radius:10px;" />
  `).join("");

  const services = state.meta.services?.length
    ? state.meta.services
    : (provider.category ? [`${provider.category} Services`] : ["Professional Services"]);
  const availabilityLine = state.meta.availabilityDays
    ? `${state.meta.availabilityDays}${state.meta.availabilityStart || state.meta.availabilityEnd ? ` (${state.meta.availabilityStart || "--:--"}-${state.meta.availabilityEnd || "--:--"})` : ""}`
    : (state.meta.availability || (labelCommon.notSet || "Not set"));
  const socialLinks = [
    { key: "instagram", label: "Instagram", url: state.meta.socialInstagram, icon: "IG" },
    { key: "facebook", label: "Facebook", url: state.meta.socialFacebook, icon: "FB" },
    { key: "linkedin", label: "LinkedIn", url: state.meta.socialLinkedin, icon: "IN" },
    { key: "tiktok", label: "TikTok", url: state.meta.socialTiktok, icon: "TT" },
  ].filter((item) => item.url);

  const metadataAvatar = state.user?.user_metadata?.provider_avatar_url || "";
  const metadataBanner = state.user?.user_metadata?.provider_banner_url || "";
  return `
    <div class="profile-banner-wrap">
      <div class="profile-banner">
        <img src="${provider.banner_url || provider.hero_url || metadataBanner || "../assets/nlinkblack.png"}" alt="${provider.name || "Business"} banner" />
        <div class="profile-banner-overlay"></div>
      </div>
      <div class="profile-avatar">
        <img src="${provider.avatar_url || metadataAvatar || "../assets/nlinkiconblk.png"}" alt="${provider.name || "Business"} logo" />
      </div>
    </div>
    <div class="card-content full-profile">
      <div class="profile-header">
        <div class="profile-title">
          <div class="meta-row">
            <h2 class="card-title">${provider.name || "Business Name"}</h2>
          </div>
          ${state.meta.tagline ? `<p class="profile-sub">${state.meta.tagline}</p>` : ""}
        </div>
        <div class="profile-meta-row">
          <div class="profile-meta-left">
            <p class="profile-sub">${provider.category || (labelCommon.unavailable || "Not provided")} • ${provider.location || (labelCommon.notSet || "Not set")}</p>
            <div class="rating-line">
              <span class="rating">${ratingValue}</span>
              <span>${reviewCount} reviews</span>
            </div>
          </div>
          <button class="ghost-button" type="button" id="full-profile-photos">${labelActions.viewPhotos || "View More Photos"}</button>
        </div>
      </div>
      <p>${provider.description || (labelProfile.noDescription || "No business description added yet.")}</p>
      <div class="tag-list">
        ${services.map((service) => `<span class="tag">${service}</span>`).join("")}
      </div>
      <div class="pricing">
        <h4>${labelPricing.title || "Pricing"}</h4>
        <p><strong>Range:</strong> $${provider.budget_min || 0} - $${provider.budget_max || 0}</p>
        <p>${state.meta.pricingDetails || labelPricing.details || "Request a quote for final pricing."}</p>
      </div>
      <div class="contact-block">
        <p><strong>Availability:</strong> ${availabilityLine}</p>
        <p><strong>Service Area:</strong> ${
          state.meta.serviceAreaZip
            ? `${state.meta.serviceAreaZip}${state.meta.serviceRadiusMiles ? ` • ${state.meta.serviceRadiusMiles} miles` : ""}`
            : (labelCommon.notSet || "Not set")
        }</p>
        <p><strong>Location:</strong> ${provider.location || (labelCommon.notSet || "Not set")}</p>
        <p><strong>Address:</strong> ${state.meta.address || (labelCommon.notSet || "Not set")}</p>
        <p><strong>Phone:</strong> ${state.meta.phone || (labelCommon.notSet || "Not set")}</p>
        <p><strong>Email:</strong> ${state.user?.email || (labelCommon.notSet || "Not set")}</p>
        ${state.meta.website ? `<p><strong>Website:</strong> ${state.meta.website}</p>` : ""}
      </div>
      ${socialLinks.length ? `
        <div class="social-links-row">
          ${socialLinks.map((item) => `
            <a href="${item.url}" target="_blank" rel="noreferrer" class="social-link-pill">
              <span class="social-icon">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `).join("")}
        </div>
      ` : ""}
      <div class="cta-row">
        <button type="button">${labelActions.book || "Book"}</button>
        <button type="button">${labelActions.contact || "Contact"}</button>
        <button type="button">${labelActions.directions || "Directions"}</button>
        <button type="button">${labelActions.leaveReview || "Leave Review"}</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px;">
        ${photoItems || `<span class='muted'>${labelProfile.noGallery || "No gallery photos yet."}</span>`}
      </div>
    </div>
  `;
};

const openProfileGalleryModal = async () => {
  if (state.provider?.id) {
    const { data, error } = await supabase
      .from("provider_photos")
      .select("id,url,storage_path,created_at")
      .eq("provider_id", state.provider.id)
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      state.gallery = data;
      renderGallery();
    }
  }
  const existing = document.getElementById("provider-gallery-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "provider-gallery-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${state.provider?.name || "Business"} Photos</h3>
        <button class="ghost-button" type="button" id="close-provider-gallery">Close</button>
      </div>
      <div class="gallery-grid">
        ${state.gallery.length
          ? state.gallery.map((photo) => `<img src="${photo.url}" alt="Business photo" style="width:100%;height:140px;object-fit:cover;border-radius:12px;" />`).join("")
          : `<p class="muted">${labelProfile.noGallery || "No gallery photos yet."}</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#close-provider-gallery")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
};

const openFullProfileModal = () => {
  const existing = document.getElementById("full-profile-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "full-profile-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Full Profile Preview</h3>
        <button class="ghost-button" type="button" id="close-full-profile">Close</button>
      </div>
      ${renderFullProfileMarkup()}
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#close-full-profile")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector("#full-profile-photos")?.addEventListener("click", () => {
    openProfileGalleryModal();
  });
  modal.querySelectorAll(".cta-row button").forEach((button) => {
    button.addEventListener("click", () => {
      setStatus(labelBeta.action || "This action is coming soon in beta.", "info");
    });
  });
};

const renderCardPreviewMarkup = () => {
  const provider = state.provider;
  if (!provider) return `<p class="muted">${labelProfile.noProfile || "No profile data yet."}</p>`;
  const metadataAvatar = state.user?.user_metadata?.provider_avatar_url || "";
  const avatarSrc = provider.avatar_url || metadataAvatar || "../assets/nlinkiconblk.png";
  const ratingText = state.metrics.ratingAverage > 0 ? `★ ${state.metrics.ratingAverage.toFixed(1)}` : "★ New";
  return `
    <article class="card preview-card-inner">
      <img src="${avatarSrc}" alt="${provider.name || "Business"} logo" />
      <div class="card-content compact-card">
        <div class="meta-row">
          <h3 class="card-title compact-title">${provider.name || (labelCommon.unavailable || "Not provided")}</h3>
          <span class="badge">Preview</span>
        </div>
        <p class="compact-description">${(provider.description || labelProfile.noDescription || "No business description added yet.").slice(0, 88)}</p>
        <div class="profile-stats compact-stats">
          <span>${ratingText}</span>
          <span>${provider.location || (labelCommon.notSet || "Not set")}</span>
          <span class="meta-pill">${provider.category || (labelCommon.unavailable || "Not provided")}</span>
        </div>
      </div>
    </article>
  `;
};

const openCardPreviewModal = () => {
  const existing = document.getElementById("card-preview-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "card-preview-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Profile Card Preview</h3>
        <button class="ghost-button" type="button" id="close-card-preview">Close</button>
      </div>
      ${renderCardPreviewMarkup()}
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#close-card-preview")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
};

const getProviderPayloadFromForm = () => {
  if (!nameInput || !categoryInput || !locationInput || !budgetInput || !descriptionInput) return null;
  const budgetRange = parseBudgetRange(budgetInput.value.trim());
  if (!budgetRange) return null;
  return {
    name: nameInput.value.trim(),
    category: categoryInput.value.trim(),
    location: locationInput.value.trim(),
    budget_min: budgetRange.min,
    budget_max: budgetRange.max,
    description: descriptionInput.value.trim(),
  };
};

const ensureProviderExistsForUpload = async () => {
  if (!state.user) return;
  if (state.provider?.id) return;
  const payload = getProviderPayloadFromForm();
  if (!payload) {
    throw new Error("Save profile details first (name, category, location, budget) before uploading images.");
  }
  state.provider = await createProvider(payload);
};

const init = async () => {
  if (!clientReady) {
    setStatus("Supabase is not configured. Provider profile editing is disabled.", "error");
    return;
  }

  const session = await supabase.auth.getSession();
  const user = session.data?.session?.user;
  if (!user) {
    setStatus("Sign in required.", "error");
    return;
  }

  state.user = user;
  const initialMetadataStatus = getListingStatusFromMetadata();
  const initialGlobalStatus = getGlobalListingStatus();
  state.meta.listingStatus = pickPreferredListingStatus(
    state.meta.listingStatus,
    initialMetadataStatus,
    initialGlobalStatus,
  ) || "draft";
  setStatus("Loading your profile...", "info");

  try {
    const provider = await loadProvider();
    let resolvedProvider = provider;
    if (!resolvedProvider) {
      if (isEditPage) {
        state.provider = {
          id: null,
          name: "",
          category: "",
          location: "",
          budget_min: 0,
          budget_max: 0,
          description: "",
          hero_url: null,
          banner_url: null,
          avatar_url: null,
        };
        state.meta = loadLocalProviderMeta() || state.meta;
        if (!state.meta.listingStatus) state.meta.listingStatus = "draft";
        applyMetaToInputs();
        updatePreview();
        updateMetricsUi();
        renderReadinessUi();
        setStatus("No profile yet. Fill details and save to create your provider card.", "info");
      } else if (previewEl) {
        previewEl.innerHTML = `<p class='muted'>${labelProfile.createFirst || "No provider profile yet. Use Edit to create your first profile card."}</p>`;
      }
      return;
    }

    state.provider = resolvedProvider;
    localStorage.setItem(primaryProviderKey, resolvedProvider.id);
    if (nameInput) nameInput.value = resolvedProvider.name || "";
    if (categoryInput) categoryInput.value = resolvedProvider.category || "";
    if (locationInput) locationInput.value = resolvedProvider.location || "";
    if (budgetInput) budgetInput.value = `${resolvedProvider.budget_min || 0}-${resolvedProvider.budget_max || 0}`;
    if (descriptionInput) descriptionInput.value = resolvedProvider.description || "";
    await loadProviderMetaFromBackend();
    const localStatus = getLocalListingStatus(resolvedProvider.id);
    state.meta.listingStatus = pickPreferredListingStatus(
      state.meta.listingStatus,
      localStatus,
      getGlobalListingStatus(),
      getListingStatusFromMetadata(),
    ) || "draft";
    await loadProviderMetrics();
    applyMetaToInputs();
    updatePreview();

    if (galleryGrid && galleryEmpty) {
      state.gallery = await loadGallery(resolvedProvider.id);
      renderGallery();
    }
    renderReadinessUi();
    setStatus("Profile loaded.", "success");
  } catch (error) {
    setStatus(getErrorText(error, "Could not load profile."), "error");
  }
};

const updateStateFromForm = () => {
  if (!state.provider || !nameInput || !categoryInput || !locationInput || !descriptionInput) return;
  syncMetaFromInputs();
  state.provider = {
    ...state.provider,
    name: nameInput.value.trim(),
    category: categoryInput.value.trim(),
    location: locationInput.value.trim(),
    description: descriptionInput.value.trim(),
  };
  updatePreview();
};

form?.addEventListener("input", updateStateFromForm);

const saveProfile = async ({ desiredStatus = null, redirectAfterSave = false } = {}) => {
  if (!state.provider || !nameInput || !categoryInput || !locationInput || !budgetInput || !descriptionInput) return false;
  const payload = getProviderPayloadFromForm();
  if (!payload) {
    setStatus("Add a budget range like 80-400.", "error");
    return false;
  }

  try {
    if (!state.user) {
      setStatus("Sign in required.", "error");
      return false;
    }
    syncMetaFromInputs();
    const readiness = getReadinessChecklist();
    state.readiness = readiness;

    const persistedStatus = await getPersistedListingStatus();
    if (desiredStatus === "published" && readiness.missing.length > 0) {
      renderReadinessUi();
      setStatus("Complete all required items before publishing.", "error");
      return false;
    }

    if (desiredStatus) {
      state.meta.listingStatus = desiredStatus;
    } else if (persistedStatus) {
      state.meta.listingStatus = persistedStatus;
    } else if (!state.meta.listingStatus) {
      state.meta.listingStatus = "draft";
    }
    if (state.meta.listingStatus) {
      saveGlobalListingStatus(state.meta.listingStatus);
    }
    if (state.provider?.id && state.meta.listingStatus) {
      saveLocalListingStatus(state.provider.id, state.meta.listingStatus);
    }
    state.meta.profileCompletion = readiness.completion;

    setStatus("Saving profile...", "info");
    const hasProviderId = Boolean(state.provider.id);
    const providerNeedsWrite = !hasProviderId
      || (state.provider.name || "") !== payload.name
      || (state.provider.category || "") !== payload.category
      || (state.provider.location || "") !== payload.location
      || Number(state.provider.budget_min || 0) !== Number(payload.budget_min || 0)
      || Number(state.provider.budget_max || 0) !== Number(payload.budget_max || 0)
      || (state.provider.description || "") !== payload.description;

    if (!hasProviderId) {
      state.provider = await createProvider(payload);
      localStorage.setItem(primaryProviderKey, state.provider.id);
    } else if (providerNeedsWrite) {
      await updateProviderRow(payload);
    }
    await reloadProviderFromServer();
    await saveProviderMetaToBackend();
    await persistListingStatusToMetadata(state.meta.listingStatus);
    updatePreview();
    setStatus(
      desiredStatus === "published"
        ? "Profile published."
        : desiredStatus === "paused"
          ? "Profile paused."
          : "Profile saved.",
      "success",
    );

    if (redirectAfterSave && isEditPage) {
      window.setTimeout(() => {
        window.location.href = "../provider/dashboard.html";
      }, 650);
    }
    return true;
  } catch (error) {
    setStatus(getErrorText(error, "Could not save profile."), "error");
    return false;
  }
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile({ desiredStatus: null, redirectAfterSave: true });
});

const handleImageUpload = async (file, type) => {
  if (!state.provider || !file) return;
  if (!isValidImageUpload(file)) {
    setStatus(`Upload a valid image (JPG/PNG/WEBP/HEIC) up to ${MAX_UPLOAD_SIZE_MB}MB.`, "error");
    return;
  }
  try {
    setStatus(`Uploading ${type}...`, "info");
    const updateField = type === "banner" ? "banner_url" : "avatar_url";
    const cropConfig = type === "banner"
      ? { aspectRatio: 1200 / 540, circle: false, title: "Crop Banner Image", outputWidth: 1200 }
      : { aspectRatio: 1, circle: true, title: "Crop Logo Image", outputWidth: 700 };
    const crop = await openCropEditor({ file, ...cropConfig });
    if (!crop) {
      setStatus("Upload cancelled.", "info");
      return;
    }

    // Optimistic preview so edits are immediately visible.
    state.provider[updateField] = crop.previewDataUrl;
    if (type === "banner") state.provider.hero_url = crop.previewDataUrl;
    updatePreview();

    if (!state.user) throw new Error("Sign in required.");
    await ensureProviderExistsForUpload();
    const path = `providers/${state.user.id}/${state.provider.id}/${type}-${Date.now()}`;
    const blobToUpload = await fileToBlob(file, crop);
    const { url } = await uploadFile(blobToUpload, path);
    if (!url) throw new Error("Upload failed.");

    state.provider[updateField] = url;
    if (type === "banner") {
      state.provider.hero_url = url;
    }
    updatePreview();

    const imageUpdatePayload = type === "banner"
      ? { banner_url: url, hero_url: url }
      : { avatar_url: url };
    await updateProviderRow(imageUpdatePayload);
    updatePreview();
    if (type === "banner" && bannerUploadName) bannerUploadName.textContent = `Uploaded: ${file.name}`;
    if (type === "avatar" && avatarUploadName) avatarUploadName.textContent = `Uploaded: ${file.name}`;
    setStatus(`${type === "banner" ? "Banner" : "Logo"} updated.`, "success");
  } catch (error) {
    setStatus(`Upload failed: ${getErrorText(error, "Check storage bucket and policies.")}`, "error");
  }
};

const applyPresetBannerColor = async (color, triggerButton) => {
  if (!color) return;
  try {
    if (!state.user) throw new Error("Sign in required.");
    await ensureProviderExistsForUpload();
    const bannerDataUrl = createSolidBannerDataUrl(color);
    state.provider.banner_url = bannerDataUrl;
    state.provider.hero_url = bannerDataUrl;
    updatePreview();
    await updateProviderRow({ banner_url: bannerDataUrl, hero_url: bannerDataUrl });
    updatePreview();
    if (bannerPresets) {
      bannerPresets.querySelectorAll(".color-swatch").forEach((el) => el.classList.remove("selected"));
      if (triggerButton) triggerButton.classList.add("selected");
    }
    setStatus("Preset banner applied.", "success");
  } catch (error) {
    setStatus(getErrorText(error, "Could not apply preset banner."), "error");
  }
};

bannerUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    if (bannerUploadName) bannerUploadName.textContent = `Selected: ${file.name}`;
    handleImageUpload(file, "banner");
  }
  event.target.value = "";
});

avatarUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    if (avatarUploadName) avatarUploadName.textContent = `Selected: ${file.name}`;
    handleImageUpload(file, "avatar");
  }
  event.target.value = "";
});

bannerPresets?.querySelectorAll("[data-banner-color]").forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.bannerColor;
    applyPresetBannerColor(color, button);
  });
});

galleryUpload?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;
  const invalid = files.find((file) => !isValidImageUpload(file));
  if (invalid) {
    setStatus(`"${invalid.name}" is not valid. Use JPG/PNG/WEBP/HEIC up to ${MAX_UPLOAD_SIZE_MB}MB.`, "error");
    event.target.value = "";
    return;
  }

  try {
    setStatus("Uploading gallery photos...", "info");
    if (!state.user) throw new Error("Sign in required.");
    await ensureProviderExistsForUpload();

    if (!state.provider?.id) {
      setStatus("Save profile details first, then upload gallery photos.", "error");
      return;
    }

    for (const file of files) {
      const crop = await openCropEditor({
        file,
        aspectRatio: 4 / 3,
        circle: false,
        title: "Crop Gallery Photo",
        outputWidth: 1100,
      });
      if (!crop) continue;
      const photoId = crypto.randomUUID();
      const path = `providers/${state.user.id}/${state.provider.id}/gallery/${photoId}`;
      const blobToUpload = await fileToBlob(file, crop);
      const { url, storagePath } = await uploadFile(blobToUpload, path);
      if (!url) continue;

      const { error } = await supabase
        .from("provider_photos")
        .insert({
          id: photoId,
          provider_id: state.provider.id,
          url,
          storage_path: storagePath,
        });
      if (error) throw error;

      state.gallery.unshift({ id: photoId, url, storage_path: storagePath });
    }

    renderGallery();
    setStatus("Gallery updated.", "success");
  } catch (error) {
    setStatus(getErrorText(error, "Gallery upload failed."), "error");
  } finally {
    event.target.value = "";
  }
});

init();

fullProfileButton?.addEventListener("click", () => {
  if (isEditPage) {
    openCardPreviewModal();
  } else {
    openFullProfileModal();
  }
});

saveDraftButton?.addEventListener("click", async () => {
  await saveProfile({ desiredStatus: "draft", redirectAfterSave: false });
});

publishProfileButton?.addEventListener("click", async () => {
  await saveProfile({ desiredStatus: "published", redirectAfterSave: false });
});

pauseProfileButton?.addEventListener("click", async () => {
  await saveProfile({ desiredStatus: "paused", redirectAfterSave: false });
});
