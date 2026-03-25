(function initCommunityPage() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;
  const createPublicSupabaseClient = () => {
    const config = window.NLINK_SUPABASE || {};
    if (!window.supabase || !config.url || !config.anonKey) return null;
    return window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  };
  const publicSupabase = createPublicSupabaseClient();
  let readClient = supabase;

  const root = document.getElementById("community-root");
  if (!root) return;

  const activeRole = root.dataset.role === "provider" ? "provider" : "client";
  const discoveryHref = root.dataset.discoveryHref || "../client/discover.html";
  const jobsHref = root.dataset.jobsHref || "../client/client-jobs.html";
  const statusEl = document.getElementById("community-status");
  const postForm = document.getElementById("community-post-form");
  const postTypeInput = document.getElementById("community-post-type");
  const postTypeChips = document.getElementById("community-post-type-chips");
  const postBodyInput = document.getElementById("community-post-body");
  const feedEl = document.getElementById("community-feed");
  const composerAvatarEl = document.getElementById("community-composer-avatar");

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
  };
  const fallbackAvatar = "../assets/nlinkiconblk.png";
  const clientFallbackAvatar = "../assets/blankpropic.png";
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
    return [];
  };

  const loadFeed = async () => {
    let { data, error } = await readClient
      .from("community_posts")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(60);
    if ((error || !Array.isArray(data)) && publicSupabase && isTransportError(error)) {
      const retry = await publicSupabase
        .from("community_posts")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(60);
      data = retry.data;
      error = retry.error;
      readClient = publicSupabase;
    } else {
      readClient = supabase;
    }
    if (error) throw error;
    state.feed = Array.isArray(data) ? data : [];
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

    if (clientIds.length) {
      const { data } = await readClient
        .from("clients")
        .select("user_id,full_name,avatar_url")
        .in("user_id", clientIds);
      (data || []).forEach((row) => {
        state.clientsById[row.user_id] = row;
      });
    }
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

    if (commentClientIds.length) {
      const { data: clientRows } = await readClient
        .from("clients")
        .select("user_id,full_name,avatar_url")
        .in("user_id", commentClientIds);
      (clientRows || []).forEach((row) => {
        state.clientsById[row.user_id] = row;
      });
    }

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
  };

  const loadProviderOptions = async () => {
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
    return {
      displayName: selfMetaName || name,
      subtitle: post.author_subtitle || "Neighbor",
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
      return `<li><strong>${escapeHtml(provider?.name || "Plug")}</strong>${plug.note ? ` — ${escapeHtml(plug.note)}` : ""}</li>`;
    }).join("");
    return `
      <div class="community-plug-list">
        <p class="muted">Plugged in this thread</p>
        <ul>${items}</ul>
      </div>
    `;
  };

  const renderFeed = () => {
    if (!feedEl) return;
    const visibleFeed = state.feed.filter((post) => !state.hiddenPostIds.has(post.id));
    if (!visibleFeed.length) {
      feedEl.innerHTML = "<p class='muted'>No community posts yet. Start the first one.</p>";
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
      const shouldTruncate = rawBody.length > 220;
      const bodyPreview = shouldTruncate ? `${rawBody.slice(0, 220).trim()}…` : rawBody;
      const typeLabel = String(post.post_type || "post").replaceAll("_", " ");
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
            ${post.author_role === "provider" && post.author_provider_id
              ? `<button class="ghost-button compact" data-action="viewplug">View Plug</button>`
              : ""}
            <button class="ghost-button compact" data-action="swipe">Swipe Local Plugs</button>
            <button class="ghost-button compact" data-action="job">Post Job</button>
          </div>
          <div class="community-comments hidden">
            <div class="community-comment-list">
              ${comments.length
                ? comments.map((comment) => {
                  const commentAuthor = getCommentAuthor(comment);
                  return `
                    <div class="community-comment-row">
                      <img class="community-comment-avatar" src="${escapeHtml(commentAuthor.avatarUrl)}" alt="${escapeHtml(commentAuthor.displayName)}" />
                      <p><strong>${escapeHtml(commentAuthor.displayName)}:</strong> ${escapeHtml(comment.body)}</p>
                    </div>
                  `;
                }).join("")
                : "<p class='muted'>No comments yet.</p>"}
            </div>
            <form class="community-comment-form">
              <input type="text" name="comment" placeholder="Add a comment..." maxlength="500" required />
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
        await supabase
          .from("community_reactions")
          .insert({ post_id: postId, user_id: state.user.id, reaction_type: "like" });
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
          <label class="input-field">
            <span>Note (optional)</span>
            <input type="text" id="community-plug-note" maxlength="300" placeholder="Why this Plug is a good fit" />
          </label>
          <button class="primary-button" type="submit">Save Plug</button>
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
      close();
      await refreshFeed();
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
      setStatus("Report submitted. Thank you.", "success");
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
    if (action === "viewplug") {
      const post = state.feed.find((item) => item.id === postId);
      if (post?.author_provider_id) {
        await logEvent("community_cta_view_plug", postId, { provider_id: post.author_provider_id });
        window.location.href = `${discoveryHref}?plug=${encodeURIComponent(post.author_provider_id)}`;
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
    const payload = {
      author_user_id: state.user.id,
      author_role: activeRole,
      author_name: state.currentAuthor?.name || null,
      author_avatar_url: state.currentAuthor?.avatarUrl || null,
      author_subtitle: state.currentAuthor?.subtitle || null,
      post_type: postTypeInput?.value || (activeRole === "provider" ? "showcase" : "ask"),
      body,
      location_text: null,
      service_category: null,
      service_name: null,
      tags: selectedComposerTags(),
    };
    if (activeRole === "provider") payload.author_provider_id = state.providerId;

    try {
      setStatus("Posting to community...", "info");
      const data = await runWithSessionRecovery(async () => {
        const result = await supabase.from("community_posts").insert(payload).select("id").single();
        if (result.error) throw result.error;
        return result.data;
      });
      await logEvent("community_post_created", data?.id || null, { role: activeRole, post_type: payload.post_type });
      postForm.reset();
      await refreshFeed();
      setStatus("Post published.", "success");
    } catch (error) {
      setStatus(getErrorText(error, "Could not publish post."), "error");
    }
  };

  const init = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) {
      window.location.href = "/shared/login-choice.html";
      return;
    }
    state.user = user;
    loadHiddenPostIds();

    if (composerAvatarEl) {
      if (activeRole === "provider") {
        const { data: providerRow } = await supabase
          .from("providers")
          .select("name,category,avatar_url")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        const metaAvatar = user.user_metadata?.provider_avatar_url || "";
        const avatar = providerRow?.avatar_url || metaAvatar || "../assets/nlinkiconblk.png";
        state.currentAuthor = {
          name: providerRow?.name || user.user_metadata?.provider_business_name || "Plug",
          avatarUrl: avatar,
          subtitle: `${providerRow?.category || "Service"} • Verified Plug`,
        };
        setSafeAvatar(composerAvatarEl, avatar, "../assets/nlinkiconblk.png");
      } else {
        const metaAvatar = user.user_metadata?.client_avatar_url || "";
        const { data: clientRow } = await supabase
          .from("clients")
          .select("full_name,avatar_url")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        const avatar = clientRow?.avatar_url || metaAvatar || clientFallbackAvatar;
        state.currentAuthor = {
          name: clientRow?.full_name || user.user_metadata?.client_name || "Neighbor",
          avatarUrl: avatar,
          subtitle: "Neighbor",
        };
        setSafeAvatar(composerAvatarEl, avatar, clientFallbackAvatar);
      }
    }
    await loadProviderIdentity();
    if (activeRole === "provider" && !state.providerId) {
      setStatus("Plug profile required before posting as a Plug.", "error");
    }

    setupComposerOptions();
    try {
      await loadProviderOptions();
    } catch (_error) {
      // Optional for feed browsing; composer plug modal can still open once reloaded.
    }
    await refreshFeed();
    if (state.feed.length) setStatus("Community loaded.", "success");
  };

  postForm?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-composer-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.composerAction || "";
    if (action === "photo") {
      setStatus("Photo uploads for community posts are coming in the next pass.", "info");
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
  postForm?.addEventListener("submit", onComposerSubmit);
  feedEl?.addEventListener("click", onFeedClick);
  document.addEventListener("click", (event) => {
    if (!feedEl) return;
    if (event.target.closest(".community-menu-wrap")) return;
    feedEl.querySelectorAll(".community-post-menu").forEach((menu) => menu.classList.add("hidden"));
  });
  feedEl?.addEventListener("submit", onFeedSubmit);

  init();
})();
