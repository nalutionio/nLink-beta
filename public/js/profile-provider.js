(() => {
const profileSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const nameEl = document.getElementById("provider-name");
const emailEl = document.getElementById("provider-email");
const avatarEl = document.getElementById("provider-avatar");
const statusEl = document.getElementById("profile-status");
const deleteProfileButton = document.getElementById("delete-provider-profile");
const infoEmailEl = document.getElementById("provider-info-email");
const infoEmailVerifyEl = document.getElementById("provider-info-email-verify");
const infoPhoneEl = document.getElementById("provider-info-phone");
const infoPhoneVerifyEl = document.getElementById("provider-info-phone-verify");
const infoAddressEl = document.getElementById("provider-info-address");
const statViewsEl = document.getElementById("profile-stat-views");
const statSavesEl = document.getElementById("profile-stat-saves");
const statProposalsEl = document.getElementById("profile-stat-proposals");
const statMessagesEl = document.getElementById("profile-stat-messages");
const ratingValueEl = document.getElementById("service-rating-value");
const ratingCountEl = document.getElementById("service-rating-count");
const ratingStarsEl = document.getElementById("service-rating-stars");
const commentsListEl = document.getElementById("service-comments-list");
const commentsMoreButton = document.getElementById("service-comments-more");
const primaryProviderKey = "nlink_primary_provider_id";

const isPlaceholderUrl = (value) => typeof value === "string" && value.toLowerCase().includes("placeholder");

const pickBestProviderRecord = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const preferredId = localStorage.getItem(primaryProviderKey);
  const score = (row) => {
    let total = 0;
    if (preferredId && row.id === preferredId) total += 1;
    if (row.name) total += 2;
    if (row.avatar_url && !isPlaceholderUrl(row.avatar_url)) total += 4;
    if (row.banner_url && !isPlaceholderUrl(row.banner_url)) total += 2;
    if (row.hero_url && !isPlaceholderUrl(row.hero_url)) total += 1;
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

const isMissingTableError = (error) => Boolean(error)
  && (
    error.code === "42P01"
    || error.code === "PGRST205"
    || error.status === 404
  );

const safeHeadCount = async (queryBuilder) => {
  const { count, error } = await queryBuilder;
  if (isMissingTableError(error)) return { count: 0, error: null };
  return { count: Number(count || 0), error };
};

const renderStars = (rating) => {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  return "★".repeat(fullStars) + (hasHalf ? "☆" : "") + "✩".repeat(emptyStars);
};

const createReviewCard = (review) => {
  const card = document.createElement("article");
  card.className = "review-card";
  const nameNode = document.createElement("strong");
  nameNode.textContent = review.name || "Anonymous";
  const ratingNode = document.createElement("div");
  const ratingValue = Number(review.rating) || 0;
  ratingNode.textContent = `${renderStars(ratingValue)} ${ratingValue.toFixed(1)}`;
  const textNode = document.createElement("p");
  textNode.textContent = (review.text || "").trim() || "No comment text provided.";
  card.append(nameNode, ratingNode, textNode);
  return card;
};

const closeCommentsModal = () => {
  document.getElementById("service-comments-modal")?.remove();
};

const openCommentsModal = () => {
  const reviews = Array.isArray(window.__providerReviews) ? window.__providerReviews : [];
  if (reviews.length <= 2) return;
  closeCommentsModal();

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "service-comments-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>All Comments (${reviews.length})</h3>
        <button class="ghost-button" type="button" data-action="close">Close</button>
      </div>
      <div class="comments-list"></div>
    </div>
  `;

  const list = modal.querySelector(".comments-list");
  reviews.forEach((review) => list?.appendChild(createReviewCard(review)));
  document.body.appendChild(modal);
  modal.querySelector("[data-action='close']")?.addEventListener("click", closeCommentsModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCommentsModal();
  });
};

const renderReviewsUi = (reviews) => {
  const normalized = Array.isArray(reviews) ? reviews : [];
  window.__providerReviews = normalized;

  const count = normalized.length;
  const average = count
    ? normalized.reduce((sum, row) => sum + (Number(row.rating) || 0), 0) / count
    : 0;

  if (ratingValueEl) ratingValueEl.textContent = count ? average.toFixed(1) : "Unrated";
  if (ratingCountEl) ratingCountEl.textContent = count ? `${count} reviews` : "No reviews yet";
  if (ratingStarsEl) ratingStarsEl.textContent = count ? renderStars(average) : "☆☆☆☆☆";

  if (!commentsListEl) return;
  commentsListEl.innerHTML = "";
  if (!count) {
    commentsListEl.innerHTML = "<p class=\"muted\">No reviews yet.</p>";
    commentsMoreButton?.classList.add("hidden");
    return;
  }

  normalized.slice(0, 2).forEach((review) => commentsListEl.appendChild(createReviewCard(review)));
  if (commentsMoreButton) {
    const hasMore = count > 2;
    commentsMoreButton.classList.toggle("hidden", !hasMore);
    commentsMoreButton.textContent = hasMore ? `See More (${count - 2})` : "See More";
  }
};


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

const loadProvider = async () => {
  if (!profileSupabase) return;
  const { data: sessionData } = await profileSupabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;
  const metadataBusinessName = user.user_metadata?.provider_business_name || "";
  const metadataAvatar = user.user_metadata?.provider_avatar_url || "";

  if (nameEl && metadataBusinessName) {
    nameEl.textContent = metadataBusinessName;
  }
  if (emailEl) emailEl.textContent = user.email || "";
  if (infoEmailEl) infoEmailEl.textContent = user.email || "Not set";
  if (infoEmailVerifyEl) infoEmailVerifyEl.textContent = user.email_confirmed_at ? "Verified" : "Pending";
  if (infoPhoneEl) infoPhoneEl.textContent = user.phone || user.user_metadata?.contact_phone || "Not set";
  if (infoPhoneVerifyEl) infoPhoneVerifyEl.textContent = user.phone_confirmed_at ? "Verified" : "Pending";

  let provider = null;
  const preferredId = localStorage.getItem(primaryProviderKey);
  if (preferredId) {
    const { data: preferred, error: preferredError } = await profileSupabase
      .from("providers")
      .select("id,name,avatar_url,banner_url,hero_url,created_at")
      .eq("id", preferredId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!preferredError && preferred) {
      provider = preferred;
    }
  }

  if (!provider) {
    const { data, error } = await profileSupabase
      .from("providers")
      .select("id,name,avatar_url,banner_url,hero_url,created_at")
      .eq("owner_id", user.id)
      .limit(25);

    if (error || !data) {
      if (nameEl && !metadataBusinessName) nameEl.textContent = "Your business";
      return;
    }
    provider = pickBestProviderRecord(data);
    if (!provider) {
      if (nameEl && !metadataBusinessName) nameEl.textContent = "Your business";
      return;
    }
  }
  if (provider.id) localStorage.setItem(primaryProviderKey, provider.id);

  if (nameEl) nameEl.textContent = provider.name || metadataBusinessName || "Your business";

  if (provider.id) {
    const { data: profileData } = await profileSupabase
      .from("provider_profiles")
      .select("phone,address")
      .eq("provider_id", provider.id)
      .maybeSingle();
    if (infoPhoneEl && profileData?.phone) infoPhoneEl.textContent = profileData.phone;
    if (infoAddressEl) infoAddressEl.textContent = profileData?.address || "Not set";
  } else if (infoAddressEl) {
    infoAddressEl.textContent = "Not set";
  }

  const avatarUrl = provider.avatar_url || metadataAvatar || provider.banner_url || provider.hero_url || "";
  if (avatarEl && avatarUrl && !isPlaceholderUrl(avatarUrl)) {
    avatarEl.src = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }


  const providerId = provider.id || preferredId || null;
  if (!providerId) return;

  const [{ count: proposalCount }, { count: jobMessageCount }, { count: directMessageCount }] = await Promise.all([
    safeHeadCount(
      profileSupabase
        .from("job_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
    ),
    safeHeadCount(
      profileSupabase
        .from("job_messages")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
    ),
    safeHeadCount(
      profileSupabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
    ),
  ]);

  if (statProposalsEl) statProposalsEl.textContent = String(proposalCount);
  if (statMessagesEl) statMessagesEl.textContent = String(jobMessageCount + directMessageCount);

  const { data: eventRows, error: eventError } = await profileSupabase
    .from("provider_events")
    .select("event_type")
    .eq("provider_id", providerId);
  if (eventError && !isMissingTableError(eventError)) {
    if (statViewsEl) statViewsEl.textContent = "0";
    if (statSavesEl) statSavesEl.textContent = "0";
  } else {
    const rows = Array.isArray(eventRows) ? eventRows : [];
    const views = rows.filter((row) => row.event_type === "profile_view").length;
    const saves = rows.filter((row) => row.event_type === "save_click").length;
    if (statViewsEl) statViewsEl.textContent = String(views);
    if (statSavesEl) statSavesEl.textContent = String(saves);
  }

  if (ratingValueEl || ratingCountEl || ratingStarsEl || commentsListEl) {
    let reviews = [];
    const { data: providerReviews, error: providerReviewError } = await profileSupabase
      .from("provider_reviews")
      .select("rating,text,comment,reviewer_name,name")
      .eq("provider_id", providerId);

    if (!providerReviewError && Array.isArray(providerReviews) && providerReviews.length) {
      reviews = providerReviews.map((row) => ({
        name: row.reviewer_name || row.name || "Anonymous",
        rating: Number(row.rating) || 0,
        text: row.text || row.comment || "",
      }));
    } else {
      const { data: jobReviews, error: jobReviewError } = await profileSupabase
        .from("job_reviews")
        .select("rating,review_text,reviewer_role,reviewee_role")
        .eq("reviewee_role", "provider")
        .eq("reviewee_user_id", user.id);
      if (!jobReviewError && Array.isArray(jobReviews)) {
        reviews = jobReviews.map((row) => ({
          name: row.reviewer_role === "client" ? "Client" : "Anonymous",
          rating: Number(row.rating) || 0,
          text: row.review_text || "",
        }));
      }
    }

    renderReviewsUi(reviews);
  }
};

commentsMoreButton?.addEventListener("click", openCommentsModal);
loadProvider();

const clearLocalProviderState = () => {
  localStorage.removeItem("nlink_primary_provider_id");
  localStorage.removeItem("nlink_provider_draft");
  localStorage.removeItem("nlink_profile_draft");
  localStorage.removeItem("nlink_gallery_draft");
  localStorage.removeItem("nlink_provider_meta");
};

const deleteProviderProfile = async () => {
  if (!profileSupabase) {
    setStatus("Supabase is not configured.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Delete your provider profile and media? This cannot be undone.",
  );
  if (!confirmed) return;

  try {
    setStatus("Deleting provider profile...", "info");
    const { data: sessionData } = await profileSupabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      setStatus("Sign in required.", "error");
      return;
    }

    const { data: providers, error: providersError } = await profileSupabase
      .from("providers")
      .select("id")
      .eq("owner_id", user.id);
    if (providersError) throw providersError;

    const providerIds = (providers || []).map((item) => item.id);

    if (providerIds.length > 0) {
      const { error: photosError } = await profileSupabase
        .from("provider_photos")
        .delete()
        .in("provider_id", providerIds);
      if (photosError) throw photosError;

      const { data: objects, error: listError } = await profileSupabase.storage
        .from("provider-media")
        .list(`providers/${user.id}`, {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });
      if (!listError) {
        const paths = (objects || [])
          .filter((item) => item?.name && item.id)
          .map((item) => `providers/${user.id}/${item.name}`);
        if (paths.length > 0) {
          await profileSupabase.storage.from("provider-media").remove(paths);
        }
      }

      const { error: profilesError } = await profileSupabase
        .from("provider_profiles")
        .delete()
        .or(`owner_id.eq.${user.id},provider_id.in.(${providerIds.join(",")})`);
      if (profilesError) throw profilesError;

      const { error: providerDeleteError } = await profileSupabase
        .from("providers")
        .delete()
        .eq("owner_id", user.id);
      if (providerDeleteError) throw providerDeleteError;
    }

    const currentRoles = getRolesFromMetadata(user.user_metadata);
    const nextRoles = currentRoles.filter((role) => role !== "provider");
    const nextPrimaryRole = nextRoles[0] || "client";
    const { error: metadataError } = await profileSupabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        role: nextPrimaryRole,
        roles: nextRoles,
      },
    });
    if (metadataError) throw metadataError;

    clearLocalProviderState();
    await profileSupabase.auth.signOut();
    window.location.href = "/shared/auth-choice.html";
  } catch (error) {
    setStatus(error.message || "Could not delete provider profile.", "error");
  }
};

if (deleteProfileButton) {
  deleteProfileButton.addEventListener("click", deleteProviderProfile);
}
})();
