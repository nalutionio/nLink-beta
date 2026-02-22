/*
  NLink app controller
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
const labelBeta = labels.beta || {};
const clientLoginUrl = "/shared/login-choice.html?preferred=client";
const clientSignupUrl = "/shared/signup-choice.html?preferred=client";
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

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const closeGuestGateModal = () => {
  document.getElementById("guest-gate-modal")?.remove();
};

const closePhotoGalleryModal = () => {
  document.getElementById("photo-gallery-modal")?.remove();
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
      category: row.category || "",
      budgetMin: row.budget_min ?? 0,
      budgetMax: row.budget_max ?? 0,
      location: row.location || "Unknown",
      zip: meta.serviceAreaZip || "",
      rating: 0,
      reviewCount: 0,
      heroImage: row.hero_url || "../assets/nlinkblack.png",
      bannerImage: row.banner_url || row.hero_url || "../assets/nlinkblack.png",
      avatar: row.avatar_url || row.hero_url || "../assets/nlinkiconblk.png",
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
  try {
    const user = await getSessionUser();
    const { error } = await supabase
      .from("provider_events")
      .insert({
        provider_id: providerId,
        event_type: eventType,
        actor_user_id: user?.id || null,
      });
    if (error && (error.code === "42P01" || error.code === "PGRST205" || error.status === 404)) {
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
        <h3>Continue as Client</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <p class="muted">Create a client account or log in to ${contextText}.</p>
      <div class="cta-row">
        <a class="primary-button auth-link-button" href="${clientSignupUrl}">Create Client Account</a>
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
    banner: cropped?.banner || provider.bannerImage || provider.heroImage || "../assets/nlinkblack.png",
    avatar: cropped?.avatar || provider.avatar || provider.heroImage || "../assets/nlinkiconblk.png",
    hero: provider.heroImage || "../assets/nlinkblack.png",
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
    return `
      <div class="card-photo-shell">
        <img class="card-photo-image" src="${photos[0] || images.avatar}" alt="${provider.name || "Provider"}" />
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
        </div>
        <div class="cta-row compact-actions">
          <button data-action="profile">${labelActions.viewProfile || "View Profile"}</button>
          <button data-action="save">⭐ ${labelActions.save || "Save"}</button>
        </div>
      </div>
    `;
  }

  const images = getDisplayImages(provider);
  const socialLinks = getSocialLinks(provider);

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
        <button data-action="book">${labelActions.book || "Book"}</button>
        <button data-action="contact">${labelActions.contact || "Contact"}</button>
        ${provider.directionsUrl ? `<a href="${provider.directionsUrl}" target="_blank" rel="noreferrer">${labelActions.directions || "Directions"}</a>` : ""}
        <button data-action="review">${labelActions.leaveReview || "Leave Review"}</button>
      </div>
    </div>
  `;
};

const createSavedMarkup = (provider) => `
  <div class="card-photo-shell">
    <img class="card-photo-image" src="${getCardPhotos(provider)[0] || getDisplayImages(provider).avatar}" alt="${provider.name || "Provider"}" />
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
          <button data-action="book">${labelActions.book || "Book"}</button>
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
        if (action === "book") logProviderEvent(provider?.id, "booking_click");
        if (action === "contact") logProviderEvent(provider?.id, "contact_click");
        alert(labelBeta.action || "This action is coming soon in beta.");
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

const isSwipePage = () => document.getElementById("card-stack");

const initSwipePage = () => {
  const cardStack = document.getElementById("card-stack");
  const emptyState = document.getElementById("empty-state");
  const passButton = document.getElementById("pass-button");
  const saveButton = document.getElementById("save-button");
  const applyFiltersButton = document.getElementById("apply-filters");
  const topActionLink = document.querySelector(".app-header .ghost-button");

  const categorySelect = document.getElementById("category");
  const locationInput = document.getElementById("location-search");
  const locationOptions = document.getElementById("location-options");
  const budgetMinInput = document.getElementById("budget-min");
  const budgetMaxInput = document.getElementById("budget-max");
  const ratingMinSelect = document.getElementById("rating-min");
  const filtersPanel = document.getElementById("filters-panel");

  const state = {
    providers: [],
    filtered: [],
    currentIndex: 0,
    user: null,
    isGuest: true,
    swipesUsed: 0,
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

  const buildLocationOptions = (values) => {
    if (!locationOptions) return;
    const unique = Array.from(new Set(values)).sort();
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
    const canonicalCategories = window.NLINK_SERVICE_TAGS?.allServiceTags || [];
    const providerCategories = state.providers.map((p) => p.category).filter(Boolean);
    const mergedCategories = [...canonicalCategories, ...providerCategories];
    buildOptions(categorySelect, mergedCategories);
    buildLocationOptions([
      ...state.providers.map((p) => p.location),
      ...state.providers.map((p) => p.zip).filter(Boolean),
      ...state.providers.map((p) => `${p.location}, ${p.zip}`).filter((value) => !value.endsWith(", undefined")),
    ]);
  };

  const loadSupabaseProviders = async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("providers")
      .select("id,name,category,location,budget_min,budget_max,description,hero_url,banner_url,avatar_url,created_at");
    if (error || !Array.isArray(data)) return [];

    const providerIds = data.map((item) => item.id).filter(Boolean);
    const profilesByProviderId = {};
    const photosByProviderId = {};
    if (providerIds.length > 0) {
      const lifecycleFields = "provider_id,tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok,listing_status,profile_completion";
      const baseFields = "provider_id,tagline,services,availability,availability_days,availability_start,availability_end,service_area_zip,service_radius_miles,address,phone,website,pricing_details,social_instagram,social_facebook,social_linkedin,social_tiktok";

      let profileQuery = await supabase
        .from("provider_profiles")
        .select(providerProfilesLifecycleAvailable ? lifecycleFields : baseFields)
        .in("provider_id", providerIds);
      let profileRows = profileQuery.data;
      let profileError = profileQuery.error;
      if (profileError && providerProfilesLifecycleAvailable && isMissingColumnError(profileError)) {
        providerProfilesLifecycleAvailable = false;
        profileQuery = await supabase
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
      const { data: photoRows, error: photosError } = await supabase
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
      const { data: reviewRows, error: reviewError } = await supabase
        .from("provider_reviews")
        .select("*")
        .in("provider_id", providerIds);
      if (!reviewError && Array.isArray(reviewRows) && reviewRows.length > 0) {
        reviewRows.forEach((row) => {
          if (!reviewsByProviderId[row.provider_id]) reviewsByProviderId[row.provider_id] = [];
          reviewsByProviderId[row.provider_id].push({
            name: row.reviewer_name || row.name || "Anonymous",
            rating: Number(row.rating) || 0,
            text: row.text || row.comment || row.body || "",
          });
        });
      } else {
        const fallbackToJobReviews = (
          !reviewError
          || reviewError?.code === "42P01"
          || reviewError?.code === "PGRST205"
          || reviewError?.status === 404
        );
        if (fallbackToJobReviews) {
          const { data: jobReviewRows, error: jobReviewError } = await supabase
            .from("job_reviews")
            .select("provider_id,rating,review_text,reviewer_role")
            .in("provider_id", providerIds)
            .eq("reviewee_role", "provider");
          if (!jobReviewError && Array.isArray(jobReviewRows)) {
            jobReviewRows.forEach((row) => {
              if (!reviewsByProviderId[row.provider_id]) reviewsByProviderId[row.provider_id] = [];
              reviewsByProviderId[row.provider_id].push({
                name: row.reviewer_role === "client" ? "Client" : "Anonymous",
                rating: Number(row.rating) || 0,
                text: row.review_text || "",
              });
            });
          } else if (jobReviewError?.code === "42P01" || jobReviewError?.code === "PGRST205" || jobReviewError?.status === 404) {
            providerReviewsTableAvailable = false;
          }
        }
      }
    }

    const mappedProviders = data.map((item) => {
      const meta = profilesByProviderId[item.id] || normalizeProfileMeta(null);
      return {
      ...meta,
      id: item.id,
      name: item.name,
      category: item.category,
      budgetMin: item.budget_min ?? 0,
      budgetMax: item.budget_max ?? 0,
      location: item.location || "Unknown",
      zip: meta.serviceAreaZip || "",
      rating: reviewsByProviderId[item.id]?.length
        ? Number((reviewsByProviderId[item.id].reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviewsByProviderId[item.id].length).toFixed(1))
        : 0,
      reviewCount: reviewsByProviderId[item.id]?.length || 0,
      heroImage: item.hero_url || "../assets/nlinkblack.png",
      bannerImage: item.banner_url || item.hero_url || "../assets/nlinkblack.png",
      avatar: item.avatar_url || item.hero_url || "../assets/nlinkiconblk.png",
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

  const applyFilters = () => {
    const category = categorySelect.value;
    const location = (locationInput?.value || "").trim().toLowerCase();
    const minBudget = Number(budgetMinInput.value) || 0;
    const maxBudget = Number(budgetMaxInput.value) || Number.POSITIVE_INFINITY;
    const minRating = Number(ratingMinSelect.value) || 0;

    state.filtered = state.providers.filter((provider) => {
      const matchesCategory = category === "all" || provider.category === category;
      const matchesLocation =
        !location ||
        provider.location.toLowerCase().includes(location) ||
        (provider.zip && provider.zip.includes(location));
      const matchesBudget = provider.budgetMax >= minBudget && provider.budgetMin <= maxBudget;
      const matchesRating = provider.rating >= minRating;
      return matchesCategory && matchesLocation && matchesBudget && matchesRating;
    });

    state.currentIndex = 0;
    renderStack();
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
        <p>You have used ${GUEST_SWIPE_LIMIT} guest swipes. Create a client account to keep discovering providers.</p>
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

      card.querySelector("button[data-action='photos']")?.addEventListener("click", () => {
        if (requireClientAuth("view more photos")) return;
        openPhotoGalleryModal(provider);
      });

      card.querySelector("button[data-action='book']")?.addEventListener("click", () => {
        if (requireClientAuth("book services")) return;
        logProviderEvent(provider?.id, "booking_click");
        alert(labelBeta.action || "This action is coming soon in beta.");
      });

      card.querySelector("button[data-action='contact']")?.addEventListener("click", () => {
        if (requireClientAuth("contact providers")) return;
        logProviderEvent(provider?.id, "contact_click");
        alert(labelBeta.action || "This action is coming soon in beta.");
      });

      card.querySelector("button[data-action='review']")?.addEventListener("click", () => {
        if (requireClientAuth("leave a review")) return;
        alert(labelBeta.action || "This action is coming soon in beta.");
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

  applyFiltersButton.addEventListener("click", applyFilters);
  passButton.addEventListener("click", () => swipeFallback("left"));
  saveButton.addEventListener("click", () => swipeFallback("right"));

  const initData = async () => {
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
