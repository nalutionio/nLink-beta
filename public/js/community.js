(function initCommunityPage() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;
  let readClient = supabase;

  const root = document.getElementById("community-root");
  if (!root) return;

  const activeRole = root.dataset.role === "provider" ? "provider" : "client";
  const discoveryHref = root.dataset.discoveryHref || "../client/discover.html";
  const jobsHref = root.dataset.jobsHref || "../client/client-jobs.html";
  const jobsCtaLabel = activeRole === "provider" ? "Find Jobs" : "Post Job";
  const statusEl = document.getElementById("community-status");
  const postForm = document.getElementById("community-post-form");
  const postTypeInput = document.getElementById("community-post-type");
  const postTypeChips = document.getElementById("community-post-type-chips");
  const postBodyInput = document.getElementById("community-post-body");
  const serviceCategoryInput = document.getElementById("community-service-category");
  const serviceNameInput = document.getElementById("community-service-name");
  const serviceTagsInput = document.getElementById("community-service-tags");
  const moreFieldsWrap = document.getElementById("community-more-fields");
  const moreFieldsToggle = document.getElementById("community-more-fields-toggle");
  const composerPhotoInput = document.getElementById("community-photo-upload");
  const composerPhotoPreview = document.getElementById("community-photo-preview");
  const composerPhotoPreviewImage = document.getElementById("community-photo-preview-image");
  const composerPhotoRemove = document.getElementById("community-photo-remove");
  const feedEl = document.getElementById("community-feed");
  const rangeFilterEl = document.getElementById("community-range-filter");
  const rangeHintEl = document.getElementById("community-range-hint");
  const composerAvatarEl = document.getElementById("community-composer-avatar");
  const activityButtonEl = document.getElementById("community-activity-btn");
  const activityBadgeEl = document.getElementById("community-activity-badge");

  const state = {
    user: null,
    providerId: null,
    feed: [],
    hiddenPostIds: new Set(),
    providersById: {},
    clientsById: {},
    commentsByPostId: {},
    reactionsByPostId: {},
    plugsByPostId: {},
    providerOptions: [],
    currentAuthor: {
      name: "",
      avatarUrl: "",
      subtitle: "",
    },
    lastPlugAdded: null,
    notifications: [],
    notificationActorRoleById: {},
    composerPhoto: null,
    localOrigin: {
      city: "",
      state: "",
      county: "",
      raw: "",
    },
    rangeMode: "nearby",
  };
  let postImageColumnAvailable = true;
  let notificationChannel = null;
  const fallbackAvatar = "../assets/plugprofilepic.png";
  const clientFallbackAvatar = "../assets/neighborpp.png";
  const hiddenPostsStorageKey = () => `plugfeed_hidden_posts_${state.user?.id || "guest"}`;

  const loadHiddenPostIds = () => {
    try {
      const raw = localStorage.getItem(hiddenPostsStorageKey());
      const parsed = JSON.parse(raw || "[]");
      state.hiddenPostIds = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch (_error) {
      state.hiddenPostIds = new Set();
    }
  };

  const saveHiddenPostIds = () => {
    try {
      localStorage.setItem(hiddenPostsStorageKey(), JSON.stringify(Array.from(state.hiddenPostIds)));
    } catch (_error) {
      // best effort only
    }
  };

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = `auth-status ${type}`.trim();
  };

  const setActivityBadge = (count) => {
    if (!activityBadgeEl) return;
    const value = Number(count || 0);
    if (value > 0) {
      activityBadgeEl.textContent = value > 99 ? "99+" : String(value);
      activityBadgeEl.classList.remove("hidden");
    } else {
      activityBadgeEl.classList.add("hidden");
    }
  };

  const setSafeAvatar = (imgEl, preferredUrl, fallbackUrl) => {
    if (!imgEl) return;
    const primary = String(preferredUrl || "").trim();
    const fallback = String(fallbackUrl || "").trim();
    imgEl.onerror = () => {
      if (fallback && imgEl.src !== new URL(fallback, window.location.href).toString()) {
        imgEl.src = fallback;
      }
    };
    imgEl.src = primary || fallback;
  };

  const getErrorText = (error, fallback = "Something went wrong.") => {
    const raw = String(error?.message || error || "").trim();
    if (!raw) return fallback;
    if (/failed to fetch/i.test(raw) || /network/i.test(raw)) {
      return "Network error while connecting to Supabase. Please refresh and try again.";
    }
    return raw;
  };
  const isSchemaMissingColumnError = (error) => {
    if (!error) return false;
    if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") return true;
    const message = String(error.message || "").toLowerCase();
    return message.includes("column")
      && (message.includes("image_url") || message.includes("schema cache"));
  };

  const formatUploadFileName = (name) => {
    const value = String(name || "").trim();
    if (!value) return "image";
    const max = 52;
    if (value.length <= max) return value;
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return `${value.slice(0, max - 1)}…`;
    const ext = value.slice(dot);
    const keep = Math.max(12, max - ext.length - 1);
    return `${value.slice(0, keep)}…${ext}`;
  };

  const updateComposerPhotoPreview = () => {
    if (!composerPhotoPreview || !composerPhotoPreviewImage) return;
    if (!state.composerPhoto?.previewDataUrl) {
      composerPhotoPreview.classList.add("hidden");
      composerPhotoPreviewImage.src = "";
      return;
    }
    composerPhotoPreviewImage.src = state.composerPhoto.previewDataUrl;
    composerPhotoPreview.classList.remove("hidden");
  };

  const clearComposerPhoto = () => {
    state.composerPhoto = null;
    if (composerPhotoInput) composerPhotoInput.value = "";
    updateComposerPhotoPreview();
  };

  const uploadCommunityImage = async (blob, fileName = "photo.jpg") => {
    const extension = "jpg";
    let uploadBlob = blob;
    let contentType = "image/jpeg";
    if (typeof window.nlinkPrepareImageForUpload === "function") {
      const prepared = await window.nlinkPrepareImageForUpload(blob, { forceJpeg: true });
      uploadBlob = prepared.blob;
      contentType = prepared.type || "image/jpeg";
    }
    const basePath = `community/${activeRole}/${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${formatUploadFileName(fileName).replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.[^.]+$/, "")}`;
    const finalPath = `${basePath}.${extension}`;
    const { error } = await supabase.storage.from("provider-media").upload(finalPath, uploadBlob, {
      upsert: true,
      contentType,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("provider-media").getPublicUrl(finalPath);
    return { url: data?.publicUrl || "", storagePath: finalPath };
  };
  const isTransportError = (error) => {
    const raw = String(error?.message || error || "").trim();
    return (Number(error?.status) || 0) === 0
      || /failed to fetch/i.test(raw)
      || /network/i.test(raw);
  };
  const recoverSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data?.session) return false;
      state.user = data.session.user || state.user;
      return true;
    } catch (_error) {
      return false;
    }
  };

  const runWithSessionRecovery = async (runner) => {
    try {
      return await runner();
    } catch (error) {
      if (!isTransportError(error)) throw error;
      const recovered = await recoverSession();
      if (!recovered) throw error;
      return runner();
    }
  };

  const formatDate = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const escapeHtml = (value) => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const LOCATION_CANONICAL_FIXUPS = {
    "bridgewater, nj,": "bridgewater, nj",
    "raritan township, nj": "raritan, nj",
  };

  const NJ_COUNTY_BY_CITY = {
    "bridgewater, nj": "somerset",
    "somerville, nj": "somerset",
    "raritan, nj": "somerset",
    "bound brook, nj": "somerset",
    "south bound brook, nj": "somerset",
    "hillsborough, nj": "somerset",
    "manville, nj": "somerset",
    "bedminster, nj": "somerset",
    "berkeley heights, nj": "union",
    "new providence, nj": "union",
    "plainfield, nj": "union",
    "westfield, nj": "union",
    "edison, nj": "middlesex",
    "piscataway, nj": "middlesex",
    "new brunswick, nj": "middlesex",
    "highland park, nj": "middlesex",
    "woodbridge, nj": "middlesex",
    "perth amboy, nj": "middlesex",
    "metuchen, nj": "middlesex",
    "trenton, nj": "mercer",
    "hamilton, nj": "mercer",
    "princeton, nj": "mercer",
    "flemington, nj": "hunterdon",
    "clinton, nj": "hunterdon",
    "newark, nj": "essex",
    "jersey city, nj": "hudson",
    "hoboken, nj": "hudson",
  };

  const normalizeLocationText = (value) => String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/, "")
    .trim();

  const parseCityState = (value) => {
    const normalized = normalizeLocationText(value);
    if (!normalized) return { city: "", state: "", key: "", raw: "" };
    const lowered = LOCATION_CANONICAL_FIXUPS[normalized.toLowerCase()] || normalized.toLowerCase();
    const parts = lowered.split(",").map((part) => part.trim()).filter(Boolean);
    const city = parts[0] || "";
    const state = parts[1] || "";
    return {
      city,
      state,
      key: city && state ? `${city}, ${state}` : lowered,
      raw: normalized,
    };
  };

  const resolveCounty = (cityStateKey) => NJ_COUNTY_BY_CITY[String(cityStateKey || "").toLowerCase()] || "";

  const getPostLocationKey = (post) => {
    if (post?.location_text) return parseCityState(post.location_text);
    const subtitle = String(post?.author_subtitle || "");
    const tail = subtitle.includes("•") ? subtitle.split("•").pop() : subtitle;
    return parseCityState(tail);
  };

  const rankPostByLocalRelevance = (post) => {
    const origin = state.localOrigin;
    if (!origin.city || !origin.state) return 0;
    const postLoc = getPostLocationKey(post);
    if (!postLoc.city || !postLoc.state) return 0;
    if (postLoc.city === origin.city && postLoc.state === origin.state) return 300;
    const postCounty = resolveCounty(postLoc.key);
    if (postCounty && origin.county && postCounty === origin.county) return 200;
    if (postLoc.state === origin.state) return 100;
    return 0;
  };

  const isPostInScopeByRange = (post) => {
    const origin = state.localOrigin;
    if (!origin.city || !origin.state) return true;
    const postLoc = getPostLocationKey(post);
    if (!postLoc.city || !postLoc.state) return false;
    if (state.rangeMode === "statewide") return postLoc.state === origin.state;
    if (state.rangeMode === "county") {
      const postCounty = resolveCounty(postLoc.key);
      return Boolean(postCounty && origin.county && postCounty === origin.county);
    }
    if (postLoc.city === origin.city && postLoc.state === origin.state) return true;
    const postCounty = resolveCounty(postLoc.key);
    return Boolean(postCounty && origin.county && postCounty === origin.county);
  };

  const allowedTypeByRole = {
    client: [
      { value: "ask", label: "Ask the Community" },
      { value: "need_help", label: "Need Help" },
      { value: "recommendation", label: "Recommendation" },
      { value: "showcase", label: "Share a Project" },
    ],
    provider: [
      { value: "showcase", label: "Project Showcase" },
      { value: "tip", label: "Helpful Tip" },
      { value: "advice", label: "Service Advice" },
      { value: "completed_update", label: "Completed Work Update" },
    ],
  };

  const loadProviderIdentity = async () => {
    if (activeRole !== "provider" || !state.user?.id) return;
    const { data, error } = await supabase
      .from("providers")
      .select("id,name")
      .eq("owner_id", state.user.id)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) state.providerId = data.id;
  };

  const loadNeighborProfiles = async (userIds) => {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return;

    const viewResult = await readClient
      .from("community_neighbor_public")
      .select("user_id,display_name,avatar_url,city_state")
      .in("user_id", ids);

    if (!viewResult.error && Array.isArray(viewResult.data)) {
      viewResult.data.forEach((row) => {
        state.clientsById[row.user_id] = {
          user_id: row.user_id,
          full_name: row.display_name || "Neighbor",
          avatar_url: row.avatar_url || "",
          city_state: row.city_state || "",
        };
      });
      return;
    }

    const fallback = await readClient
      .from("clients")
      .select("*")
      .in("user_id", ids);

    if (!fallback.error && Array.isArray(fallback.data)) {
      fallback.data.forEach((row) => {
        state.clientsById[row.user_id] = {
          user_id: row.user_id,
          full_name: row.full_name || "Neighbor",
          avatar_url: row.avatar_url || "",
          city_state: String(row.location || "").trim(),
        };
      });
    }
  };

  const logEvent = async (eventType, postId = null, metadata = {}) => {
    try {
      await supabase
        .from("community_events")
        .insert({
          actor_user_id: state.user?.id || null,
          actor_role: activeRole,
          event_type: eventType,
          post_id: postId,
          metadata,
        });
    } catch (_error) {
      // non-blocking
    }
  };

  const loadActivityNotifications = async () => {
    if (!state.user?.id) return;
    const { data, error } = await supabase
      .from("community_notifications")
      .select("*")
      .eq("recipient_user_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error && isTransportError(error)) throw error;
    state.notifications = Array.isArray(data) ? data : [];
    setActivityBadge(state.notifications.filter((item) => !item.is_read).length);
  };

  const hydrateNotificationActors = async () => {
    const actorIds = Array.from(new Set((state.notifications || []).map((item) => item.actor_user_id).filter(Boolean)));
    if (!actorIds.length) return;
    state.notificationActorRoleById = {};

    const commentNotificationRows = (state.notifications || [])
      .filter((item) => item.source_type === "comment" && item.source_id)
      .map((item) => ({ notificationId: item.id, sourceId: item.source_id }));
    if (commentNotificationRows.length) {
      const commentSourceIds = Array.from(new Set(commentNotificationRows.map((item) => item.sourceId)));
      const { data: commentRows } = await readClient
        .from("community_comments")
        .select("id,author_role")
        .in("id", commentSourceIds);
      const roleByCommentId = {};
      (commentRows || []).forEach((row) => {
        if (row?.id) roleByCommentId[row.id] = row.author_role || "";
      });
      commentNotificationRows.forEach((item) => {
        state.notificationActorRoleById[item.notificationId] = roleByCommentId[item.sourceId] || "";
      });
    }

    const reactionNotificationRows = (state.notifications || [])
      .filter((item) => item.source_type === "reaction" && item.source_id)
      .map((item) => ({ notificationId: item.id, sourceId: item.source_id }));
    if (reactionNotificationRows.length) {
      const reactionSourceIds = Array.from(new Set(reactionNotificationRows.map((item) => item.sourceId)));
      const { data: reactionRows } = await readClient
        .from("community_reactions")
        .select("id,actor_role")
        .in("id", reactionSourceIds);
      const roleByReactionId = {};
      (reactionRows || []).forEach((row) => {
        if (row?.id) roleByReactionId[row.id] = row.actor_role || "";
      });
      reactionNotificationRows.forEach((item) => {
        state.notificationActorRoleById[item.notificationId] = roleByReactionId[item.sourceId] || state.notificationActorRoleById[item.notificationId] || "";
      });
    }

    await loadNeighborProfiles(actorIds);
    const { data: providerRows } = await readClient
      .from("providers")
      .select("id,name,avatar_url,owner_id,category")
      .in("owner_id", actorIds);
    (providerRows || []).forEach((row) => {
      if (row?.id) state.providersById[row.id] = row;
    });
  };

  const getActivityActor = (notification) => {
    const actorUserId = notification.actor_user_id;
    const client = state.clientsById[actorUserId];
    const provider = Object.values(state.providersById).find((item) => item?.owner_id === actorUserId);
    const hintedRole = state.notificationActorRoleById[notification.id] || "";

    if (hintedRole === "client" && client) {
      return {
        name: client.full_name || "Neighbor",
        avatar: client.avatar_url || clientFallbackAvatar,
      };
    }
    if (hintedRole === "provider" && provider) {
      return {
        name: provider.name || "Plug",
        avatar: provider.avatar_url || fallbackAvatar,
      };
    }
    if (provider) {
      return {
        name: provider.name || "Plug",
        avatar: provider.avatar_url || fallbackAvatar,
      };
    }
    if (client) {
      return {
        name: client.full_name || "Neighbor",
        avatar: client.avatar_url || clientFallbackAvatar,
      };
    }
    return { name: "Neighbor", avatar: clientFallbackAvatar };
  };

  const closeActivityModal = () => {
    document.getElementById("community-activity-modal")?.remove();
  };

  const focusPost = (postId) => {
    if (!postId) return;
    const card = feedEl?.querySelector(`[data-post-id="${postId}"]`);
    if (!card) return;
    card.classList.add("community-post-highlight");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const commentsWrap = card.querySelector(".community-comments");
    commentsWrap?.classList.remove("hidden");
    window.setTimeout(() => card.classList.remove("community-post-highlight"), 2200);
  };

  const markActivityRead = async (notificationIds = []) => {
    if (!notificationIds.length) return;
    const nowIso = new Date().toISOString();
    await supabase
      .from("community_notifications")
      .update({ is_read: true, read_at: nowIso })
      .in("id", notificationIds);
    state.notifications = state.notifications.map((item) => (
      notificationIds.includes(item.id)
        ? { ...item, is_read: true, read_at: nowIso }
        : item
    ));
    setActivityBadge(state.notifications.filter((item) => !item.is_read).length);
  };

  const openActivityModal = async () => {
    await loadActivityNotifications();
    await hydrateNotificationActors();
    closeActivityModal();
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "community-activity-modal";
    modal.setAttribute("aria-hidden", "false");
    const items = state.notifications;
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Activity</h3>
          <button class="ghost-button" type="button" data-action="close">Close</button>
        </div>
        <div class="activity-list">
          ${items.length ? items.map((item) => {
            const actor = getActivityActor(item);
            return `
              <button class="activity-item ${item.is_read ? "" : "unread"}" type="button" data-action="open-activity" data-id="${item.id}" data-post-id="${item.post_id}">
                <div class="activity-item-head">
                  <img class="activity-avatar" src="${escapeHtml(actor.avatar)}" alt="${escapeHtml(actor.name)}" />
                  <strong>${escapeHtml(actor.name)}</strong>
                </div>
                <p class="activity-body">${escapeHtml(item.message || "New activity on your post")}</p>
                <span class="activity-time">${formatDate(item.created_at)}</span>
              </button>
            `;
          }).join("") : "<p class='muted'>No activity yet.</p>"}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => closeActivityModal();
    modal.querySelector("[data-action='close']")?.addEventListener("click", close);
    modal.addEventListener("click", async (event) => {
      if (event.target === modal) close();
      const itemButton = event.target.closest("button[data-action='open-activity']");
      if (!itemButton) return;
      const notificationId = itemButton.dataset.id || "";
      const postId = itemButton.dataset.postId || "";
      if (notificationId) await markActivityRead([notificationId]);
      close();
      if (postId) {
        focusPost(postId);
      }
    });
    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length) {
      await markActivityRead(unreadIds);
    }
  };

  const subscribeActivityNotifications = () => {
    if (!state.user?.id || notificationChannel) return;
    notificationChannel = supabase
      .channel(`community-activity-${state.user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "community_notifications",
        filter: `recipient_user_id=eq.${state.user.id}`,
      }, () => {
        loadActivityNotifications().catch(() => {});
      })
      .subscribe();
  };

  const setupComposerOptions = () => {
    if (!postTypeInput) return;
    const options = allowedTypeByRole[activeRole] || [];
    if (postTypeInput.tagName === "SELECT") {
      postTypeInput.innerHTML = "";
      options.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        postTypeInput.appendChild(option);
      });
    } else {
      postTypeInput.value = options[0]?.value || "";
      if (postTypeChips) {
        postTypeChips.innerHTML = options.map((item, index) => `
          <button type="button" class="community-type-chip ${index === 0 ? "active" : ""}" data-type="${item.value}">
            ${escapeHtml(item.label)}
          </button>
        `).join("");
      }
    }

    if (postTypeChips) {
      postTypeChips.scrollLeft = 0;
    }
  };

  const selectedComposerTags = () => {
    return Array.from(serviceTagsInput?.selectedOptions || [])
      .map((option) => window.NLINK_SERVICE_TAGS?.toCanonicalTag?.(option.value) || option.value)
      .filter(Boolean)
      .slice(0, 6);
  };

  const resetCommunityServiceOptions = () => {
    if (!serviceNameInput) return;
    const selectedCategory = window.NLINK_SERVICE_TAGS?.toCanonicalCategory?.(serviceCategoryInput?.value || "")
      || String(serviceCategoryInput?.value || "").trim();
    const services = window.NLINK_SERVICE_TAGS?.getServicesForCategory?.(selectedCategory) || [];
    serviceNameInput.innerHTML = '<option value="">Select service</option>';
    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service;
      option.textContent = service;
      serviceNameInput.appendChild(option);
    });
    resetCommunityTagOptions();
  };

  const resetCommunityTagOptions = () => {
    if (!serviceTagsInput) return;
    const selectedService = window.NLINK_SERVICE_TAGS?.toCanonicalService?.(serviceNameInput?.value || "")
      || String(serviceNameInput?.value || "").trim();
    const tags = window.NLINK_SERVICE_TAGS?.getTagsForService?.(selectedService) || [];
    serviceTagsInput.innerHTML = "";
    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      serviceTagsInput.appendChild(option);
    });
  };

  const getSavedProviderIds = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem("nlink_saved") || "[]");
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map((item) => item?.id).filter(Boolean)));
    } catch (_error) {
      return [];
    }
  };

  const loadFeed = async () => {
    const { data, error } = await readClient
      .from("community_posts")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    state.feed = Array.isArray(data) ? data : [];
    state.feed.sort((a, b) => {
      const scoreDiff = rankPostByLocalRelevance(b) - rankPostByLocalRelevance(a);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const hydrateAuthors = async () => {
    const providerIds = Array.from(
      new Set(state.feed.map((post) => post.author_provider_id).filter(Boolean)),
    );
    const clientIds = Array.from(
      new Set(state.feed.filter((post) => post.author_role === "client").map((post) => post.author_user_id)),
    );

    if (providerIds.length) {
      const { data } = await readClient
        .from("providers")
        .select("id,name,category,avatar_url")
        .in("id", providerIds);
      (data || []).forEach((row) => {
        state.providersById[row.id] = row;
      });
    }

    await loadNeighborProfiles(clientIds);
  };

  const hydratePostDetails = async () => {
    const postIds = state.feed.map((item) => item.id);
    if (!postIds.length) return;

    const [{ data: comments }, { data: reactions }, { data: plugs }] = await Promise.all([
      readClient.from("community_comments").select("*").in("post_id", postIds).order("created_at", { ascending: true }),
      readClient.from("community_reactions").select("post_id,reaction_type,user_id").in("post_id", postIds),
      readClient.from("community_plugs").select("post_id,plugged_provider_id,note,recommender_user_id").in("post_id", postIds),
    ]);

    state.commentsByPostId = {};
    (comments || []).forEach((comment) => {
      if (!state.commentsByPostId[comment.post_id]) state.commentsByPostId[comment.post_id] = [];
      state.commentsByPostId[comment.post_id].push(comment);
    });

    const commentProviderIds = Array.from(new Set((comments || [])
      .map((comment) => comment.author_provider_id)
      .filter(Boolean)));
    const commentClientIds = Array.from(new Set((comments || [])
      .filter((comment) => comment.author_role === "client")
      .map((comment) => comment.author_user_id)
      .filter(Boolean)));

    if (commentProviderIds.length) {
      const { data: providerRows } = await readClient
        .from("providers")
        .select("id,name,category,avatar_url")
        .in("id", commentProviderIds);
      (providerRows || []).forEach((row) => {
        state.providersById[row.id] = row;
      });
    }

    await loadNeighborProfiles(commentClientIds);

    state.reactionsByPostId = {};
    (reactions || []).forEach((reaction) => {
      if (!state.reactionsByPostId[reaction.post_id]) state.reactionsByPostId[reaction.post_id] = [];
      state.reactionsByPostId[reaction.post_id].push(reaction);
    });

    state.plugsByPostId = {};
    (plugs || []).forEach((plug) => {
      if (!state.plugsByPostId[plug.post_id]) state.plugsByPostId[plug.post_id] = [];
      state.plugsByPostId[plug.post_id].push(plug);
    });

    const pluggedProviderIds = Array.from(new Set((plugs || [])
      .map((plug) => plug.plugged_provider_id)
      .filter(Boolean)));
    if (pluggedProviderIds.length) {
      const { data: pluggedProviders } = await readClient
        .from("providers")
        .select("id,name,category,avatar_url")
        .in("id", pluggedProviderIds);
      (pluggedProviders || []).forEach((row) => {
        state.providersById[row.id] = row;
      });
    }
  };

  const loadProviderOptions = async () => {
    if (activeRole === "client") {
      const savedIds = getSavedProviderIds();
      if (!savedIds.length) {
        state.providerOptions = [];
        return;
      }
      const { data } = await supabase
        .from("providers")
        .select("id,name,category")
        .in("id", savedIds)
        .order("name", { ascending: true })
        .limit(100);
      state.providerOptions = Array.isArray(data) ? data : [];
      return;
    }

    const { data } = await supabase
      .from("providers")
      .select("id,name,category")
      .order("name", { ascending: true })
      .limit(100);
    state.providerOptions = Array.isArray(data) ? data : [];
  };

  const getPostAuthorLabel = (post) => {
    if (post.author_role === "provider") {
      const provider = state.providersById[post.author_provider_id];
      const name = provider?.name || post.author_name || "Plug";
      const category = provider?.category || "Service";
      const subtitle = post.author_subtitle || `${category} • Verified Plug`;
      return {
        displayName: name,
        subtitle,
        avatarUrl: provider?.avatar_url || post.author_avatar_url || fallbackAvatar,
        roleLabel: "plug",
      };
    }
    const client = state.clientsById[post.author_user_id];
    const selfMetaAvatar = (state.user?.id && post.author_user_id === state.user.id)
      ? (state.user.user_metadata?.client_avatar_url || "")
      : "";
    const selfMetaName = (state.user?.id && post.author_user_id === state.user.id)
      ? (state.user.user_metadata?.client_name || "")
      : "";
    const name = client?.full_name || post.author_name || "Community Neighbor";
    const locationHint = String(client?.city_state || "").trim();
    return {
      displayName: selfMetaName || name,
      subtitle: post.author_subtitle || (locationHint ? `Neighbor • ${locationHint}` : "Neighbor"),
      avatarUrl: client?.avatar_url || selfMetaAvatar || post.author_avatar_url || clientFallbackAvatar,
      roleLabel: "client",
    };
  };

  const getCommentAuthor = (comment) => {
    if (comment.author_role === "provider") {
      const provider = state.providersById[comment.author_provider_id];
      return {
        displayName: provider?.name || comment.author_name || "Plug",
        avatarUrl: provider?.avatar_url || comment.author_avatar_url || fallbackAvatar,
        roleLabel: "plug",
      };
    }
    const client = state.clientsById[comment.author_user_id];
    const selfMetaAvatar = (state.user?.id && comment.author_user_id === state.user.id)
      ? (state.user.user_metadata?.client_avatar_url || "")
      : "";
    const selfMetaName = (state.user?.id && comment.author_user_id === state.user.id)
      ? (state.user.user_metadata?.client_name || "")
      : "";
    return {
      displayName: selfMetaName || client?.full_name || comment.author_name || "Neighbor",
      avatarUrl: client?.avatar_url || selfMetaAvatar || comment.author_avatar_url || clientFallbackAvatar,
      roleLabel: "client",
    };
  };

  const getPlugMarkup = (postId) => {
    const plugs = state.plugsByPostId[postId] || [];
    if (!plugs.length) return "";
    const items = plugs.slice(0, 2).map((plug) => {
      const provider = state.providersById[plug.plugged_provider_id];
      const isNew = Boolean(
        state.lastPlugAdded
        && state.lastPlugAdded.postId === postId
        && state.lastPlugAdded.providerId === plug.plugged_provider_id,
      );
      return `<li class="${isNew ? "community-plug-highlight" : ""}"><strong>${escapeHtml(provider?.name || "Plug")}</strong>${plug.note ? ` — ${escapeHtml(plug.note)}` : ""}</li>`;
    }).join("");
    return `
      <div class="community-plug-list">
        <p class="muted">Plugged in this thread</p>
        <ul>${items}</ul>
        ${plugs.length > 2 ? `<button type="button" class="ghost-button compact community-plug-more" data-action="view-all-plugs">View All</button>` : ""}
      </div>
    `;
  };

  const openAllPlugsModal = (postId) => {
    const existing = document.getElementById("community-all-plugs-modal");
    if (existing) existing.remove();
    const plugs = state.plugsByPostId[postId] || [];
    if (!plugs.length) return;
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "community-all-plugs-modal";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Plugged Pros</h3>
          <button class="ghost-button" data-action="close">Close</button>
        </div>
        <div class="community-plug-list">
          <ul>
            ${plugs.map((plug) => {
              const provider = state.providersById[plug.plugged_provider_id];
              const isNew = Boolean(
                state.lastPlugAdded
                && state.lastPlugAdded.postId === postId
                && state.lastPlugAdded.providerId === plug.plugged_provider_id,
              );
              return `<li class="${isNew ? "community-plug-highlight" : ""}"><strong>${escapeHtml(provider?.name || "Plug")}</strong>${plug.note ? ` — ${escapeHtml(plug.note)}` : ""}</li>`;
            }).join("")}
          </ul>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector("[data-action='close']")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
  };

  const getPrimaryProviderIdForPost = (post) => {
    if (post?.author_role === "provider" && post.author_provider_id) return post.author_provider_id;
    const plugs = state.plugsByPostId[post?.id] || [];
    return plugs[0]?.plugged_provider_id || "";
  };

  const submitReport = async ({ targetType, targetId, reason }) => {
    const reportReason = String(reason || "").trim();
    if (!targetType || !targetId || !reportReason) return { ok: false, error: new Error("Missing report fields.") };
    const { error } = await supabase
      .from("community_reports")
      .insert({
        target_type: targetType,
        target_id: targetId,
        reporter_user_id: state.user.id,
        reason: reportReason.slice(0, 400),
      });
    if (error) return { ok: false, error };
    return { ok: true };
  };

  const renderRangeFilter = () => {
    if (!rangeFilterEl) return;
    const modes = [
      { value: "nearby", label: "20 mi" },
      { value: "county", label: "County" },
      { value: "statewide", label: "Statewide" },
    ];
    rangeFilterEl.innerHTML = `
      <div class="community-type-chips">
        ${modes.map((mode) => `
          <button type="button" class="community-type-chip ${state.rangeMode === mode.value ? "active" : ""}" data-range-mode="${mode.value}">
            ${mode.label}
          </button>
        `).join("")}
      </div>
    `;
    if (rangeHintEl) {
      const place = state.localOrigin.raw || "your area";
      const label = state.rangeMode === "nearby"
        ? "Nearby posts (20 mi beta)"
        : state.rangeMode === "county"
          ? "County posts"
          : "Statewide posts";
      rangeHintEl.textContent = `Showing: ${label} around ${place}`;
    }
  };

  const renderFeed = () => {
    if (!feedEl) return;
    const visibleFeed = state.feed.filter((post) => !state.hiddenPostIds.has(post.id) && isPostInScopeByRange(post));
    if (!visibleFeed.length) {
      feedEl.innerHTML = `
        <article class="community-empty-state">
          <h3>No posts yet</h3>
          <p>Start a quick post, get recommendations, then open a Plug profile when ready.</p>
          <div class="community-cta-row">
            <button class="ghost-button compact" data-empty-action="ask">Ask Community</button>
            <button class="ghost-button compact" data-empty-action="swipe">Swipe Local Plugs</button>
            <button class="ghost-button compact" data-empty-action="job">${jobsCtaLabel}</button>
          </div>
        </article>
      `;
      return;
    }

    feedEl.innerHTML = visibleFeed.map((post) => {
      const isOwner = Boolean(state.user?.id && post.author_user_id === state.user.id);
      const author = getPostAuthorLabel(post);
      const comments = state.commentsByPostId[post.id] || [];
      const reactions = state.reactionsByPostId[post.id] || [];
      const liked = reactions.some((r) => r.user_id === state.user?.id && r.reaction_type === "like");
      const likeCount = reactions.filter((r) => r.reaction_type === "like").length;
      const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
      const commentCount = comments.length;
      const rawBody = String(post.body || "");
      const commentPlaceholder = activeRole === "provider"
        ? "Share helpful guidance (no contact info/links)..."
        : "Add a comment...";
      const shouldTruncate = rawBody.length > 220;
      const bodyPreview = shouldTruncate ? `${rawBody.slice(0, 220).trim()}…` : rawBody;
      const typeLabel = String(post.post_type || "post").replaceAll("_", " ");
      const primaryProviderId = getPrimaryProviderIdForPost(post);
      return `
        <article class="community-post" data-post-id="${post.id}">
          <div class="community-post-head">
            <img class="community-avatar" src="${escapeHtml(author.avatarUrl)}" alt="${escapeHtml(author.displayName)}" />
            <div class="community-author">
              <p class="community-author-name">${escapeHtml(author.displayName)}</p>
              <p class="community-author-sub">${escapeHtml(author.subtitle)} • ${formatDate(post.created_at)}</p>
            </div>
            <div class="community-menu-wrap">
              <button class="ghost-button compact community-more-button" type="button" data-action="menu-toggle" aria-label="More options">
                <span class="material-symbols-rounded" aria-hidden="true">more_horiz</span>
              </button>
              <div class="community-post-menu hidden">
                <button type="button" data-action="hide-post">Hide post</button>
                <button type="button" data-action="report-post">Report post</button>
                ${isOwner ? '<button type="button" class="danger" data-action="delete-post">Delete post</button>' : ""}
              </div>
            </div>
          </div>
          <p class="community-post-type">${escapeHtml(typeLabel)}</p>
          <p class="community-body" data-body-full="${escapeHtml(rawBody)}" data-body-preview="${escapeHtml(bodyPreview)}">${escapeHtml(bodyPreview)}</p>
          ${post.image_url ? `<img class="community-post-photo" src="${escapeHtml(post.image_url)}" alt="Community post image" />` : ""}
          ${shouldTruncate ? '<button class="community-see-more" data-action="expand">see more</button>' : ""}
          <div class="community-meta">
            ${post.location_text ? `<span class="pill">${escapeHtml(post.location_text)}</span>` : ""}
            ${post.service_category ? `<span class="pill">${escapeHtml(post.service_category)}</span>` : ""}
            ${post.service_name ? `<span class="pill">${escapeHtml(post.service_name)}</span>` : ""}
            ${tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
          </div>
          ${getPlugMarkup(post.id)}
          <div class="community-social-row">
            <span>${likeCount} likes</span>
            <span>${commentCount} comments</span>
          </div>
          <div class="community-actions">
            <button class="community-action-btn ${liked ? "active" : ""}" data-action="like"><span class="material-symbols-rounded">favorite</span>Like</button>
            <button class="community-action-btn" data-action="comment"><span class="material-symbols-rounded">chat_bubble</span>Comment</button>
            <button class="community-action-btn" data-action="plug"><span class="material-symbols-rounded">person_add</span>Plug</button>
          </div>
          <div class="community-cta-row">
            ${primaryProviderId ? '<button class="ghost-button compact" data-action="viewplug">View Plug</button>' : ""}
            <button class="ghost-button compact" data-action="swipe">Swipe Local Plugs</button>
            <button class="ghost-button compact" data-action="job">${jobsCtaLabel}</button>
          </div>
          <div class="community-comments hidden">
            <div class="community-comment-list">
              ${comments.length
                ? comments.map((comment) => {
                  const commentAuthor = getCommentAuthor(comment);
                  const providerTipBadge = comment.author_role === "provider"
                    ? '<span class="community-pro-tip-badge">Pro Tip</span>'
                    : "";
                  return `
                    <div class="community-comment-row">
                      <img class="community-comment-avatar" src="${escapeHtml(commentAuthor.avatarUrl)}" alt="${escapeHtml(commentAuthor.displayName)}" />
                      <p><strong>${escapeHtml(commentAuthor.displayName)}:</strong> ${escapeHtml(comment.body)} ${providerTipBadge}</p>
                      <button type="button" class="ghost-button compact" data-action="report-comment" data-comment-id="${comment.id}">Report</button>
                    </div>
                  `;
                }).join("")
                : "<p class='muted'>No comments yet.</p>"}
            </div>
            <form class="community-comment-form">
              <input type="text" name="comment" placeholder="${escapeHtml(commentPlaceholder)}" maxlength="500" required />
              <button class="primary-button" type="submit">Send</button>
            </form>
          </div>
        </article>
      `;
    }).join("");
  };

  const refreshFeed = async () => {
    try {
      await runWithSessionRecovery(async () => {
        await loadFeed();
        await Promise.all([hydrateAuthors(), hydratePostDetails()]);
      });
      renderFeed();
      await loadActivityNotifications();
    } catch (error) {
      state.feed = [];
      renderFeed();
      setStatus(getErrorText(error, "Could not load community feed."), "error");
    }
  };

  const addReaction = async (postId) => {
    await runWithSessionRecovery(async () => {
      const existing = (state.reactionsByPostId[postId] || []).find((item) => item.user_id === state.user.id && item.reaction_type === "like");
      if (existing) {
        await supabase
          .from("community_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", state.user.id)
          .eq("reaction_type", "like");
      } else {
        const insertPayload = {
          post_id: postId,
          user_id: state.user.id,
          reaction_type: "like",
          actor_role: activeRole,
          actor_provider_id: activeRole === "provider" ? state.providerId : null,
        };
        const insertWithRole = await supabase
          .from("community_reactions")
          .insert(insertPayload);
        if (insertWithRole.error && (insertWithRole.error.code === "42703" || insertWithRole.error.code === "PGRST204" || insertWithRole.error.code === "PGRST205")) {
          const fallback = await supabase
            .from("community_reactions")
            .insert({ post_id: postId, user_id: state.user.id, reaction_type: "like" });
          if (fallback.error) throw fallback.error;
        } else if (insertWithRole.error) {
          throw insertWithRole.error;
        }
        await logEvent("community_reaction_added", postId, { reaction: "like" });
      }
    });
    await refreshFeed();
  };

  const addComment = async (postId, message) => {
    const payload = {
      post_id: postId,
      author_user_id: state.user.id,
      author_role: activeRole,
      author_name: state.currentAuthor?.name || null,
      author_avatar_url: state.currentAuthor?.avatarUrl || null,
      body: message.trim(),
    };
    if (activeRole === "provider") payload.author_provider_id = state.providerId;
    await runWithSessionRecovery(async () => {
      const { error } = await supabase.from("community_comments").insert(payload);
      if (error) throw error;
    });
    await logEvent("community_comment_created", postId, { role: activeRole });
  };

  const openPlugModal = (postId) => {
    const existing = document.getElementById("community-plug-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "community-plug-modal";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Plug a Pro</h3>
          <button class="ghost-button" data-action="close">Close</button>
        </div>
        <form id="community-plug-form" class="modal-form">
          <label class="input-field">
            <span>Select Plug</span>
            <select id="community-plug-provider" required>
              <option value="">Choose a Plug</option>
              ${state.providerOptions.map((provider) => `<option value="${provider.id}">${escapeHtml(provider.name || "Plug")} (${escapeHtml(provider.category || "Service")})</option>`).join("")}
            </select>
          </label>
          ${activeRole === "client" && !state.providerOptions.length
            ? `<p class="muted">No saved Plugs yet.</p><a class="ghost-button compact" href="${escapeHtml(discoveryHref)}">Find Plugs</a>`
            : ""}
          <label class="input-field">
            <span>Note (optional)</span>
            <input type="text" id="community-plug-note" maxlength="300" placeholder="Why this Plug is a good fit" />
          </label>
          <button class="primary-button" type="submit" ${!state.providerOptions.length ? "disabled" : ""}>Save Plug</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector("[data-action='close']")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector("#community-plug-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const providerId = modal.querySelector("#community-plug-provider")?.value || "";
      const note = modal.querySelector("#community-plug-note")?.value || "";
      if (!providerId) return;
      const { error } = await supabase
        .from("community_plugs")
        .insert({
          post_id: postId,
          recommender_user_id: state.user.id,
          plugged_provider_id: providerId,
          note: note.trim() || null,
        });
      if (error) {
        setStatus(error.message || "Could not add Plug.", "error");
        return;
      }
      await logEvent("community_plug_created", postId, { plugged_provider_id: providerId });
      state.lastPlugAdded = { postId, providerId, at: Date.now() };
      close();
      await refreshFeed();
      setStatus("Plug added.", "success");
    });
  };

  const onFeedClick = async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = event.target.closest("[data-post-id]");
    if (!card) return;
    const postId = card.dataset.postId;
    const action = button.dataset.action;
    const closeMenus = () => {
      feedEl.querySelectorAll(".community-post-menu").forEach((menu) => menu.classList.add("hidden"));
    };

    if (action !== "menu-toggle") closeMenus();

    if (action === "menu-toggle") {
      const menu = button.parentElement?.querySelector(".community-post-menu");
      if (!menu) return;
      const willOpen = menu.classList.contains("hidden");
      closeMenus();
      menu.classList.toggle("hidden", !willOpen);
      return;
    }

    if (action === "hide-post") {
      state.hiddenPostIds.add(postId);
      saveHiddenPostIds();
      renderFeed();
      setStatus("Post hidden from your feed.", "success");
      return;
    }

    if (action === "report-post") {
      const reason = window.prompt("Report reason (optional):", "Spam or inappropriate");
      if (reason === null) return;
      const submitted = await submitReport({
        targetType: "post",
        targetId: postId,
        reason: reason.trim() || "Spam or inappropriate",
      });
      if (!submitted.ok) {
        setStatus(getErrorText(submitted.error, "Could not submit report."), "error");
        return;
      }
      setStatus("Report submitted.", "success");
      return;
    }

    if (action === "report-comment") {
      const commentId = button.dataset.commentId || "";
      if (!commentId) return;
      const reason = window.prompt("Report reason:", "Spam or inappropriate");
      if (reason === null) return;
      const submitted = await submitReport({
        targetType: "comment",
        targetId: commentId,
        reason: reason.trim() || "Spam or inappropriate",
      });
      if (!submitted.ok) {
        setStatus(getErrorText(submitted.error, "Could not submit report."), "error");
        return;
      }
      setStatus("Comment reported.", "success");
      return;
    }

    if (action === "delete-post") {
      const post = state.feed.find((item) => item.id === postId);
      const isOwner = Boolean(post && state.user?.id && post.author_user_id === state.user.id);
      if (!isOwner) {
        setStatus("Only the post owner can delete this post.", "error");
        return;
      }
      const confirmed = window.confirm("Delete this post?");
      if (!confirmed) return;
      const { error } = await supabase
        .from("community_posts")
        .update({ is_archived: true })
        .eq("id", postId)
        .eq("author_user_id", state.user.id);
      if (error) {
        setStatus(error.message || "Could not delete post.", "error");
        return;
      }
      await refreshFeed();
      setStatus("Post deleted.", "success");
      return;
    }

    if (action === "expand") {
      const bodyEl = card.querySelector(".community-body");
      if (!bodyEl) return;
      const isExpanded = bodyEl.dataset.expanded === "true";
      bodyEl.textContent = isExpanded ? bodyEl.dataset.bodyPreview || "" : bodyEl.dataset.bodyFull || "";
      bodyEl.dataset.expanded = isExpanded ? "false" : "true";
      button.textContent = isExpanded ? "see more" : "see less";
      return;
    }

    if (action === "like") {
      await addReaction(postId);
      return;
    }
    if (action === "comment") {
      const commentsWrap = card.querySelector(".community-comments");
      commentsWrap?.classList.toggle("hidden");
      return;
    }
    if (action === "plug") {
      openPlugModal(postId);
      return;
    }
    if (action === "view-all-plugs") {
      openAllPlugsModal(postId);
      return;
    }
    if (action === "viewplug") {
      const post = state.feed.find((item) => item.id === postId);
      const providerId = getPrimaryProviderIdForPost(post);
      if (providerId) {
        await logEvent("community_cta_view_plug", postId, { provider_id: providerId });
        window.location.href = `${discoveryHref}?plug=${encodeURIComponent(providerId)}`;
      }
      return;
    }
    if (action === "swipe") {
      await logEvent("community_cta_swipe", postId, { target: discoveryHref });
      window.location.href = discoveryHref;
      return;
    }
    if (action === "job") {
      await logEvent("community_cta_post_job", postId, { target: jobsHref });
      window.location.href = jobsHref;
      return;
    }
    
  };

  const onFeedSubmit = async (event) => {
    const form = event.target.closest(".community-comment-form");
    if (!form) return;
    event.preventDefault();
    const card = form.closest("[data-post-id]");
    const postId = card?.dataset.postId;
    const input = form.querySelector("input[name='comment']");
    const message = input?.value.trim() || "";
    if (!postId || !message) return;
    try {
      await addComment(postId, message);
      await refreshFeed();
      setStatus("Comment posted.", "success");
    } catch (error) {
      setStatus(getErrorText(error, "Could not post comment."), "error");
    }
  };

  const onComposerSubmit = async (event) => {
    event.preventDefault();
    if (!state.user?.id) return;
    const body = postBodyInput?.value.trim() || "";
    if (!body) {
      setStatus("Add a post message first.", "error");
      return;
    }
    const selectedServiceCategory = window.NLINK_SERVICE_TAGS?.toCanonicalCategory?.(serviceCategoryInput?.value || "")
      || String(serviceCategoryInput?.value || "").trim();
    const selectedServiceName = window.NLINK_SERVICE_TAGS?.toCanonicalService?.(serviceNameInput?.value || "")
      || String(serviceNameInput?.value || "").trim();
    const payload = {
      author_user_id: state.user.id,
      author_role: activeRole,
      author_name: state.currentAuthor?.name || null,
      author_avatar_url: state.currentAuthor?.avatarUrl || null,
      author_subtitle: state.currentAuthor?.subtitle || null,
      post_type: postTypeInput?.value || (activeRole === "provider" ? "showcase" : "ask"),
      body,
      location_text: state.localOrigin.raw || null,
      service_category: selectedServiceCategory || null,
      service_name: selectedServiceName || null,
      tags: selectedComposerTags(),
    };
    if (activeRole === "provider") payload.author_provider_id = state.providerId;

    try {
      setStatus("Posting to community...", "info");
      let uploadedImage = null;
      if (state.composerPhoto?.blob && postImageColumnAvailable) {
        setStatus("Uploading photo...", "info");
        uploadedImage = await uploadCommunityImage(state.composerPhoto.blob, state.composerPhoto.fileName || "community-photo.jpg");
        if (uploadedImage?.url) payload.image_url = uploadedImage.url;
      }
      const data = await runWithSessionRecovery(async () => {
        let result = await supabase.from("community_posts").insert(payload).select("id").single();
        if (result.error && isSchemaMissingColumnError(result.error)) {
          postImageColumnAvailable = false;
          if (uploadedImage?.storagePath) {
            await supabase.storage.from("provider-media").remove([uploadedImage.storagePath]);
          }
          delete payload.image_url;
          result = await supabase.from("community_posts").insert(payload).select("id").single();
        }
        if (result.error) throw result.error;
        return result.data;
      });
      await logEvent("community_post_created", data?.id || null, { role: activeRole, post_type: payload.post_type });
      postForm.reset();
      clearComposerPhoto();
      resetCommunityServiceOptions();
      await refreshFeed();
      if (!postImageColumnAvailable) {
        setStatus("Post published. Photo support needs DB migration to enable.", "info");
      } else {
        setStatus("Post published.", "success");
      }
    } catch (error) {
      setStatus(getErrorText(error, "Could not publish post."), "error");
    }
  };

  const init = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) {
      window.location.href = "/shared/login-client.html";
      return;
    }
    state.user = user;
    subscribeActivityNotifications();
    loadHiddenPostIds();

    if (composerAvatarEl) {
      if (activeRole === "provider") {
        const { data: providerRow } = await supabase
          .from("providers")
          .select("name,category,avatar_url,location")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        const metaAvatar = user.user_metadata?.provider_avatar_url || "";
        const avatar = providerRow?.avatar_url || metaAvatar || "../assets/plugprofilepic.png";
        const locationLabel = normalizeLocationText(providerRow?.location || "");
        const locParsed = parseCityState(locationLabel);
        state.currentAuthor = {
          name: providerRow?.name || user.user_metadata?.provider_business_name || "Plug",
          avatarUrl: avatar,
          subtitle: `${providerRow?.category || "Service"} • Verified Plug${locationLabel ? ` • ${locationLabel}` : ""}`,
        };
        state.localOrigin = {
          city: locParsed.city,
          state: locParsed.state,
          county: resolveCounty(locParsed.key),
          raw: locationLabel,
        };
        setSafeAvatar(composerAvatarEl, avatar, "../assets/plugprofilepic.png");
      } else {
        const metaAvatar = user.user_metadata?.client_avatar_url || "";
        const { data: clientRow } = await supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        const avatar = clientRow?.avatar_url || metaAvatar || clientFallbackAvatar;
        const locationLabel = normalizeLocationText(clientRow?.location || "");
        const locParsed = parseCityState(locationLabel);
        state.currentAuthor = {
          name: clientRow?.full_name || user.user_metadata?.client_name || "Neighbor",
          avatarUrl: avatar,
          subtitle: locationLabel ? `Neighbor • ${locationLabel}` : "Neighbor",
        };
        state.localOrigin = {
          city: locParsed.city,
          state: locParsed.state,
          county: resolveCounty(locParsed.key),
          raw: locationLabel,
        };
        setSafeAvatar(composerAvatarEl, avatar, clientFallbackAvatar);
      }
    }
    await loadProviderIdentity();
    if (activeRole === "provider" && !state.providerId) {
      setStatus("Plug profile required before posting as a Plug.", "error");
    }

    setupComposerOptions();
    if (window.NLINK_SERVICE_TAGS && serviceCategoryInput) {
      serviceCategoryInput.innerHTML = '<option value="">Select category</option>';
      (window.NLINK_SERVICE_TAGS.categories || []).forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        serviceCategoryInput.appendChild(option);
      });
      serviceCategoryInput.addEventListener("change", resetCommunityServiceOptions);
      serviceNameInput?.addEventListener("change", resetCommunityTagOptions);
      resetCommunityServiceOptions();
    }
    if (postForm && !postForm.querySelector(".community-composer-hint")) {
      const hint = document.createElement("p");
      hint.className = "community-composer-hint";
      hint.textContent = "Keep it service-related. No phone, email, or links.";
      const actions = postForm.querySelector(".community-compose-actions");
      postForm.insertBefore(hint, actions || null);
    }
    try {
      await loadProviderOptions();
    } catch (_error) {
      // Optional for feed browsing; composer plug modal can still open once reloaded.
    }
    renderRangeFilter();
    await refreshFeed();
    const focusPostId = new URLSearchParams(window.location.search).get("post");
    if (focusPostId) {
      focusPost(focusPostId);
    }
    if (state.feed.length) setStatus("Community loaded.", "success");
  };

  postForm?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-composer-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.composerAction || "";
    if (action === "photo") {
      composerPhotoInput?.click();
      return;
    }
    if (action === "feeling") {
      postTypeInput.value = "recommendation";
    } else if (action === "tip") {
      postTypeInput.value = "tip";
    }
    postTypeChips?.querySelectorAll(".community-type-chip").forEach((node) => {
      node.classList.toggle("active", node.dataset.type === postTypeInput.value);
    });
  });

  composerPhotoInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (typeof window.nlinkOpenImageCropper !== "function") {
        throw new Error("Image cropper is unavailable.");
      }
      const crop = await window.nlinkOpenImageCropper({
        file,
        aspectRatio: 4 / 3,
        circle: false,
        title: "Adjust Community Image",
        outputWidth: 1400,
      });
      if (!crop?.blob || !crop.previewDataUrl) {
        clearComposerPhoto();
        return;
      }
      state.composerPhoto = {
        blob: crop.blob,
        previewDataUrl: crop.previewDataUrl,
        fileName: file.name || "community-photo.jpg",
      };
      updateComposerPhotoPreview();
      setStatus(`Photo ready: ${formatUploadFileName(file.name)}.`, "success");
    } catch (error) {
      clearComposerPhoto();
      setStatus(getErrorText(error, "Could not prepare photo."), "error");
    } finally {
      event.target.value = "";
    }
  });

  composerPhotoRemove?.addEventListener("click", () => {
    clearComposerPhoto();
    setStatus("Photo removed.", "info");
  });
  moreFieldsToggle?.addEventListener("click", () => {
    const expanded = moreFieldsWrap ? !moreFieldsWrap.classList.contains("hidden") : false;
    moreFieldsWrap?.classList.toggle("hidden", expanded);
    if (moreFieldsToggle) {
      moreFieldsToggle.textContent = expanded ? "Add service details" : "Hide service details";
    }
  });

  postTypeChips?.addEventListener("click", (event) => {
    const chip = event.target.closest(".community-type-chip");
    if (!chip) return;
    const nextType = chip.dataset.type || "";
    if (!nextType || !postTypeInput) return;
    postTypeInput.value = nextType;
    postTypeChips.querySelectorAll(".community-type-chip").forEach((node) => {
      node.classList.toggle("active", node === chip);
    });
  });
  rangeFilterEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-range-mode]");
    if (!button) return;
    const nextMode = String(button.dataset.rangeMode || "");
    if (!nextMode || nextMode === state.rangeMode) return;
    state.rangeMode = nextMode;
    renderRangeFilter();
    renderFeed();
  });
  postForm?.addEventListener("submit", onComposerSubmit);
  feedEl?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-empty-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.emptyAction || "";
    if (action === "ask") {
      postTypeInput.value = activeRole === "provider" ? "tip" : "ask";
      postTypeChips?.querySelectorAll(".community-type-chip").forEach((node) => {
        node.classList.toggle("active", node.dataset.type === postTypeInput.value);
      });
      postBodyInput?.focus();
      return;
    }
    if (action === "swipe") {
      window.location.href = discoveryHref;
      return;
    }
    if (action === "job") {
      window.location.href = jobsHref;
    }
  });
  feedEl?.addEventListener("click", onFeedClick);
  document.addEventListener("click", (event) => {
    if (!feedEl) return;
    if (event.target.closest(".community-menu-wrap")) return;
    feedEl.querySelectorAll(".community-post-menu").forEach((menu) => menu.classList.add("hidden"));
  });
  feedEl?.addEventListener("submit", onFeedSubmit);
  activityButtonEl?.addEventListener("click", () => {
    openActivityModal().catch((error) => {
      setStatus(getErrorText(error, "Could not open activity."), "error");
    });
  });

  init();
})();
