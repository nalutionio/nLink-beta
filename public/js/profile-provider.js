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

  const preferredId = localStorage.getItem(primaryProviderKey);
  if (preferredId) {
    const { data: preferred, error: preferredError } = await profileSupabase
      .from("providers")
      .select("id,name,avatar_url,banner_url,hero_url,created_at")
      .eq("id", preferredId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (preferredError) return;
    if (preferred) {
      if (nameEl) nameEl.textContent = preferred.name || metadataBusinessName || "Your business";
      if (avatarEl) {
        const preferredAvatar = preferred.avatar_url || metadataAvatar || preferred.banner_url || preferred.hero_url || "";
        if (preferredAvatar && !isPlaceholderUrl(preferredAvatar)) {
          avatarEl.src = `${preferredAvatar}${preferredAvatar.includes("?") ? "&" : "?"}v=${Date.now()}`;
        }
      }
      if (preferred.id) localStorage.setItem(primaryProviderKey, preferred.id);
      return;
    }
  }

  const { data, error } = await profileSupabase
    .from("providers")
    .select("id,name,avatar_url,banner_url,hero_url,created_at")
    .eq("owner_id", user.id)
    .limit(25);

  if (error || !data) {
    if (nameEl && !metadataBusinessName) nameEl.textContent = "Your business";
    return;
  }
  const provider = pickBestProviderRecord(data);
  if (!provider) {
    if (nameEl && !metadataBusinessName) nameEl.textContent = "Your business";
    return;
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
};

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
