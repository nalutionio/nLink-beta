/*
  PlugFeed app controller
  - Handles swipe feed, filters, saved persistence, and profile modal.
*/

const storageKey = "nlink_saved";
const supabase = typeof window.getNlinkSupabaseClient === "function" ? window.getNlinkSupabaseClient() : null;
const GUEST_SWIPE_LIMIT = 5;
const labels = window.NLINK_UI_LABELS || {};
const labelCommon = labels.common || {};
const labelRating = labels.rating || {};
const labelProfile = labels.profile || {};
const labelPricing = labels.pricing || {};
const labelActions = labels.actions || {};
const clientLoginUrl = "/shared/login-client.html";
const clientSignupUrl = "/shared/signup-client.html";
let providerReviewsTableAvailable = true;
let providerProfilesLifecycleAvailable = true;
let providerEventsTableAvailable = true;

const getRolesFromMetadata = (metadata) => {
  const roles = [];
  if (Array.isArray(metadata?.roles)) {
    metadata.roles.forEach((role) => {
      if (typeof role === "string" && role) roles.push(role);
    });
  }
  if (typeof metadata?.role === "string" && metadata.role) roles.push(metadata.role);
  if (!roles.length) roles.push("client");
  return Array.from(new Set(roles));
};

const getSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch (error) {
    return [];
  }
};

const setSaved = (saved) => {
  localStorage.setItem(storageKey, JSON.stringify(saved));
};
const normalizeTag = (value) => (
  window.NLINK_SERVICE_TAGS?.normalizeTag
    ? window.NLINK_SERVICE_TAGS.normalizeTag(value)
    : String(value || "").trim().toLowerCase()
);
const toCanonicalService = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalService
    ? window.NLINK_SERVICE_TAGS.toCanonicalService(value)
    : String(value || "").trim()
);
const toCanonicalTag = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalTag
    ? window.NLINK_SERVICE_TAGS.toCanonicalTag(value)
    : String(value || "").trim()
);
const toCanonicalCategory = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalCategory
    ? window.NLINK_SERVICE_TAGS.toCanonicalCategory(value)
    : String(value || "").trim()
);
const toCanonicalDiscoveryTerm = (value) => (
  window.NLINK_SERVICE_TAGS?.toCanonicalDiscoveryTerm
    ? window.NLINK_SERVICE_TAGS.toCanonicalDiscoveryTerm(value)
    : String(value || "").trim()
);
const inferCategoryForService = (service) => (
  window.NLINK_SERVICE_TAGS?.inferCategoryForService
    ? window.NLINK_SERVICE_TAGS.inferCategoryForService(service)
    : ""
);
const getServicesForCategory = (category) => (
  window.NLINK_SERVICE_TAGS?.getServicesForCategory
    ? window.NLINK_SERVICE_TAGS.getServicesForCategory(category)
    : []
);
const getTagsForService = (service) => (
  window.NLINK_SERVICE_TAGS?.getTagsForService
    ? window.NLINK_SERVICE_TAGS.getTagsForService(service)
    : []
);
const normalizeLocationValue = (value) => (
  window.NLINK_SERVICE_TAGS?.normalizeLocation
    ? window.NLINK_SERVICE_TAGS.normalizeLocation(value)
    : String(value || "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim()
);

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const isTransportError = (error) => {
  const message = String(error?.message || error || "");
  return (Number(error?.status) || 0) === 0
    || /failed to fetch/i.test(message)
    || /network/i.test(message);
};

const closeGuestGateModal = () => {
  document.getElementById("guest-gate-modal")?.remove();
};

const closePhotoGalleryModal = () => {
  document.getElementById("photo-gallery-modal")?.remove();
};

const closeReviewsModal = () => {
  document.getElementById("provider-reviews-modal")?.remove();
};

const openClientDirectMessage = (provider) => {
  if (!provider?.id) return;
  const params = new URLSearchParams();
  params.set("provider", provider.id);
  if (provider.name) params.set("providerName", provider.name);
  const avatar = provider.avatarImage || provider.avatar || provider.avatar_url || "";
  if (avatar) params.set("providerAvatar", avatar);
  window.location.href = `../client/client-messages.html?${params.toString()}`;
};

const fetchProviderPhotos = async (providerId) => {
  if (!supabase || !providerId) return { photos: [], error: null };
  const { data, error } = await supabase
    .from("provider_photos")
    .select("url,created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return { photos: [], error };
  return { photos: data.map((row) => ({ url: row.url })), error: null };
};

const openProviderReviewsModal = (provider) => {
  if (!provider) return;
  closeReviewsModal();
  const reviews = Array.isArray(provider.reviews) ? provider.reviews : [];
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "provider-reviews-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Reviews • ${provider.name || "Plug"}</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <p class="muted">${reviews.length ? `${(Number(provider.rating) || 0).toFixed(1)} stars • ${reviews.length} reviews` : "No reviews yet."}</p>
      <div class="comments-list">
        ${reviews.length
          ? reviews.map((review) => `
              <article class="review-card">
                <strong>${review.name || "Neighbor"}</strong>
                <div>${"★".repeat(Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0))))}</div>
                <p>${review.text || "No written feedback."}</p>
              </article>
            `).join("")
          : `<p class="muted">${labelRating.noReviews || "No reviews yet."}</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeReviewsModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeReviewsModal();
  });
};

const hydrateSavedProviders = async (savedProviders) => {
  if (!supabase || !Array.isArray(savedProviders) || savedProviders.length === 0) return savedProviders;
  const ids = Array.from(new Set(savedProviders.map((item) => item.id).filter(Boolean)));
  if (!ids.length) return savedProviders;

  const { data: providerRows, error: providerError } = await supabase
    .from("providers")
    .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url")
    .in("id", ids);
  if (providerError || !Array.isArray(providerRows)) return savedProviders;

  const profilesByProviderId = {};
  const photosByProviderId = {};
  const { data: profileRows } = await supabase
    .from("provider_profiles")
    .select("provider_id,tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok,listing_status,profile_completion")
    .in("provider_id", ids);
  if (Array.isArray(profileRows)) {
    profileRows.forEach((row) => {
      profilesByProviderId[row.provider_id] = normalizeProfileMeta(row);
    });
  }

  const { data: photoRows } = await supabase
    .from("provider_photos")
    .select("provider_id,url,created_at")
    .in("provider_id", ids)
    .order("created_at", { ascending: false });
  if (Array.isArray(photoRows)) {
    photoRows.forEach((row) => {
      if (!photosByProviderId[row.provider_id]) photosByProviderId[row.provider_id] = [];
      photosByProviderId[row.provider_id].push({ url: row.url });
    });
  }

  const byId = {};
  providerRows.forEach((row) => {
    const meta = profilesByProviderId[row.id] || normalizeProfileMeta(null);
    byId[row.id] = {
      ...meta,
      id: row.id,
      name: row.name || "",
      category: toCanonicalService(row.category || ""),
      budgetMin: row.budget_min ?? 0,
      budgetMax: row.budget_max ?? 0,
      location: normalizeLocationValue(row.location) || "Unknown",
      zip: meta.serviceAreaZip || "",
      rating: 0,
      reviewCount: 0,
      heroImage: row.hero_url || "../assets/plugFeedlogo-rmbg.png",
      bannerImage: row.banner_url || row.hero_url || "../assets/plugFeedlogo-rmbg.png",
      avatar: row.avatar_url || row.hero_url || "../assets/plugprofilepic.png",
      description: row.description || "",
      services: meta.services || [],
      availability: meta.availability || "",
      availabilityDays: meta.availabilityDays || "",
      availabilityStart: meta.availabilityStart || "",
      availabilityEnd: meta.availabilityEnd || "",
      serviceAreaZip: meta.serviceAreaZip || "",
      serviceRadiusMiles: meta.serviceRadiusMiles || "",
      pricing: {
        model: labelPricing.quote || "Custom quote",
        startingAt: row.budget_min ?? 0,
        details: labelPricing.details || "Request a quote for final pricing.",
      },
      pricingDetails: meta.pricingDetails || "",
      address: meta.address || "",
      directionsUrl: "",
      contact: {
        phone: meta.phone || "",
        email: "",
      },
      website: meta.website || "",
      socialInstagram: meta.socialInstagram || "",
      socialFacebook: meta.socialFacebook || "",
      socialLinkedin: meta.socialLinkedin || "",
      socialTiktok: meta.socialTiktok || "",
      listingStatus: meta.listingStatus || "published",
      profileCompletion: Number(meta.profileCompletion || 0),
      reviews: [],
      galleryPhotos: photosByProviderId[row.id] || [],
      monetization: {
        sponsored: false,
        featured: false,
        tier: "basic",
        payPerLead: false,
      },
    };
  });

  return savedProviders.map((item) => byId[item.id] || item);
};

const isMissingColumnError = (error) => (
  Boolean(error)
  && (
    error.code === "42703"
    || error.code === "PGRST204"
  )
);

const logProviderEvent = async (providerId, eventType) => {
  if (!supabase || !providerEventsTableAvailable || !providerId || !eventType) return;
  const allowedEventTypes = new Set(["profile_view", "save_click", "contact_click", "booking_click"]);
  if (!allowedEventTypes.has(String(eventType || "").trim())) return;
  try {
    const user = await getSessionUser();
    const { error } = await supabase
      .from("provider_events")
      .insert({
        provider_id: providerId,
        event_type: eventType,
        actor_user_id: user?.id || null,
      });
    if (error && (
      error.code === "42P01"
      || error.code === "PGRST205"
      || error.status === 404
      || error.status === 400
      || error.code === "23514"
    )) {
      providerEventsTableAvailable = false;
    }
  } catch (_error) {
    providerEventsTableAvailable = false;
  }
};

const openPhotoGalleryModal = async (provider) => {
  closePhotoGalleryModal();
  const { photos: livePhotos, error: liveError } = await fetchProviderPhotos(provider?.id);
  const photos = livePhotos.length ? livePhotos : (Array.isArray(provider?.galleryPhotos) ? provider.galleryPhotos : []);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "photo-gallery-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${provider?.name || "Business"} Photos</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <div class="gallery-grid">
        ${photos.length
          ? photos.map((photo) => `<img class="gallery-photo-frame" src="${photo.url}" alt="${provider?.name || "Business"} photo" />`).join("")
          : `<p class="muted">${
            liveError
              ? `Could not load photos (${liveError.message || "read blocked"})`
              : (labelProfile.noGallery || "No gallery photos yet.")
          }</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closePhotoGalleryModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePhotoGalleryModal();
  });
};

const openGuestGateModal = (contextText = "continue") => {
  closeGuestGateModal();
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "guest-gate-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Continue as Neighbor</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <p class="muted">Create a Neighbor account or log in to ${contextText}.</p>
      <div class="cta-row">
        <a class="primary-button auth-link-button" href="${clientSignupUrl}">Create Neighbor Account</a>
        <a class="ghost-button auth-link-button" href="${clientLoginUrl}">Log In</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeGuestGateModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeGuestGateModal();
  });
};

const normalizeProfileMeta = (row) => ({
  tagline: row?.tagline || "",
  services: Array.isArray(row?.services) ? row.services : [],
  availability: row?.availability || "",
  availabilityDays: row?.availability_days || row?.availabilityDays || "",
  availabilityStart: row?.availability_start || row?.availabilityStart || "",
  availabilityEnd: row?.availability_end || row?.availabilityEnd || "",
  serviceAreaZip: row?.service_area_zip || row?.serviceAreaZip || "",
  serviceRadiusMiles: row?.service_radius_miles || row?.serviceRadiusMiles || "",
  address: row?.address || "",
  phone: row?.phone || "",
  website: row?.website || "",
  pricingDetails: row?.pricing_details || row?.pricingDetails || "",
  socialInstagram: row?.social_instagram || row?.socialInstagram || "",
  socialFacebook: row?.social_facebook || row?.socialFacebook || "",
  socialLinkedin: row?.social_linkedin || row?.socialLinkedin || "",
  socialTiktok: row?.social_tiktok || row?.socialTiktok || "",
  listingStatus: row?.listing_status || row?.listingStatus || "published",
  profileCompletion: Number(row?.profile_completion ?? row?.profileCompletion ?? 0) || 0,
});

const formatBudget = (provider) => {
  const min = Number(provider.budgetMin);
  const max = Number(provider.budgetMax);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return labelCommon.notSet || "Not set";
  if (!Number.isFinite(min)) return `$${max}`;
  if (!Number.isFinite(max)) return `$${min}`;
  return `$${min} - $${max}`;
};
const formatRatingLabel = (provider) => (
  provider.rating && provider.rating > 0
    ? `${renderStars(provider.rating)} ${provider.rating}`
    : (labelRating.unrated || "Unrated")
);

const getDisplayImages = (provider) => {
  const cropped = typeof getCroppedImages === "function" ? getCroppedImages(provider.id) : null;
  return {
    banner: cropped?.banner || provider.bannerImage || provider.heroImage || "../assets/plugFeedlogo-rmbg.png",
    avatar: cropped?.avatar || provider.avatar || provider.heroImage || "../assets/plugprofilepic.png",
    hero: provider.heroImage || "../assets/plugFeedlogo-rmbg.png",
  };
};

const getCardPhotos = (provider) => {
  const images = getDisplayImages(provider);
  const gallery = Array.isArray(provider?.galleryPhotos) ? provider.galleryPhotos.map((item) => item.url).filter(Boolean) : [];
  return Array.from(new Set([images.avatar, ...gallery].filter(Boolean))).slice(0, 4);
};

const renderPhotoProgress = (count, activeIndex) => (
  Array.from({ length: count })
    .map((_, index) => `<span class="photo-dot ${index === activeIndex ? "active" : ""}"></span>`)
    .join("")
);

const getSocialLinks = (provider) => ([
  { label: "Instagram", url: provider.socialInstagram, icon: "IG" },
  { label: "Facebook", url: provider.socialFacebook, icon: "FB" },
  { label: "LinkedIn", url: provider.socialLinkedin, icon: "IN" },
  { label: "TikTok", url: provider.socialTiktok, icon: "TT" },
].filter((item) => item.url));

const formatAvailability = (provider) => {
  if (provider.availabilityDays) {
    const timePart = (provider.availabilityStart || provider.availabilityEnd)
      ? ` (${provider.availabilityStart || "--:--"}-${provider.availabilityEnd || "--:--"})`
      : "";
    return `${provider.availabilityDays}${timePart}`;
  }
  return provider.availability || (labelCommon.notSet || "Not set");
};

const getCapacityState = (provider) => {
  const raw = String(provider?.availability || "").toLowerCase();
  if (raw.includes("booked")) return "booked";
  if (raw.includes("limited")) return "limited";
  if (raw.includes("accepting")) return "accepting";
  return "";
};

const getCapacityLabel = (provider) => {
  const state = getCapacityState(provider);
  if (state === "booked") return "Booked";
  if (state === "limited") return "Limited Capacity";
  if (state === "accepting") return "Accepting Jobs";
  return "";
};

const BOOKING_SERVICES = new Set(["barber", "hair stylist", "personal trainer"]);

const supportsScheduledBooking = (provider) => {
  const primary = toCanonicalService(provider?.category || "").toLowerCase();
  const serviceCategory = toCanonicalCategory(provider?.serviceCategory || "").toLowerCase();
  return BOOKING_SERVICES.has(primary) || serviceCategory === "personal services";
};

const getBookingButtonLabel = (provider) => (
  supportsScheduledBooking(provider) ? (labelActions.book || "Book") : "Get Quote"
);

const isProviderBookable = (provider) => getCapacityState(provider) !== "booked";

const formatServiceArea = (provider) => (
  provider.serviceAreaZip
    ? `${provider.serviceAreaZip}${provider.serviceRadiusMiles ? ` • ${provider.serviceRadiusMiles} miles` : ""}`
    : (labelCommon.notSet || "Not set")
);

const createCardMarkup = (provider, expanded = false) => {
  if (!expanded) {
    const images = getDisplayImages(provider);
    const photos = getCardPhotos(provider);
    const ratingText = provider.rating && provider.rating > 0
      ? `★ ${provider.rating}`
      : "★ New";
    const shortDescription = (provider.description || labelProfile.noDescription || "No business description added yet.")
      .slice(0, 88);
    const capacityLabel = getCapacityLabel(provider);
    return `
      <div class="card-photo-shell">
        <img class="card-photo-image" src="${photos[0] || images.avatar}" alt="${provider.name || "Plug"}" />
        <div class="card-photo-progress">${renderPhotoProgress(photos.length || 1, 0)}</div>
        <button class="card-photo-hit left" data-action="photo-prev" type="button" aria-label="Previous photo"></button>
        <button class="card-photo-hit right" data-action="photo-next" type="button" aria-label="Next photo"></button>
      </div>
      <div class="card-content compact-card">
        <div class="meta-row">
          <h3 class="card-title compact-title">${provider.name || (labelCommon.unavailable || "Not provided")}</h3>
          ${provider.monetization.featured ? '<span class="badge">Featured</span>' : ""}
        </div>
        <p class="compact-description">${shortDescription}</p>
        <div class="profile-stats compact-stats">
          <span>${ratingText}</span>
          <span>${provider.location || (labelCommon.notSet || "Not set")}</span>
          <span class="meta-pill">${provider.category || (labelCommon.unavailable || "Not provided")}</span>
          ${capacityLabel ? `<span class="meta-pill capacity-pill">${capacityLabel}</span>` : ""}
        </div>
        <div class="cta-row compact-actions">
          <button data-action="book">${getBookingButtonLabel(provider)}</button>
          <button data-action="profile">${labelActions.viewProfile || "View Profile"}</button>
        </div>
      </div>
    `;
  }

  const images = getDisplayImages(provider);
  const socialLinks = getSocialLinks(provider);
  const capacityLabel = getCapacityLabel(provider);

  return `
    <div class="profile-banner-wrap">
      <div class="profile-banner">
        <img src="${images.banner}" alt="${provider.name}" />
        <div class="profile-banner-overlay"></div>
      </div>
      <div class="profile-avatar">
        <img src="${images.avatar}" alt="${provider.name} profile" />
      </div>
    </div>
    <div class="card-content full-profile">
      <div class="profile-header">
        <div class="profile-title">
          <div class="meta-row">
            <h2 class="card-title">${provider.name || (labelCommon.unavailable || "Not provided")}</h2>
            ${provider.monetization.featured ? '<span class="badge">Featured</span>' : ""}
          </div>
        </div>
        <div class="profile-meta-row">
          <div class="profile-meta-left">
            <p class="profile-sub">${provider.category || (labelCommon.unavailable || "Not provided")} • ${provider.location || (labelCommon.notSet || "Not set")}</p>
            <div class="rating-line">
              <span class="rating">${formatRatingLabel(provider)}</span>
              <span>${provider.reviewCount || 0} reviews</span>
            </div>
            ${capacityLabel ? `<p class="muted"><strong>Capacity:</strong> ${capacityLabel}</p>` : ""}
          </div>
          <button class="ghost-button" data-action="photos">${labelActions.viewPhotos || "View More Photos"}</button>
        </div>
      </div>
      <p>${provider.description || (labelProfile.noDescription || "No business description added yet.")}</p>
      <div class="tag-list">
        ${(provider.services?.length ? provider.services : [labelProfile.noServices || "No services listed yet."]).map((service) => `<span class="tag">${service}</span>`).join("")}
      </div>
      <div class="pricing">
        <h4>${labelPricing.title || "Pricing"}</h4>
        <p><strong>${provider.pricing.model || (labelPricing.quote || "Custom quote")}</strong> • Starting at $${provider.pricing.startingAt}</p>
        <p>${provider.pricingDetails || provider.pricing.details || (labelPricing.details || "Request a quote for final pricing.")}</p>
      </div>
      <div class="contact-block">
        <p><strong>Availability:</strong> ${formatAvailability(provider)}</p>
        <p><strong>Service Area:</strong> ${formatServiceArea(provider)}</p>
        <p><strong>Address:</strong> ${provider.address || (labelCommon.notSet || "Not set")}</p>
        <p><strong>Phone:</strong> ${provider.contact.phone || (labelCommon.notSet || "Not set")}</p>
        <p><strong>Email:</strong> ${provider.contact.email || (labelCommon.notSet || "Not set")}</p>
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
      ${renderReviewList(provider)}
      <div class="cta-row">
        <button data-action="book">${getBookingButtonLabel(provider)}</button>
        <button data-action="contact">${labelActions.contact || "Contact"}</button>
        ${provider.directionsUrl ? `<a href="${provider.directionsUrl}" target="_blank" rel="noreferrer">${labelActions.directions || "Directions"}</a>` : ""}
        <button data-action="review">${labelActions.leaveReview || "Leave Review"}</button>
      </div>
    </div>
  `;
};

const createSavedMarkup = (provider) => `
  <div class="card-photo-shell">
    <img class="card-photo-image" src="${getCardPhotos(provider)[0] || getDisplayImages(provider).avatar}" alt="${provider.name || "Plug"}" />
    <div class="card-photo-progress">${renderPhotoProgress(getCardPhotos(provider).length || 1, 0)}</div>
    <button class="card-photo-hit left" data-action="photo-prev" type="button" aria-label="Previous photo"></button>
    <button class="card-photo-hit right" data-action="photo-next" type="button" aria-label="Next photo"></button>
  </div>
  <div class="card-content compact-card">
    <div class="meta-row">
      <h3 class="card-title compact-title">${provider.name || (labelCommon.unavailable || "Not provided")}</h3>
      ${provider.monetization.featured ? '<span class="badge">Featured</span>' : ""}
    </div>
    <p class="compact-description">${
      (provider.description || labelProfile.noDescription || "No business description added yet.").slice(0, 88)
    }</p>
    <div class="profile-stats compact-stats">
      <span>${provider.rating && provider.rating > 0 ? `★ ${provider.rating}` : "★ New"}</span>
      <span>${provider.location || (labelCommon.notSet || "Not set")}</span>
      <span class="meta-pill">${provider.category || (labelCommon.unavailable || "Not provided")}</span>
    </div>
    <div class="cta-row compact-actions">
      <button data-action="profile">${labelActions.viewProfile || "View Profile"}</button>
      <button data-action="remove">${labelActions.remove || "Remove"}</button>
    </div>
  </div>
`;

const attachCardPhotoBrowser = (card, provider) => {
  const shell = card.querySelector(".card-photo-shell");
  const image = card.querySelector(".card-photo-image");
  const progress = card.querySelector(".card-photo-progress");
  const prevButton = card.querySelector("[data-action='photo-prev']");
  const nextButton = card.querySelector("[data-action='photo-next']");
  if (!shell || !image || !progress || !prevButton || !nextButton) return;

  const photos = getCardPhotos(provider);
  if (photos.length <= 1) {
    prevButton.hidden = true;
    nextButton.hidden = true;
    progress.innerHTML = "";
    return;
  }

  let index = 0;
  const renderPhoto = () => {
    image.src = photos[index];
    progress.innerHTML = renderPhotoProgress(photos.length, index);
  };
  const move = (delta) => {
    index = (index + delta + photos.length) % photos.length;
    renderPhoto();
  };

  [prevButton, nextButton].forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      move(button === nextButton ? 1 : -1);
    });
  });

  renderPhoto();
};

const openProfileModal = (provider, options = {}) => {
  const isGuest = Boolean(options.isGuest);
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  const images = getDisplayImages(provider);
  const socialLinks = getSocialLinks(provider);

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${provider.name}</h3>
        <button class="ghost-button" data-action="close">${labelActions.close || "Close"}</button>
      </div>
      <div class="profile-banner-wrap">
        <div class="profile-banner">
          <img src="${images.banner}" alt="${provider.name}" />
          <div class="profile-banner-overlay"></div>
        </div>
        <div class="profile-avatar">
          <img src="${images.avatar}" alt="${provider.name} profile" />
        </div>
      </div>
      <div class="card-content full-profile">
        <div class="profile-header">
          <div class="profile-title">
            <div class="meta-row">
              <h2 class="card-title">${provider.name || (labelCommon.unavailable || "Not provided")}</h2>
              ${provider.monetization.featured ? '<span class="badge">Featured</span>' : ""}
            </div>
          </div>
          <div class="profile-meta-row">
            <div class="profile-meta-left">
              <p class="profile-sub">${provider.category || (labelCommon.unavailable || "Not provided")} • ${provider.location || (labelCommon.notSet || "Not set")}</p>
              <div class="rating-line">
                <span class="rating">${formatRatingLabel(provider)}</span>
                <span>${provider.reviewCount || 0} reviews</span>
              </div>
            </div>
            <button class="ghost-button" data-action="photos">${labelActions.viewPhotos || "View More Photos"}</button>
          </div>
        </div>
        <p>${provider.description || (labelProfile.noDescription || "No business description added yet.")}</p>
        <div class="tag-list">
          ${(provider.services?.length ? provider.services : [labelProfile.noServices || "No services listed yet."]).map((service) => `<span class="tag">${service}</span>`).join("")}
        </div>
        <div class="pricing">
          <h4>${labelPricing.title || "Pricing"}</h4>
          <p><strong>${provider.pricing.model || (labelPricing.quote || "Custom quote")}</strong> • Starting at $${provider.pricing.startingAt}</p>
          <p>${provider.pricingDetails || provider.pricing.details || (labelPricing.details || "Request a quote for final pricing.")}</p>
        </div>
        <div class="contact-block">
          <p><strong>Availability:</strong> ${formatAvailability(provider)}</p>
          <p><strong>Service Area:</strong> ${formatServiceArea(provider)}</p>
          <p><strong>Address:</strong> ${provider.address || (labelCommon.notSet || "Not set")}</p>
          <p><strong>Phone:</strong> ${provider.contact.phone || (labelCommon.notSet || "Not set")}</p>
          <p><strong>Email:</strong> ${provider.contact.email || (labelCommon.notSet || "Not set")}</p>
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
        ${renderReviewList(provider)}
        <div class="cta-row">
          <button data-action="book" ${isProviderBookable(provider) ? "" : "disabled"}>${isProviderBookable(provider) ? getBookingButtonLabel(provider) : "Booked"}</button>
          <button data-action="contact">${labelActions.contact || "Contact"}</button>
          ${provider.directionsUrl ? `<a href="${provider.directionsUrl}" target="_blank" rel="noreferrer">${labelActions.directions || "Directions"}</a>` : ""}
          <button data-action="review">${labelActions.leaveReview || "Leave Review"}</button>
        </div>
      </div>
    </div>
  `;

  modal.setAttribute("aria-hidden", "false");
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeProfileModal();
  }, { once: true });

  modal.querySelector("[data-action='close']").addEventListener("click", closeProfileModal);
  logProviderEvent(provider?.id, "profile_view");
  modal.querySelectorAll("[data-action='book'], [data-action='contact'], [data-action='review']")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (isGuest) {
          openGuestGateModal("contact providers or book services");
          return;
        }
        const action = button.getAttribute("data-action");
        if (action === "book") {
          if (!isProviderBookable(provider)) {
            alert("This Plug is currently booked. You can still save the profile or send a message.");
            return;
          }
          logProviderEvent(provider?.id, "booking_click");
          openDirectRequestModal(provider);
          return;
        }
        if (action === "contact") {
          logProviderEvent(provider?.id, "contact_click");
          openClientDirectMessage(provider);
          return;
        }
        if (action === "review") {
          openProviderReviewsModal(provider);
        }
      });
    });
  modal.querySelector("[data-action='photos']")?.addEventListener("click", () => {
    if (isGuest) {
      openGuestGateModal("view more photos");
      return;
    }
    openPhotoGalleryModal(provider);
  });
};

const closeProfileModal = () => {
  const modal = document.getElementById("profile-modal");
  if (modal) modal.setAttribute("aria-hidden", "true");
};

const closeDirectRequestModal = () => {
  document.getElementById("direct-request-modal")?.remove();
};

let targetProviderColumnAvailable = null;

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

const toPublicLocation = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
};

const getClientSnapshotForRequest = async (user) => {
  const fallbackAvatar = "../assets/neighborpp.png";
  const meta = user?.user_metadata || {};
  let profile = null;
  if (supabase && user?.id) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    profile = data || null;
  }
  return {
    client_name: profile?.full_name || meta.client_name || user?.email?.split("@")[0] || "Neighbor",
    client_avatar_url: profile?.avatar_url || meta.client_avatar_url || fallbackAvatar,
    client_location_public: toPublicLocation(profile?.location || profile?.address || meta.client_location || ""),
    client_email_verified: Boolean(profile?.email_verified ?? meta.client_email_verified ?? user?.email_confirmed_at),
    location_hint: normalizeLocationValue(profile?.location || profile?.address || meta.client_location || ""),
  };
};

const openDirectRequestModal = (provider) => {
  if (!provider?.id) return;
  closeDirectRequestModal();
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "direct-request-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Quick Request</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <p class="muted">Send a request directly to ${provider.name || "this Plug"} in under 20 seconds.</p>
      <div class="modal-form">
        <label class="input-field">
          <span>Service Need</span>
          <input id="quick-request-title" maxlength="80" value="${(provider.category || "Service request").replace(/"/g, "&quot;")}" />
        </label>
        <label class="input-field">
          <span>Budget Range</span>
          <select id="quick-request-budget">
            <option value="100-300">$100 - $300</option>
            <option value="300-600" selected>$300 - $600</option>
            <option value="600-1200">$600 - $1,200</option>
            <option value="1200-3000">$1,200 - $3,000</option>
            <option value="3000-10000">$3,000 - $10,000</option>
          </select>
        </label>
        <label class="input-field">
          <span>Needed By</span>
          <select id="quick-request-timeline">
            <option value="ASAP">ASAP</option>
            <option value="This week" selected>This week</option>
            <option value="Flexible">Flexible</option>
          </select>
        </label>
        <label class="input-field">
          <span>Note (optional)</span>
          <textarea id="quick-request-note" rows="3" maxlength="280" placeholder="Any quick details for the Plug..."></textarea>
        </label>
        <label class="check-row">
          <input id="quick-request-marketplace" type="checkbox" />
          <span>Also post to marketplace</span>
        </label>
      </div>
      <div class="auth-status" id="quick-request-status"></div>
      <div class="job-actions review-actions">
        <button class="primary-button" type="button" data-action="send">Send Request</button>
        <button class="ghost-button" type="button" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeDirectRequestModal();
  });
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeDirectRequestModal);
  modal.querySelector("[data-action='cancel']")?.addEventListener("click", closeDirectRequestModal);
  modal.querySelector("[data-action='send']")?.addEventListener("click", async () => {
    const sendButton = modal.querySelector("[data-action='send']");
    const statusEl = modal.querySelector("#quick-request-status");
    const setStatus = (text, type = "info") => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = `auth-status ${type}`.trim();
    };
    if (!supabase) {
      setStatus("Request service is unavailable right now.", "error");
      return;
    }
    const user = await getSessionUser();
    if (!user) {
      setStatus("Please log in again and retry.", "error");
      return;
    }
    const hasTargetProviderColumn = await checkTargetProviderColumn();
    if (!hasTargetProviderColumn) {
      setStatus("Direct requests are not enabled yet in database.", "error");
      return;
    }

    const titleInput = modal.querySelector("#quick-request-title");
    const budgetInput = modal.querySelector("#quick-request-budget");
    const timelineInput = modal.querySelector("#quick-request-timeline");
    const noteInput = modal.querySelector("#quick-request-note");
    const marketplaceInput = modal.querySelector("#quick-request-marketplace");
    const title = String(titleInput?.value || "").trim();
    const timeline = String(timelineInput?.value || "Flexible").trim();
    const note = String(noteInput?.value || "").trim();
    const alsoMarketplace = Boolean(marketplaceInput?.checked);
    const [budgetMinRaw, budgetMaxRaw] = String(budgetInput?.value || "300-600").split("-");
    const budgetMin = Number(budgetMinRaw) || 300;
    const budgetMax = Number(budgetMaxRaw) || 600;
    if (!title) {
      setStatus("Add a short service need title.", "error");
      return;
    }

    sendButton.disabled = true;
    setStatus("Sending request...", "info");
    try {
      const snapshot = await getClientSnapshotForRequest(user);
      const fallbackLocation = normalizeLocationValue(snapshot.location_hint || provider.location || "Nearby, NJ");
      const {
        location_hint: _locationHint,
        ...snapshotColumns
      } = snapshot;
      const basePayload = {
        client_id: user.id,
        title,
        category: provider.category || "General Service",
        description: note || `Quick request sent from Discover to ${provider.name || "Plug"}.`,
        budget_min: budgetMin,
        budget_max: budgetMax,
        timeline,
        location: fallbackLocation,
        status: "open",
        ...snapshotColumns,
      };

      const directPayload = { ...basePayload, target_provider_id: provider.id };
      const directInsert = await supabase
        .from("jobs")
        .insert(directPayload)
        .select("id")
        .single();
      if (directInsert.error || !directInsert.data?.id) {
        throw directInsert.error || new Error("Could not create direct request job.");
      }

      const directRequestInsert = await supabase
        .from("job_requests")
        .insert({
          job_id: directInsert.data.id,
          provider_id: provider.id,
          status: "requested",
          proposal_notes: note || "Direct request from Neighbor Discover quick flow.",
        });
      if (directRequestInsert.error) throw directRequestInsert.error;

      await logProviderEvent(provider.id, "direct_request_created");

      if (alsoMarketplace) {
        const publicInsert = await supabase
          .from("jobs")
          .insert(basePayload)
          .select("id")
          .single();
        if (publicInsert.error || !publicInsert.data?.id) {
          setStatus(`Direct request sent to ${provider.name || "Plug"}, but public post failed.`, "success");
          sendButton.textContent = "Sent";
          setTimeout(closeDirectRequestModal, 1200);
          return;
        }
      }

      setStatus(`Request sent to ${provider.name || "Plug"}.`, "success");
      sendButton.textContent = "Sent";
      setTimeout(closeDirectRequestModal, 1200);
    } catch (error) {
      setStatus(error?.message || "Could not send request right now.", "error");
      sendButton.disabled = false;
    }
  });
};

const isSwipePage = () => document.getElementById("card-stack");

const initSwipePage = () => {
  const discoverParams = new URLSearchParams(window.location.search);
  const focusProviderId = discoverParams.get("plug") || "";
  const cardStack = document.getElementById("card-stack");
  const emptyState = document.getElementById("empty-state");
  const passButton = document.getElementById("pass-button");
  const saveButton = document.getElementById("save-button");
  const applyFiltersButton = document.getElementById("apply-filters");
  const resetFiltersButton = document.getElementById("reset-filters");
  const topActionLink = document.querySelector(".app-header .ghost-button");

  const categorySelect = document.getElementById("category");
  const tagFilterSelect = document.getElementById("service-tags-filter");
  const plugSearchInput = document.getElementById("plug-search");
  const locationInput = document.getElementById("location-search");
  const locationOptions = document.getElementById("location-options");
  const budgetMinInput = document.getElementById("budget-min");
  const budgetMaxInput = document.getElementById("budget-max");
  const ratingMinSelect = document.getElementById("rating-min");
  const filtersPanel = document.getElementById("filters-panel");
  const discoverFilterToggle = document.getElementById("discover-filter-toggle");
  const discoverFiltersContent = document.getElementById("discover-filters-content");

  const state = {
    providers: [],
    filtered: [],
    currentIndex: 0,
    user: null,
    isGuest: true,
    swipesUsed: 0,
    focusProviderId,
    focusConsumed: false,
  };

  const setupGuestUi = () => {
    if (!topActionLink) return;
    if (state.isGuest) {
      topActionLink.textContent = "Log In";
      topActionLink.href = clientLoginUrl;
    } else {
      topActionLink.textContent = "Saved";
      topActionLink.href = "../client/saved.html";
    }
    renderGuestCounter();
  };

  const setDiscoverFiltersVisible = (isVisible) => {
    if (!discoverFilterToggle || !discoverFiltersContent) return;
    discoverFiltersContent.classList.toggle("hidden", !isVisible);
    discoverFilterToggle.textContent = isVisible ? "Hide" : "Show";
    discoverFilterToggle.setAttribute("aria-expanded", isVisible ? "true" : "false");
  };

  const initDiscoverFilterToggle = () => {
    if (!discoverFilterToggle || !discoverFiltersContent) return;
    const mobileDefaultClosed = window.matchMedia("(max-width: 900px)").matches;
    setDiscoverFiltersVisible(!mobileDefaultClosed);
    discoverFilterToggle.addEventListener("click", () => {
      const currentlyVisible = !discoverFiltersContent.classList.contains("hidden");
      setDiscoverFiltersVisible(!currentlyVisible);
    });
  };

  const renderGuestCounter = () => {
    const existing = document.getElementById("guest-swipe-counter");
    if (!state.isGuest) {
      existing?.remove();
      return;
    }
    const remaining = Math.max(0, GUEST_SWIPE_LIMIT - state.swipesUsed);
    const copy = remaining > 0
      ? `${remaining} guest swipe${remaining === 1 ? "" : "s"} left`
      : "Guest swipe limit reached";
    if (existing) {
      existing.textContent = copy;
      existing.classList.toggle("locked", remaining === 0);
      return;
    }
    if (!filtersPanel) return;
    const counter = document.createElement("p");
    counter.id = "guest-swipe-counter";
    counter.className = "guest-swipe-counter";
    counter.textContent = copy;
    if (remaining === 0) counter.classList.add("locked");
    filtersPanel.prepend(counter);
  };

  const isSwipeLocked = () => state.isGuest && state.swipesUsed >= GUEST_SWIPE_LIMIT;

  const requireClientAuth = (contextText) => {
    if (!state.isGuest) return false;
    openGuestGateModal(contextText);
    return true;
  };

  const buildOptions = (select, values) => {
    if (!select) return;
    const unique = Array.from(new Set(values)).sort();
    unique.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  };

  const getSelectedTagFilters = () => {
    if (!tagFilterSelect) return [];
    return Array.from(tagFilterSelect.selectedOptions)
      .map((option) => toCanonicalTag(option.value))
      .filter(Boolean);
  };

  const buildTagFilterOptions = (categoryValue = "all", keepSelected = true) => {
    if (!tagFilterSelect) return;
    const previous = keepSelected ? new Set(getSelectedTagFilters()) : new Set();
    const selectedCategory = categoryValue === "all" ? "" : toCanonicalCategory(categoryValue);
    let options = [];
    if (selectedCategory) {
      const services = getServicesForCategory(selectedCategory);
      options = services.flatMap((service) => getTagsForService(service)).map((tag) => toCanonicalTag(tag));
    } else {
      options = (window.NLINK_SERVICE_TAGS?.allTags || []).map((tag) => toCanonicalTag(tag));
    }
    const providerTagPool = state.providers
      .filter((provider) => !selectedCategory || inferCategoryForService(provider.category) === selectedCategory)
      .flatMap((provider) => (Array.isArray(provider.services) ? provider.services : []))
      .map((tag) => toCanonicalTag(tag));
    options = [...options, ...providerTagPool];
    const uniqueOptions = Array.from(new Set(options)).filter(Boolean).sort();
    tagFilterSelect.innerHTML = "";
    uniqueOptions.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      option.selected = previous.has(tag);
      tagFilterSelect.appendChild(option);
    });
    if (!uniqueOptions.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No tags available";
      option.disabled = true;
      option.selected = true;
      tagFilterSelect.appendChild(option);
    }
  };

  const buildLocationOptions = (values) => {
    if (!locationOptions) return;
    const normalized = values
      .map((value) => normalizeLocationValue(value))
      .filter(Boolean);
    const seen = new Set();
    const unique = normalized
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort();
    locationOptions.innerHTML = "";
    unique.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      locationOptions.appendChild(option);
    });
  };

  const refreshOptions = () => {
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="all">All</option>';
    }
    const canonicalCategories = window.NLINK_SERVICE_TAGS?.categories || [];
    const providerCategories = state.providers
      .map((p) => toCanonicalCategory(inferCategoryForService(p.category)))
      .filter(Boolean);
    const mergedCategories = [...canonicalCategories, ...providerCategories];
    buildOptions(categorySelect, mergedCategories);
    buildTagFilterOptions(categorySelect?.value || "all", false);
    buildLocationOptions([
      ...state.providers.map((p) => normalizeLocationValue(p.location)),
      ...state.providers.map((p) => p.zip).filter(Boolean),
      ...state.providers.map((p) => {
        const location = normalizeLocationValue(p.location);
        return location && p.zip ? `${location}, ${p.zip}` : "";
      }).filter(Boolean),
    ]);
  };

  const providerMatchesDiscoveryTerm = (providerCategory, selectedTerm) => {
    if (!selectedTerm || selectedTerm === "all") return true;
    const service = toCanonicalService(providerCategory);
    const selectedCategory = toCanonicalCategory(selectedTerm);
    if (selectedCategory && selectedCategory === selectedTerm) {
      return inferCategoryForService(service) === selectedCategory;
    }
    return normalizeTag(service) === normalizeTag(toCanonicalService(selectedTerm));
  };

  const extractState = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parts = raw.split(",").map((item) => item.trim()).filter(Boolean);
    const tail = parts[parts.length - 1] || raw;
    const stateToken = tail.match(/\b([A-Za-z]{2})\b/);
    return stateToken ? stateToken[1].toUpperCase() : "";
  };

  const extractZip = (value) => {
    const raw = String(value || "");
    const match = raw.match(/\b(\d{5})\b/);
    return match ? match[1] : "";
  };

  const matchesLocationStrict = (provider, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const providerLocation = String(provider.location || "").toLowerCase();
    const providerZip = String(provider.zip || "");
    return providerLocation.includes(q) || (providerZip && providerZip.includes(q));
  };

  const matchesLocationRelaxed = (provider, query) => {
    const q = String(query || "").trim();
    if (!q) return true;
    const queryState = extractState(q);
    const providerState = extractState(provider.location || "");
    const queryZip = extractZip(q);
    const providerZip = extractZip(provider.zip || provider.location || "");
    if (queryZip && providerZip) {
      return providerZip.slice(0, 3) === queryZip.slice(0, 3);
    }
    if (queryState && providerState) {
      return providerState === queryState;
    }
    return false;
  };

  const loadSupabaseProviders = async () => {
    if (!supabase) return [];
    let readClient = supabase;
    let { data, error } = await readClient
      .from("providers")
      .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at");
    if (error || !Array.isArray(data)) return [];

    const providerIds = data.map((item) => item.id).filter(Boolean);
    const profilesByProviderId = {};
    const photosByProviderId = {};
    if (providerIds.length > 0) {
      const lifecycleFields = "provider_id,tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok,listing_status,profile_completion";
      const baseFields = "provider_id,tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok";

      let profileQuery = await readClient
        .from("provider_profiles")
        .select(providerProfilesLifecycleAvailable ? lifecycleFields : baseFields)
        .in("provider_id", providerIds);
      let profileRows = profileQuery.data;
      let profileError = profileQuery.error;
      if (profileError && providerProfilesLifecycleAvailable && isMissingColumnError(profileError)) {
        providerProfilesLifecycleAvailable = false;
        profileQuery = await readClient
          .from("provider_profiles")
          .select(baseFields)
          .in("provider_id", providerIds);
        profileRows = profileQuery.data;
        profileError = profileQuery.error;
      }

      if (!profileError && Array.isArray(profileRows)) {
        profileRows.forEach((row) => {
          profilesByProviderId[row.provider_id] = normalizeProfileMeta(row);
        });
      }
    }

    if (providerIds.length > 0) {
      const { data: photoRows, error: photosError } = await readClient
        .from("provider_photos")
        .select("provider_id,url,created_at")
        .in("provider_id", providerIds)
        .order("created_at", { ascending: false });
      if (!photosError && Array.isArray(photoRows)) {
        photoRows.forEach((row) => {
          if (!photosByProviderId[row.provider_id]) photosByProviderId[row.provider_id] = [];
          photosByProviderId[row.provider_id].push({ url: row.url });
        });
      }
    }

    const reviewsByProviderId = {};
    if (providerIds.length > 0 && providerReviewsTableAvailable) {
      const { data: jobReviewRows, error: jobReviewError } = await readClient
        .from("job_reviews")
        .select("provider_id,rating,review_text,reviewer_role")
        .in("provider_id", providerIds)
        .eq("reviewee_role", "provider");
      if (!jobReviewError && Array.isArray(jobReviewRows)) {
        jobReviewRows.forEach((row) => {
          if (!reviewsByProviderId[row.provider_id]) reviewsByProviderId[row.provider_id] = [];
          reviewsByProviderId[row.provider_id].push({
            name: row.reviewer_role === "client" ? "Neighbor" : "Anonymous",
            rating: Number(row.rating) || 0,
            text: row.review_text || "",
          });
        });
      } else if (jobReviewError?.code === "42P01" || jobReviewError?.code === "PGRST205" || jobReviewError?.status === 404) {
        providerReviewsTableAvailable = false;
      }
    }

    const mappedProviders = data.map((item) => {
      const meta = profilesByProviderId[item.id] || normalizeProfileMeta(null);
      return {
      ...meta,
      id: item.id,
      name: item.name,
      category: toCanonicalService(item.category),
      budgetMin: item.budget_min ?? 0,
      budgetMax: item.budget_max ?? 0,
      location: normalizeLocationValue(item.location) || "Unknown",
      zip: meta.serviceAreaZip || "",
      rating: reviewsByProviderId[item.id]?.length
        ? Number((reviewsByProviderId[item.id].reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviewsByProviderId[item.id].length).toFixed(1))
        : 0,
      reviewCount: reviewsByProviderId[item.id]?.length || 0,
      heroImage: item.hero_url || "../assets/plugFeedlogo-rmbg.png",
      bannerImage: item.banner_url || item.hero_url || "../assets/plugFeedlogo-rmbg.png",
      avatar: item.avatar_url || item.hero_url || "../assets/plugprofilepic.png",
      description: item.description || "",
      services: meta.services || [],
      availability: meta.availability || "",
      availabilityDays: meta.availabilityDays || "",
      availabilityStart: meta.availabilityStart || "",
      availabilityEnd: meta.availabilityEnd || "",
      serviceAreaZip: meta.serviceAreaZip || "",
      serviceRadiusMiles: meta.serviceRadiusMiles || "",
      pricing: {
        model: labelPricing.quote || "Custom quote",
        startingAt: item.budget_min ?? 0,
        details: labelPricing.details || "Request a quote for final pricing.",
      },
      pricingDetails: meta.pricingDetails || "",
      address: meta.address || "",
      directionsUrl: "",
      contact: {
        phone: meta.phone || "",
        email: "",
      },
      website: meta.website || "",
      socialInstagram: meta.socialInstagram || "",
      socialFacebook: meta.socialFacebook || "",
      socialLinkedin: meta.socialLinkedin || "",
      socialTiktok: meta.socialTiktok || "",
      listingStatus: meta.listingStatus || "published",
      profileCompletion: Number(meta.profileCompletion || 0),
      reviews: reviewsByProviderId[item.id] || [],
      galleryPhotos: photosByProviderId[item.id] || [],
      monetization: {
        sponsored: false,
        featured: false,
        tier: "basic",
        payPerLead: false,
      },
    };
    });

    return mappedProviders.filter((provider) => provider.listingStatus === "published");
  };

  const applyFilters = ({ collapseOnMobile = false } = {}) => {
    const category = categorySelect.value;
    const selectedCategory = category === "all" ? "all" : toCanonicalDiscoveryTerm(category);
    const selectedTags = getSelectedTagFilters();
    const searchQuery = String(plugSearchInput?.value || "").trim().toLowerCase();
    const location = (locationInput?.value || "").trim().toLowerCase();
    const minBudget = Number(budgetMinInput.value) || 0;
    const maxBudget = Number(budgetMaxInput.value) || Number.POSITIVE_INFINITY;
    const minRating = Number(ratingMinSelect.value) || 0;

    const baseFiltered = state.providers.filter((provider) => {
      const matchesCategory = providerMatchesDiscoveryTerm(provider.category, selectedCategory);
      const providerTags = Array.isArray(provider.services)
        ? provider.services.map((tag) => toCanonicalTag(tag))
        : [];
      const searchable = [
        provider.name || "",
        provider.category || "",
        provider.location || "",
        provider.zip || "",
        ...providerTags,
      ].join(" ").toLowerCase();
      const matchesSearch = !searchQuery || searchable.includes(searchQuery);
      const matchesTags = selectedTags.length === 0
        || selectedTags.every((tag) => providerTags.includes(tag));
      const matchesBudget = provider.budgetMax >= minBudget && provider.budgetMin <= maxBudget;
      const matchesRating = provider.rating >= minRating;
      return matchesCategory && matchesSearch && matchesTags && matchesBudget && matchesRating;
    });
    const strictLocation = baseFiltered.filter((provider) => matchesLocationStrict(provider, location));
    state.filtered = strictLocation.length || !location
      ? strictLocation
      : baseFiltered.filter((provider) => matchesLocationRelaxed(provider, location));

    if (state.focusProviderId) {
      const focusedFromFiltered = state.filtered.find((provider) => provider.id === state.focusProviderId);
      if (focusedFromFiltered) {
        state.filtered = [focusedFromFiltered, ...state.filtered.filter((provider) => provider.id !== state.focusProviderId)];
      } else {
        const focusedFromAll = state.providers.find((provider) => provider.id === state.focusProviderId);
        if (focusedFromAll) {
          state.filtered = [focusedFromAll, ...state.filtered];
        }
      }
      if (!state.focusConsumed && state.filtered[0]?.id === state.focusProviderId) {
        state.focusConsumed = true;
      }
    }

    state.currentIndex = 0;
    renderStack();
    if (collapseOnMobile && window.matchMedia("(max-width: 900px)").matches) {
      setDiscoverFiltersVisible(false);
    }
  };

  const resetFilters = () => {
    if (plugSearchInput) plugSearchInput.value = "";
    if (categorySelect) categorySelect.value = "all";
    buildTagFilterOptions("all", false);
    if (tagFilterSelect) {
      Array.from(tagFilterSelect.options).forEach((option) => {
        option.selected = false;
      });
    }
    if (locationInput) locationInput.value = "";
    if (budgetMinInput) budgetMinInput.value = "";
    if (budgetMaxInput) budgetMaxInput.value = "";
    if (ratingMinSelect) ratingMinSelect.value = "0";
    applyFilters({ collapseOnMobile: true });
  };

  const renderStack = () => {
    renderGuestCounter();
    cardStack.innerHTML = "";
    emptyState.innerHTML = `
      <h2>No matches</h2>
      <p>Try widening your filters or resetting budget.</p>
    `;
    if (isSwipeLocked()) {
      emptyState.hidden = false;
      emptyState.innerHTML = `
        <h2>Guest limit reached</h2>
        <p>You have used ${GUEST_SWIPE_LIMIT} guest swipes. Create a Neighbor account to keep discovering providers.</p>
      `;
      return;
    }
    const isDesktop = window.matchMedia("(min-width: 960px)").matches;
    const remaining = isDesktop
      ? state.filtered.slice(state.currentIndex, state.currentIndex + 1)
      : state.filtered.slice(state.currentIndex, state.currentIndex + 2);

    if (state.filtered.length === 0 || remaining.length === 0) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    remaining.reverse().forEach((provider, index) => {
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.id = provider.id;
      card.innerHTML = createCardMarkup(provider, isDesktop);
      if (isDesktop) {
        card.classList.add("card-desktop");
      }
      if (!isDesktop) {
        attachCardPhotoBrowser(card, provider);
      }

      const profileButton = card.querySelector("button[data-action='profile']");
      profileButton?.addEventListener("pointerdown", (event) => event.stopPropagation());
      profileButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        openProfileModal(provider, { isGuest: state.isGuest });
      });

      const saveButton = card.querySelector("button[data-action='save']");
      saveButton?.addEventListener("pointerdown", (event) => event.stopPropagation());
      saveButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        saveProvider(provider);
      });

      const bookButton = card.querySelector("button[data-action='book']");
      bookButton?.addEventListener("pointerdown", (event) => event.stopPropagation());
      bookButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (requireClientAuth("book services")) return;
        if (!isProviderBookable(provider)) {
          alert("This Plug is currently booked. You can still open the full profile.");
          return;
        }
        logProviderEvent(provider?.id, "booking_click");
        openDirectRequestModal(provider);
      });

      card.querySelector("button[data-action='photos']")?.addEventListener("click", () => {
        if (requireClientAuth("view more photos")) return;
        openPhotoGalleryModal(provider);
      });

      card.querySelector("button[data-action='book']")?.addEventListener("click", () => {
        if (requireClientAuth("book services")) return;
        if (!isProviderBookable(provider)) {
          alert("This Plug is currently booked. You can still save the profile or send a message.");
          return;
        }
        logProviderEvent(provider?.id, "booking_click");
        openDirectRequestModal(provider);
      });

      card.querySelector("button[data-action='contact']")?.addEventListener("click", () => {
        if (requireClientAuth("contact providers")) return;
        logProviderEvent(provider?.id, "contact_click");
        openClientDirectMessage(provider);
      });

      card.querySelector("button[data-action='review']")?.addEventListener("click", () => {
        if (requireClientAuth("leave a review")) return;
        openProviderReviewsModal(provider);
      });

      if (!isDesktop) {
        if (index === remaining.length - 1) {
          attachSwipeHandlers(card, (direction) => swipeCard(card, direction));
        } else {
          card.style.transform = "scale(0.96) translateY(14px)";
        }
      }

      cardStack.appendChild(card);
    });
  };

  const swipeCard = (card, direction) => {
    if (isSwipeLocked()) {
      openGuestGateModal("keep swiping");
      return;
    }
    const travel = direction === "right" ? 600 : -600;
    card.style.transition = "transform 0.25s ease";
    card.style.transform = `translate(${travel}px, -40px) rotate(${direction === "right" ? 18 : -18}deg)`;

    const providerId = card.dataset.id;
    const provider = state.filtered.find((item) => item.id === providerId);

    if (direction === "right") {
      saveProvider(provider);
    }

    setTimeout(() => {
      state.swipesUsed += 1;
      state.currentIndex += 1;
      renderGuestCounter();
      if (isSwipeLocked()) {
        openGuestGateModal("keep swiping");
      }
      renderStack();
    }, 200);
  };

  const saveProvider = (provider) => {
    if (!provider) return;
    const saved = getSaved();
    if (saved.find((item) => item.id === provider.id)) return;
    saved.unshift(provider);
    setSaved(saved);
    logProviderEvent(provider.id, "save_click");
  };

  const swipeFallback = (direction) => {
    if (isSwipeLocked()) {
      openGuestGateModal("keep swiping");
      return;
    }
    const topCard = cardStack.querySelector(".card:last-child");
    if (!topCard) return;
    swipeCard(topCard, direction);
  };

  applyFiltersButton.addEventListener("click", () => applyFilters({ collapseOnMobile: true }));
  resetFiltersButton?.addEventListener("click", resetFilters);
  plugSearchInput?.addEventListener("input", applyFilters);
  categorySelect?.addEventListener("change", () => {
    buildTagFilterOptions(categorySelect.value || "all", true);
  });
  passButton.addEventListener("click", () => swipeFallback("left"));
  saveButton.addEventListener("click", () => swipeFallback("right"));

  const initData = async () => {
    initDiscoverFilterToggle();
    state.user = await getSessionUser();
    state.isGuest = !state.user;
    if (state.user) {
      const roles = getRolesFromMetadata(state.user.user_metadata);
      const clientOnboardingDone = state.user.user_metadata?.onboarding_client_complete === true;
      if (roles.includes("client") && !clientOnboardingDone) {
        window.location.href = "/client/onboarding.html";
        return;
      }
    }
    if (state.user) localStorage.setItem("nlink_last_role", "client");
    setupGuestUi();
    if (state.user && locationInput && !locationInput.value.trim()) {
      const profileLocation = window.NLINK_SERVICE_TAGS?.normalizeLocation
        ? window.NLINK_SERVICE_TAGS.normalizeLocation(state.user.user_metadata?.client_location || "")
        : String(state.user.user_metadata?.client_location || "").trim();
      if (profileLocation) {
        locationInput.value = profileLocation;
      }
    }
    const remoteProviders = await loadSupabaseProviders();
    state.providers = remoteProviders;
    refreshOptions();
    applyFilters();
  };

  initData();

  let lastIsDesktop = window.matchMedia("(min-width: 960px)").matches;
  window.addEventListener("resize", () => {
    const nowDesktop = window.matchMedia("(min-width: 960px)").matches;
    if (nowDesktop !== lastIsDesktop) {
      lastIsDesktop = nowDesktop;
      renderStack();
    }
  });

  window.addEventListener("nlink:images-updated", () => {
    renderStack();
  });
};

const initSavedPage = () => {
  const savedList = document.getElementById("saved-list");
  const savedEmpty = document.getElementById("saved-empty");
  if (!savedList) return;

  let renderVersion = 0;
  const renderSaved = async () => {
    const version = ++renderVersion;
    const saved = getSaved();
    const hydrated = await hydrateSavedProviders(saved);
    if (version !== renderVersion) return;
    if (Array.isArray(hydrated) && hydrated.length > 0) {
      setSaved(hydrated);
    }
    savedList.innerHTML = "";

    if (hydrated.length === 0) {
      savedEmpty.hidden = false;
      return;
    }

    savedEmpty.hidden = true;

    hydrated.forEach((provider) => {
      const card = document.createElement("article");
      card.className = "saved-card";
      card.innerHTML = createSavedMarkup(provider);
      attachCardPhotoBrowser(card, provider);

      card.querySelector("button[data-action='profile']").addEventListener("click", () => {
        openProfileModal(provider);
      });

      card.querySelector("button[data-action='remove']").addEventListener("click", () => {
        const filtered = getSaved().filter((item) => item.id !== provider.id);
        setSaved(filtered);
        renderSaved();
      });

      savedList.appendChild(card);
    });
  };

  const bootstrapSaved = async () => {
    const user = await getSessionUser();
    if (user) {
      const roles = getRolesFromMetadata(user.user_metadata);
      const clientOnboardingDone = user.user_metadata?.onboarding_client_complete === true;
      if (roles.includes("client") && !clientOnboardingDone) {
        window.location.href = "/client/onboarding.html";
        return;
      }
    }
    renderSaved();
  };

  bootstrapSaved();

  window.addEventListener("nlink:images-updated", () => {
    renderSaved();
  });
};

if (isSwipePage()) {
  initSwipePage();
} else {
  initSavedPage();
}
