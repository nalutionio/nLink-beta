const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("client-profile-form");
const statusEl = document.getElementById("client-profile-status");
const fullNameInput = document.getElementById("client-full-name");
const nickNameInput = document.getElementById("client-nick-name");
const emailInput = document.getElementById("client-email");
const phoneInput = document.getElementById("client-phone");
const countryInput = document.getElementById("client-country");
const genderInput = document.getElementById("client-gender");
const addressInput = document.getElementById("client-address");

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const loadProfile = async () => {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { data } = await supabase
    .from("clients")
    .select("full_name,nick_name,email,phone,country,gender,address")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return;

  fullNameInput.value = data.full_name || "";
  nickNameInput.value = data.nick_name || "";
  emailInput.value = data.email || user.email || "";
  phoneInput.value = data.phone || "";
  if (data.country) countryInput.value = data.country;
  if (data.gender) genderInput.value = data.gender;
  addressInput.value = data.address || "";
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  if (!fullNameInput.value.trim()) {
    setStatus("Full name is required.", "error");
    return;
  }

  setStatus("Saving...", "info");

  const payload = {
    user_id: user.id,
    full_name: fullNameInput.value.trim(),
    nick_name: nickNameInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    country: countryInput.value,
    gender: genderInput.value,
    address: addressInput.value.trim(),
  };

  const { error } = await supabase
    .from("clients")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    setStatus(error.message || "Could not save profile.", "error");
    return;
  }

  const metadata = {
    ...(user.user_metadata || {}),
    client_name: fullNameInput.value.trim(),
    client_location: addressInput.value.trim() || user.user_metadata?.client_location || "",
  };
  const { error: metadataError } = await supabase.auth.updateUser({ data: metadata });
  if (metadataError) {
    setStatus(metadataError.message || "Saved profile, but could not update account metadata.", "error");
    return;
  }

  setStatus("Profile saved.", "success");
  window.setTimeout(() => {
    window.location.href = "/client/client-profile.html";
  }, 600);
});

loadProfile();
