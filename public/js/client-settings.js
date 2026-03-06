(() => {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const nameEl = document.getElementById("client-settings-name");
  const emailEl = document.getElementById("client-settings-email");
  const avatarEl = document.getElementById("client-settings-avatar");
  const infoEmailEl = document.getElementById("client-info-email");
  const infoEmailVerifyEl = document.getElementById("client-info-email-verify");
  const infoPhoneEl = document.getElementById("client-info-phone");
  const infoAddressEl = document.getElementById("client-info-address");
  const infoLocationEl = document.getElementById("client-info-location");

  const fallbackAvatar = "../assets/nlinkiconblk.png";
  const fallbackName = (email) => (email ? email.split("@")[0] : "Client");
  const isMissingColumnError = (error) => Boolean(error)
    && ["42703", "PGRST204", "PGRST205"].includes(error.code);

  const selectClientProfile = async (userId) => {
    const tries = [
      "full_name,email,phone,avatar_url,address,location",
      "full_name,email,phone,avatar_url,location",
      "full_name,email,phone,avatar_url",
    ];
    for (const select of tries) {
      const { data, error } = await supabase
        .from("clients")
        .select(select)
        .eq("user_id", userId)
        .maybeSingle();
      if (!error) return data || null;
      if (!isMissingColumnError(error)) return null;
    }
    return null;
  };

  const load = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const meta = user.user_metadata || {};
    const profile = await selectClientProfile(user.id);

    const displayName = profile?.full_name || meta.client_name || fallbackName(user.email);
    const avatarUrl = profile?.avatar_url || meta.client_avatar_url || fallbackAvatar;

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = profile?.email || user.email || "-";
    if (avatarEl) avatarEl.src = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    if (infoEmailEl) infoEmailEl.textContent = profile?.email || user.email || "-";
    if (infoEmailVerifyEl) infoEmailVerifyEl.textContent = user.email_confirmed_at ? "Verified" : "Pending";
    if (infoPhoneEl) infoPhoneEl.textContent = profile?.phone || user.phone || "Not set";
    if (infoAddressEl) infoAddressEl.textContent = profile?.address || "Not set";
    if (infoLocationEl) infoLocationEl.textContent = profile?.location || meta.client_location || "Not set";
  };

  load();
})();
