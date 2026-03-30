const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const pendingEl = document.getElementById("request-list");
const closedEl = document.getElementById("request-closed");
let providerUserId = null;
const clientInitiatedByThread = {};
const clientProfilesById = {};
const jobsById = {};

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
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

const formatBudget = (min, max) => {
  const minVal = Number(min || 0);
  const maxVal = Number(max || 0);
  return `$${minVal} - $${maxVal}`;
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
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

const openClientFullProfileModal = (clientId, jobId) => {
  const job = jobsById[jobId];
  if (!job) return;
  const profile = clientProfilesById[clientId] || {};
  const property = profile.property_profile && typeof profile.property_profile === "object"
    ? profile.property_profile
    : {};
  const completion = propertyCompletionCount(property);
  const name = profile.full_name || job.client_name || "Neighbor";
  const avatar = profile.avatar_url || job.client_avatar_url || "../assets/neighborpp.png";
  const location = toPublicLocation(profile.location || profile.address || job.client_location_public || job.location || "");
  const memberSince = formatMemberSince(profile.created_at || job.created_at);
  const chips = [];
  if (property.propertyType) chips.push(`Type: ${property.propertyType}`);
  if (property.ownership) chips.push(`Ownership: ${property.ownership}`);
  if (property.yearBuilt) chips.push(`Built: ${property.yearBuilt}`);
  if (property.roofAge) chips.push(`Roof: ${property.roofAge}`);
  if (property.hvacAge) chips.push(`HVAC: ${property.hvacAge}`);
  if (property.panelAge) chips.push(`Panel: ${property.panelAge}`);
  if (property.waterHeaterAge) chips.push(`Water Heater: ${property.waterHeaterAge}`);
  if (property.renovationYear) chips.push(`Last Reno: ${property.renovationYear}`);
  const photos = Array.isArray(property.photos)
    ? property.photos.filter((item) => item && typeof item.url === "string" && item.url).slice(0, 3)
    : [];

  closeClientFullProfileModal();
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
        <span class="pill">${job.client_email_verified === true ? "Email verified" : "Email unverified"}</span>
        <span class="pill">${completion}/9 property details</span>
      </div>
      <div class="tag-list">${chips.length ? chips.map((chip) => `<span class="pill">${chip}</span>`).join("") : "<span class=\"pill\">No property details yet</span>"}</div>
      <p class="muted">${property.accessNotes ? property.accessNotes : "No property access notes added."}</p>
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

const loadClientProfiles = async (clientIds) => {
  const ids = Array.from(new Set(clientIds.filter(Boolean)));
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .in("user_id", ids);
  if (!error && Array.isArray(data)) {
    data.forEach((row) => {
      if (row?.user_id) clientProfilesById[row.user_id] = row;
    });
    return;
  }
  if (!(error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST205")) return;
};

const formatProposalType = (value) => {
  if (!value) return "General";
  if (value === "inspection_first") return "Inspection first";
  if (value === "direct_service") return "Direct service";
  if (value === "hybrid") return "Hybrid";
  return "General";
};

const formatEstimate = (min, max) => {
  const minVal = Number(min || 0);
  const maxVal = Number(max || 0);
  if (minVal > 0 && maxVal > 0) return `$${minVal} - $${maxVal}`;
  if (minVal > 0) return `From $${minVal}`;
  if (maxVal > 0) return `Up to $${maxVal}`;
  return "Not set";
};

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

const deriveDisplayRequestStatus = (request, acceptedJobIdSet = new Set()) => {
  const normalized = normalizeRequestStatus(request?.status);
  const jobStatus = String(request?.jobs?.status || "").toLowerCase();
  const hasAcceptedSibling = Boolean(request?.jobs?.id && acceptedJobIdSet.has(request.jobs.id));
  if (normalized === "pending" && hasAcceptedSibling) {
    return "declined";
  }
  if (normalized === "pending" && (jobStatus === "in_progress" || jobStatus === "closed")) {
    return "declined";
  }
  if (normalized === "accepted" && jobStatus === "closed") {
    return "completed";
  }
  return normalized;
};

const buildOverflowMenu = ({
  jobId = "",
  clientId = "",
  clientName = "",
  clientAvatar = "",
  canMessage = false,
  canComplete = false,
  requestId = "",
}) => {
  const actions = [];
  if (clientId) {
    actions.push(`<button class="proposal-menu-item" data-client-view="${clientId}" data-job-id="${jobId}" type="button">View Neighbor</button>`);
  }
  if (canMessage && clientId && clientId !== providerUserId) {
    actions.push(`
      <a
        class="proposal-menu-item"
        href="../provider/provider-messages.html?job=${encodeURIComponent(jobId || "")}&client=${encodeURIComponent(clientId || "")}${clientName ? `&clientName=${encodeURIComponent(clientName)}` : ""}${clientAvatar ? `&clientAvatar=${encodeURIComponent(clientAvatar)}` : ""}"
      >Message</a>
    `);
  }
  if (canComplete && requestId) {
    actions.push(`<button class="proposal-menu-item" data-request-action="complete" data-request-id="${requestId}" data-job-id="${jobId}" type="button">Mark Completed</button>`);
  }
  if (!actions.length) return "";
  return `
    <div class="proposal-menu-wrap">
      <button class="ghost-button compact proposal-more-btn" data-action="proposal-menu-toggle" type="button" aria-expanded="false" aria-label="More actions">⋯</button>
      <div class="proposal-overflow-menu hidden">
        ${actions.join("")}
      </div>
    </div>
  `;
};

const markRequestCompleted = async (requestId, providerId, jobId = null) => {
  if (!supabase || !requestId || !providerId) return false;
  const { error } = await supabase
    .from("job_requests")
    .update({ status: "closed" })
    .eq("id", requestId)
    .eq("provider_id", providerId);
  if (error) return false;
  if (jobId) {
    // Best effort: if provider-side job update is allowed, keep job-level state in sync.
    await supabase
      .from("jobs")
      .update({ status: "closed" })
      .eq("id", jobId);
  }
  return true;
};

const renderRequests = async () => {
  if (!supabase) return;
  const providerId = await loadProviderId();
  if (!providerId) return;
  Object.keys(clientInitiatedByThread).forEach((key) => delete clientInitiatedByThread[key]);

  const queries = [
    "id,status,created_at,proposal_type,estimated_price_min,estimated_price_max,pricing_basis,inspection_fee,inspection_fee_creditable,inspection_fee_waivable,proposal_notes,jobs(id,title,location,budget_min,budget_max,status,client_id,client_name,client_avatar_url,client_location_public,client_email_verified,created_at)",
    "id,status,created_at,jobs(id,title,location,budget_min,budget_max,status,client_id,created_at)",
  ];
  let data = [];
  for (let i = 0; i < queries.length; i += 1) {
    const result = await supabase
      .from("job_requests")
      .select(queries[i])
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (!result.error && Array.isArray(result.data)) {
      data = result.data;
      break;
    }
    if (!(result.error?.code === "42703" || result.error?.code === "PGRST204" || result.error?.code === "PGRST205")) {
      data = [];
      break;
    }
  }

  const requests = data || [];
  const acceptedJobIdSet = new Set(
    requests
      .filter((req) => normalizeRequestStatus(req.status) === "accepted")
      .map((req) => req.jobs?.id)
      .filter(Boolean),
  );
  requests.forEach((req) => {
    if (req?.jobs?.id) jobsById[req.jobs.id] = req.jobs;
  });
  await loadClientProfiles(requests.map((req) => req.jobs?.client_id));
  const jobIds = requests
    .map((req) => req.jobs?.id)
    .filter(Boolean);
  let photosByJobId = {};
  if (jobIds.length) {
    const { data: photoRows } = await supabase
      .from("job_photos")
      .select("job_id,url,created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });
    if (Array.isArray(photoRows)) {
      photoRows.forEach((row) => {
        if (!photosByJobId[row.job_id]) photosByJobId[row.job_id] = row.url;
      });
    }
  }
  if (jobIds.length) {
    const { data: messageRows } = await supabase
      .from("job_messages")
      .select("job_id,client_id,sender_role,created_at")
      .eq("provider_id", providerId)
      .eq("sender_role", "client")
      .in("job_id", jobIds)
      .order("created_at", { ascending: true });
    if (Array.isArray(messageRows)) {
      messageRows.forEach((row) => {
        const key = `${row.job_id}:${row.client_id}`;
        clientInitiatedByThread[key] = true;
      });
    }
  }
  const pending = requests.filter((req) => deriveDisplayRequestStatus(req, acceptedJobIdSet) === "pending");
  const active = requests.filter((req) => deriveDisplayRequestStatus(req, acceptedJobIdSet) === "accepted");
  const completed = requests.filter((req) => deriveDisplayRequestStatus(req, acceptedJobIdSet) === "completed");
  const declined = requests.filter((req) => deriveDisplayRequestStatus(req, acceptedJobIdSet) === "declined");

  if (pendingEl) {
    pendingEl.innerHTML = "";
    if (pending.length === 0 && active.length === 0) {
      pendingEl.innerHTML = "<p class='muted'>No proposals yet.</p>";
    } else {
      const renderCard = (req) => {
        const thumb = photosByJobId[req.jobs?.id] || "../assets/jobrequestpic.png";
        const card = document.createElement("article");
        card.className = "job-card proposal-card";
        const status = deriveDisplayRequestStatus(req, acceptedJobIdSet);
        const threadKey = `${req.jobs?.id || ""}:${req.jobs?.client_id || ""}`;
        const canMessage = (status === "accepted" || status === "completed") && clientInitiatedByThread[threadKey];
        const profile = req.jobs?.client_id ? clientProfilesById[req.jobs.client_id] : null;
        const overflowMenu = buildOverflowMenu({
          jobId: req.jobs?.id || "",
          clientId: req.jobs?.client_id || "",
          clientName: profile?.full_name || req.jobs?.client_name || "",
          clientAvatar: profile?.avatar_url || req.jobs?.client_avatar_url || "",
          canMessage,
          canComplete: status === "accepted",
          requestId: req.id,
        });
        card.innerHTML = `
          ${overflowMenu ? `<div class="proposal-card-corner">${overflowMenu}</div>` : ""}
          <img class="job-thumb proposal-thumb" src="${thumb}" alt="${req.jobs?.title || "Job"}" />
          <div class="job-card-body proposal-body">
            <h4 class="proposal-title">${req.jobs?.title || "Job"}</h4>
            <p class="muted proposal-meta">${req.jobs?.location || ""} • ${formatBudget(req.jobs?.budget_min, req.jobs?.budget_max)}</p>
            <p class="muted proposal-meta">Proposed ${formatDate(req.created_at)}</p>
            <p class="muted proposal-meta">Type: ${formatProposalType(req.proposal_type)} • Estimate: ${formatEstimate(req.estimated_price_min, req.estimated_price_max)}</p>
            ${req.inspection_fee ? `<p class="muted proposal-meta">Inspection fee: $${req.inspection_fee}${req.inspection_fee_creditable ? " (credited)" : ""}${req.inspection_fee_waivable ? " • waivable" : ""}</p>` : ""}
          </div>
          <div class="job-actions proposal-actions">
            <span class="pill proposal-status ${status === "accepted" ? "status-accepted" : status === "completed" ? "status-closed" : "status-pending"}">${requestStatusLabel(status)}</span>
            <a class="ghost-button" href="../provider/job-detail.html?id=${req.jobs?.id || ""}&from=proposals">View</a>
          </div>
        `;
        pendingEl.appendChild(card);
      };

      if (active.length) {
        const activeTitle = document.createElement("p");
        activeTitle.className = "job-group-title";
        activeTitle.textContent = "Accepted";
        pendingEl.appendChild(activeTitle);
        active.forEach(renderCard);
      }

      if (pending.length) {
        const pendingTitle = document.createElement("p");
        pendingTitle.className = "job-group-title";
        pendingTitle.textContent = "Pending";
        pendingEl.appendChild(pendingTitle);
        pending.forEach(renderCard);
      }
    }
  }

  if (closedEl) {
    closedEl.innerHTML = "";
    const closed = [...completed, ...declined];
    if (closed.length === 0) {
      closedEl.innerHTML = "<p class='muted'>No closed proposals.</p>";
    } else {
      if (completed.length) {
        const completedTitle = document.createElement("p");
        completedTitle.className = "job-group-title";
        completedTitle.textContent = "Completed";
        closedEl.appendChild(completedTitle);
      }
      completed.forEach((req) => {
        const thumb = photosByJobId[req.jobs?.id] || "../assets/jobrequestpic.png";
        const threadKey = `${req.jobs?.id || ""}:${req.jobs?.client_id || ""}`;
        const canMessage = clientInitiatedByThread[threadKey];
        const profile = req.jobs?.client_id ? clientProfilesById[req.jobs.client_id] : null;
        const overflowMenu = buildOverflowMenu({
          jobId: req.jobs?.id || "",
          clientId: req.jobs?.client_id || "",
          clientName: profile?.full_name || req.jobs?.client_name || "",
          clientAvatar: profile?.avatar_url || req.jobs?.client_avatar_url || "",
          canMessage,
          canComplete: false,
          requestId: req.id,
        });
        const card = document.createElement("article");
        card.className = "job-card proposal-card job-card-closed";
        card.innerHTML = `
          ${overflowMenu ? `<div class="proposal-card-corner">${overflowMenu}</div>` : ""}
          <img class="job-thumb proposal-thumb" src="${thumb}" alt="${req.jobs?.title || "Job"}" />
          <div class="job-card-body proposal-body">
            <h4 class="proposal-title">${req.jobs?.title || "Job"}</h4>
            <p class="muted proposal-meta">${req.jobs?.location || ""} • ${formatBudget(req.jobs?.budget_min, req.jobs?.budget_max)}</p>
            <p class="muted proposal-meta">Type: ${formatProposalType(req.proposal_type)} • Estimate: ${formatEstimate(req.estimated_price_min, req.estimated_price_max)}</p>
            ${req.inspection_fee ? `<p class="muted proposal-meta">Inspection fee: $${req.inspection_fee}${req.inspection_fee_creditable ? " (credited)" : ""}${req.inspection_fee_waivable ? " • waivable" : ""}</p>` : ""}
          </div>
          <div class="job-actions proposal-actions">
            <span class="pill proposal-status status-closed">Completed</span>
            <a class="ghost-button" href="../provider/job-detail.html?id=${req.jobs?.id || ""}&from=proposals">View</a>
          </div>
        `;
        closedEl.appendChild(card);
      });
      if (declined.length) {
        const declinedTitle = document.createElement("p");
        declinedTitle.className = "job-group-title";
        declinedTitle.textContent = "Declined";
        closedEl.appendChild(declinedTitle);
      }
      declined.forEach((req) => {
        const thumb = photosByJobId[req.jobs?.id] || "../assets/jobrequestpic.png";
        const card = document.createElement("article");
        card.className = "job-card proposal-card job-card-closed";
        card.innerHTML = `
          <img class="job-thumb proposal-thumb" src="${thumb}" alt="${req.jobs?.title || "Job"}" />
          <div class="job-card-body proposal-body">
            <h4 class="proposal-title">${req.jobs?.title || "Job"}</h4>
            <p class="muted proposal-meta">${req.jobs?.location || ""} • ${formatBudget(req.jobs?.budget_min, req.jobs?.budget_max)}</p>
            <p class="muted proposal-meta">Type: ${formatProposalType(req.proposal_type)} • Estimate: ${formatEstimate(req.estimated_price_min, req.estimated_price_max)}</p>
          </div>
          <div class="job-actions proposal-actions">
            <span class="pill proposal-status">Declined</span>
            <a class="ghost-button" href="../provider/job-detail.html?id=${req.jobs?.id || ""}&from=proposals">View</a>
          </div>
        `;
        closedEl.appendChild(card);
      });
    }
  }
};

document.addEventListener("click", (event) => {
  const closeAllOverflowMenus = () => {
    document.querySelectorAll(".proposal-overflow-menu").forEach((menu) => menu.classList.add("hidden"));
    document.querySelectorAll("button[data-action='proposal-menu-toggle']").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
  };

  const menuToggle = event.target.closest("button[data-action='proposal-menu-toggle']");
  if (menuToggle) {
    const wrap = menuToggle.closest(".proposal-menu-wrap");
    const menu = wrap?.querySelector(".proposal-overflow-menu");
    const willOpen = Boolean(menu?.classList.contains("hidden"));
    closeAllOverflowMenus();
    if (willOpen && menu) {
      menu.classList.remove("hidden");
      menuToggle.setAttribute("aria-expanded", "true");
    }
    return;
  }

  if (!event.target.closest(".proposal-menu-wrap")) {
    closeAllOverflowMenus();
  }

  const actionButton = event.target.closest("button[data-request-action='complete']");
  if (actionButton) {
    closeAllOverflowMenus();
    const requestId = actionButton.dataset.requestId || "";
    const jobId = actionButton.dataset.jobId || "";
    if (!requestId) return;
    actionButton.disabled = true;
    actionButton.textContent = "Saving...";
    loadProviderId().then((providerId) => markRequestCompleted(requestId, providerId, jobId || null))
      .then((ok) => {
        if (ok) {
          renderRequests();
          return;
        }
        actionButton.disabled = false;
        actionButton.textContent = "Mark Completed";
      });
    return;
  }

  const button = event.target.closest("button[data-client-view]");
  if (!button) return;
  closeAllOverflowMenus();
  const clientId = button.dataset.clientView || "";
  const jobId = button.dataset.jobId || "";
  if (!clientId || !jobId) return;
  openClientFullProfileModal(clientId, jobId);
});

renderRequests();
