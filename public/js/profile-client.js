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

const fallbackName = (email) => (email ? email.split("@")[0] : "Client");
const fallbackAvatar = "../assets/nlinkiconblk.png";

const isMissingColumnError = (error) => Boolean(error)
  && ["42703", "PGRST204", "PGRST205"].includes(error.code);

const selectClientProfile = async (userId) => {
  const tries = [
    "id,full_name,nick_name,email,phone,avatar_url,banner_url,location,address",
    "id,full_name,nick_name,email,phone,avatar_url,location,address",
    "id,full_name,nick_name,email,phone,avatar_url,location",
    "id,full_name,nick_name,email,phone,avatar_url",
  ];

  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await supabase
      .from("clients")
      .select(tries[i])
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return data || null;
    if (!isMissingColumnError(error)) return null;
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
  if (!value) return "Member since --";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since --";
  return `Member since ${date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
};

const loadClientProfile = async () => {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
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

  const bannerUrl = profile?.banner_url || meta.client_banner_url || "";
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
};

loadClientProfile();
