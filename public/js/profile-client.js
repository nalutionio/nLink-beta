const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const clientReady = Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
const supabase = clientReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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
    .select("id,full_name,nick_name,email,phone,avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return;
  }

  let profile = data;
  if (!profile) {
    const { data: inserted } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
        email: user.email,
        full_name: fallbackName(user.email),
      })
      .select("id,full_name,nick_name,email,phone,avatar_url")
      .maybeSingle();
    profile = inserted;
  }

  if (!profile) return;

  if (nameEl) nameEl.textContent = profile.full_name || fallbackName(profile.email);
  if (metaEl) {
    const bits = [profile.email || user.email, profile.phone].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (avatarEl && profile.avatar_url) {
    avatarEl.src = profile.avatar_url;
  }
};

loadClientProfile();
