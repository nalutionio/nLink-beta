const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const nameEl = document.getElementById("client-name");
const metaEl = document.getElementById("client-meta");
const avatarEl = document.getElementById("client-avatar");
const heroBgEl = document.getElementById("client-hero-bg");
const publicAvatarEl = document.getElementById("client-public-avatar");
const publicNameEl = document.getElementById("client-public-name");
const publicMemberEl = document.getElementById("client-public-member");
const publicVerifiedEl = document.getElementById("client-public-verified");
const publicLocationEl = document.getElementById("client-public-location");
const statSavedEl = document.getElementById("profile-stat-saved");
const statAcceptedEl = document.getElementById("profile-stat-accepted");
const statOpenJobsEl = document.getElementById("profile-stat-open-jobs");
const statPendingEl = document.getElementById("profile-stat-pending");
const propertyChipsEl = document.getElementById("client-property-chips");
const propertyAccessNoteEl = document.getElementById("client-property-access-note");
const propertyPhotosEl = document.getElementById("client-property-photos");
const propertyCompletionEl = document.getElementById("client-property-completion");
const viewFullProfileButton = document.getElementById("client-view-full-profile");
const activeRequestsEl = document.getElementById("profile-active-requests");
let fullProfileState = null;

const fallbackName = (email) => (email ? email.split("@")[0] : "Neighbor");
const fallbackAvatar = "../assets/neighborpp.png";

const isMissingColumnError = (error) => {
  if (!error) return false;
  if (["42703", "PGRST204", "PGRST205"].includes(error.code)) return true;
  const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return msg.includes("column") && (msg.includes("does not exist") || msg.includes("schema cache"));
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

const formatMemberSince = (value) => {
  if (!value) return "Member since --";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since --";
  return `Member since ${date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
};

const getSavedCount = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("nlink_saved")) || [];
    return Array.isArray(saved) ? saved.length : 0;
  } catch (_error) {
    return 0;
  }
};

const normalizeJobStatus = (status) => {
  if (status === "accepted") return "in_progress";
  if (!status) return "open";
  return status;
};

const formatDateTime = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const renderActiveRequests = (rows, appointmentByRequestId = {}) => {
  if (!activeRequestsEl) return;
  activeRequestsEl.innerHTML = "";
  if (!rows.length) {
    activeRequestsEl.innerHTML = "<p class='muted'>No active requests yet.</p>";
    return;
  }
  rows.slice(0, 4).forEach((row) => {
    const providerName = row.providers?.name || "Plug";
    const providerAvatar = row.providers?.avatar_url || "../assets/plugprofilepic.png";
    const status = String(row.status || "pending").toLowerCase();
    const appointment = appointmentByRequestId[row.id] || null;
    const isScheduled = String(appointment?.status || "").toLowerCase() === "scheduled";
    const statusLabel = isScheduled
      ? "Scheduled"
      : status === "accepted"
        ? "Accepted"
        : status === "requested"
          ? "Direct Sent"
          : "Pending";
    const subtitle = isScheduled
      ? `Appointment: ${formatDateTime(appointment?.selected_slot) || "Scheduled"}`
      : `Requested ${new Date(row.created_at).toLocaleDateString()}`;
    const card = document.createElement("article");
    card.className = "job-card";
    card.innerHTML = `
      <img class="job-thumb" src="${providerAvatar}" alt="${providerName}" />
      <div class="job-card-body">
        <h4>${row.jobs?.title || "Job"}</h4>
        <p class="muted">${providerName} • ${row.jobs?.location || "Location not set"}</p>
        <p class="muted">${subtitle}</p>
      </div>
      <div class="job-actions">
        <span class="pill">${statusLabel}</span>
        <a class="ghost-button" href="../client/client-job-detail.html?id=${encodeURIComponent(row.job_id || "")}">View</a>
      </div>
    `;
    activeRequestsEl.appendChild(card);
  });
};

const hasPropertyProfileContent = (value) => {
  if (!value || typeof value !== "object") return false;
  const keys = [
    "propertyType",
    "ownership",
    "yearBuilt",
    "roofAge",
    "hvacAge",
    "panelAge",
    "waterHeaterAge",
    "renovationYear",
    "accessNotes",
  ];
  return keys.some((key) => String(value[key] || "").trim().length > 0)
    || (Array.isArray(value.photos) && value.photos.length > 0);
};

const getLocalPropertyProfile = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("nlink_client_property_profile") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
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

const renderPropertyProfile = (profileValue) => {
  if (!propertyChipsEl) return;
  const profile = (profileValue && typeof profileValue === "object") ? profileValue : {};
  if (propertyCompletionEl) propertyCompletionEl.textContent = `${propertyCompletionCount(profile)}/9 completed`;
  const chips = [];
  if (profile.propertyType) chips.push(`Type: ${profile.propertyType}`);
  if (profile.ownership) chips.push(`Ownership: ${profile.ownership}`);
  if (profile.yearBuilt) chips.push(`Built: ${profile.yearBuilt}`);
  if (profile.roofAge) chips.push(`Roof: ${profile.roofAge}`);
  if (profile.hvacAge) chips.push(`HVAC: ${profile.hvacAge}`);
  if (profile.panelAge) chips.push(`Panel: ${profile.panelAge}`);
  if (profile.waterHeaterAge) chips.push(`Water Heater: ${profile.waterHeaterAge}`);
  if (profile.renovationYear) chips.push(`Last Reno: ${profile.renovationYear}`);

  if (!chips.length) {
    propertyChipsEl.innerHTML = "<span class=\"pill\">No property details added yet</span>";
  } else {
    propertyChipsEl.innerHTML = chips.map((chip) => `<span class="pill">${chip}</span>`).join("");
  }

  if (propertyAccessNoteEl) {
    const note = String(profile.accessNotes || "").trim();
    propertyAccessNoteEl.textContent = note || "No property access notes added.";
  }

  if (propertyPhotosEl) {
    const photos = Array.isArray(profile.photos)
      ? profile.photos.filter((item) => item && typeof item.url === "string" && item.url).slice(0, 3)
      : [];
    if (!photos.length) {
      propertyPhotosEl.innerHTML = "";
    } else {
      propertyPhotosEl.innerHTML = photos.map((photo, index) => `
        <article class="gallery-card property-photo-card">
          <img src="${photo.url}" alt="Property ${index + 1}" class="${photo.hidden ? "is-hidden-photo" : ""}" />
          <small class="pill property-photo-visibility">${photo.hidden ? "Hidden" : "Visible"}</small>
        </article>
      `).join("");
    }
  }
};

const closeClientFullProfileModal = () => {
  document.getElementById("client-full-profile-modal")?.remove();
};

const openClientFullProfileModal = () => {
  if (!fullProfileState) return;
  closeClientFullProfileModal();

  const profile = fullProfileState.propertyProfile || {};
  const photos = Array.isArray(profile.photos)
    ? profile.photos.filter((item) => item && typeof item.url === "string" && item.url).slice(0, 3)
    : [];
  const chips = [];
  if (profile.propertyType) chips.push(`Type: ${profile.propertyType}`);
  if (profile.ownership) chips.push(`Ownership: ${profile.ownership}`);
  if (profile.yearBuilt) chips.push(`Built: ${profile.yearBuilt}`);
  if (profile.roofAge) chips.push(`Roof: ${profile.roofAge}`);
  if (profile.hvacAge) chips.push(`HVAC: ${profile.hvacAge}`);
  if (profile.panelAge) chips.push(`Panel: ${profile.panelAge}`);
  if (profile.waterHeaterAge) chips.push(`Water Heater: ${profile.waterHeaterAge}`);
  if (profile.renovationYear) chips.push(`Last Reno: ${profile.renovationYear}`);

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "client-full-profile-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>${fullProfileState.name}</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <p class="muted">${fullProfileState.memberSince} • ${fullProfileState.location || "Location not set"}</p>
      <p class="muted">${propertyCompletionCount(profile)}/9 property details completed</p>
      <div class="tag-list">${chips.length ? chips.map((chip) => `<span class="pill">${chip}</span>`).join("") : "<span class=\"pill\">No property details yet</span>"}</div>
      <p class="muted">${profile.accessNotes ? profile.accessNotes : "No property access notes added."}</p>
      <div class="gallery-grid">${photos.map((photo, index) => `
        <article class="gallery-card property-photo-card">
          <img src="${photo.url}" alt="Property ${index + 1}" class="${photo.hidden ? "is-hidden-photo" : ""}" />
          <small class="pill property-photo-visibility">${photo.hidden ? "Hidden" : "Visible"}</small>
        </article>
      `).join("")}</div>
      <p class="muted">Exact address stays private until you choose to share it during booking.</p>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeClientFullProfileModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeClientFullProfileModal();
  });
};

const loadClientProfile = async () => {
  if (!supabase) return;
  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);
  const user = userData?.user || sessionData?.session?.user;
  if (!user) return;

  const meta = user.user_metadata || {};
  const profile = await selectClientProfile(user.id);

  const displayName = profile?.full_name || meta.client_name || fallbackName(user.email);
  if (nameEl) nameEl.textContent = displayName;

  if (metaEl) {
    const bits = [
      profile?.email || user.email || "",
      profile?.phone || "",
      profile?.location || profile?.address || meta.client_location || "",
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }

  const avatarUrl = profile?.avatar_url || meta.client_avatar_url || fallbackAvatar;
  if (avatarEl) {
    avatarEl.src = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }
  if (publicAvatarEl) {
    publicAvatarEl.src = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }

  const bannerUrl = profile?.banner_url || "";
  if (heroBgEl && bannerUrl) {
    heroBgEl.style.backgroundImage = `linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.45)), url('${bannerUrl}')`;
    heroBgEl.style.backgroundSize = "cover";
    heroBgEl.style.backgroundPosition = "center";
  }

  if (publicNameEl) publicNameEl.textContent = displayName;
  if (publicMemberEl) publicMemberEl.textContent = formatMemberSince(user.created_at);
  if (publicVerifiedEl) {
    const verified = Boolean(user.email_confirmed_at);
    publicVerifiedEl.textContent = verified ? "Email verified" : "Email unverified";
    publicVerifiedEl.classList.toggle("verified-badge", verified);
  }
  if (publicLocationEl) {
    const publicLocation = toPublicLocation(profile?.location || profile?.address || meta.client_location || "");
    publicLocationEl.textContent = publicLocation || "Location not set";
  }
  const dbOrMetaProfile = (profile?.property_profile && typeof profile.property_profile === "object")
    ? profile.property_profile
    : {};
  const localProfile = getLocalPropertyProfile();
  const propertyProfile = hasPropertyProfileContent(localProfile)
    ? localProfile
    : dbOrMetaProfile;
  renderPropertyProfile(propertyProfile);
  fullProfileState = {
    name: displayName,
    location: profile?.location || profile?.address || meta.client_location || "",
    memberSince: formatMemberSince(user.created_at),
    propertyProfile,
  };

  if (statSavedEl) statSavedEl.textContent = String(getSavedCount());

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,status")
    .eq("client_id", user.id);
  const jobRows = Array.isArray(jobs) ? jobs : [];
  const openJobs = jobRows.filter((row) => normalizeJobStatus(row.status) === "open").length;
  if (statOpenJobsEl) statOpenJobsEl.textContent = String(openJobs);

  const jobIds = jobRows.map((row) => row.id).filter(Boolean);
  if (!jobIds.length) {
    if (statAcceptedEl) statAcceptedEl.textContent = "0";
    if (statPendingEl) statPendingEl.textContent = "0";
    return;
  }

  const { count: acceptedCount } = await supabase
    .from("job_requests")
    .select("id", { count: "exact", head: true })
    .in("job_id", jobIds)
    .eq("status", "accepted");
  if (statAcceptedEl) statAcceptedEl.textContent = String(acceptedCount || 0);

  const { count: pendingCount } = await supabase
    .from("job_requests")
    .select("id", { count: "exact", head: true })
    .in("job_id", jobIds)
    .eq("status", "pending");
  if (statPendingEl) statPendingEl.textContent = String(pendingCount || 0);

  const { data: activeRows } = await supabase
    .from("job_requests")
    .select("id,job_id,provider_id,status,created_at,jobs(title,location),providers(name,avatar_url)")
    .in("job_id", jobIds)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  const activeRequestRows = Array.isArray(activeRows) ? activeRows : [];
  const appointmentByRequestId = {};
  if (activeRequestRows.length) {
    const requestIds = activeRequestRows.map((row) => row.id).filter(Boolean);
    const { data: appointmentRows, error: appointmentError } = await supabase
      .from("job_appointments")
      .select("request_id,status,selected_slot")
      .in("request_id", requestIds);
    if (!appointmentError && Array.isArray(appointmentRows)) {
      appointmentRows.forEach((row) => {
        if (row?.request_id) appointmentByRequestId[row.request_id] = row;
      });
    }
  }
  renderActiveRequests(activeRequestRows, appointmentByRequestId);
};

viewFullProfileButton?.addEventListener("click", openClientFullProfileModal);
loadClientProfile();
