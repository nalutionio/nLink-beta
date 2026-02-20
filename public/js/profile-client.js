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

  if (error) {
    return;
  }

  const meta = user.user_metadata || {};
  const displayName = data?.full_name || meta.client_name || fallbackName(user.email);
  if (nameEl) nameEl.textContent = displayName;
  if (metaEl) {
    const bits = [
      data?.email || user.email || "",
      data?.phone || "",
      data?.location || meta.client_location || "",
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (avatarEl && data?.avatar_url) {
    avatarEl.src = `${data.avatar_url}${data.avatar_url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }
};

loadClientProfile();
