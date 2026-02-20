const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const nameEl = document.getElementById("client-name");
const metaEl = document.getElementById("client-meta");
const avatarEl = document.getElementById("client-avatar");

const fallbackName = (email) => (email ? email.split("@")[0] : "Client");

const loadClientProfile = async () => {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { data, error } = await supabase
    .from("clients")
    .select("id,full_name,nick_name,email,phone,avatar_url,location")
    .eq("user_id", user.id)
    .maybeSingle();

  let profile = data || null;
  if (error) {
    const isMissingColumn = error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205";
    if (isMissingColumn) {
      const { data: legacyData } = await supabase
        .from("clients")
        .select("id,full_name,nick_name,email,phone,avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      profile = legacyData || null;
    } else {
      // Keep UI usable even if profile query fails in this environment.
      profile = null;
    }
  }

  const meta = user.user_metadata || {};
  const displayName = profile?.full_name || meta.client_name || fallbackName(user.email);
  if (nameEl) nameEl.textContent = displayName;
  if (metaEl) {
    const bits = [
      profile?.email || user.email || "",
      profile?.phone || "",
      profile?.location || meta.client_location || "",
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (avatarEl && profile?.avatar_url) {
    avatarEl.src = `${profile.avatar_url}${profile.avatar_url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }
};

loadClientProfile();
