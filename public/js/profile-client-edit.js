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
const bannerUpload = document.getElementById("client-banner-upload");
const avatarUpload = document.getElementById("client-avatar-upload");
const bannerUploadName = document.getElementById("client-banner-upload-name");
const avatarUploadName = document.getElementById("client-avatar-upload-name");
const bannerPresets = document.getElementById("client-banner-presets");
const heroPreviewEl = document.getElementById("client-edit-hero-bg");
const avatarPreviewEl = document.getElementById("client-edit-avatar-preview");

const fallbackAvatar = "../assets/nlinkiconblk.png";

const state = {
  user: null,
  profile: null,
  avatarUrl: "",
  bannerUrl: "",
};

const isMissingColumnError = (error) => Boolean(error)
  && ["42703", "PGRST204", "PGRST205"].includes(error.code);

const getMissingColumnFromError = (error) => {
  const message = String(error?.message || "");
  const match = message.match(/the '([^']+)' column/i);
  return match?.[1] || "";
};

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const applyPreview = () => {
  if (heroPreviewEl) {
    if (state.bannerUrl) {
      heroPreviewEl.style.backgroundImage = `linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.45)), url('${state.bannerUrl}')`;
      heroPreviewEl.style.backgroundSize = "cover";
      heroPreviewEl.style.backgroundPosition = "center";
    } else {
      heroPreviewEl.style.backgroundImage = "";
      heroPreviewEl.style.backgroundColor = "#e9eeef";
    }
  }
  if (avatarPreviewEl) {
    avatarPreviewEl.src = state.avatarUrl || fallbackAvatar;
  }
};

const createSolidBannerDataUrl = (color) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = color || "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
};

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const uploadImage = async (fileOrBlob, path) => {
  if (!supabase) return "";
  const { error } = await supabase.storage.from("provider-media").upload(path, fileOrBlob, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("provider-media").getPublicUrl(path);
  return data?.publicUrl || "";
};

const selectClientProfile = async (userId) => {
  const tries = [
    "full_name,nick_name,email,phone,country,gender,address,location,avatar_url,banner_url",
    "full_name,nick_name,email,phone,country,gender,address,location,avatar_url",
    "full_name,nick_name,email,phone,country,gender,address,avatar_url",
    "full_name,nick_name,email,phone,country,gender,address",
  ];
  for (let i = 0; i < tries.length; i += 1) {
    const { data, error } = await supabase
      .from("clients")
      .select(tries[i])
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return data || null;
    if (!isMissingColumnError(error)) throw error;
  }
  return null;
};

const upsertClientProfile = async (userId, payload) => {
  const workingPayload = { user_id: userId, ...payload };
  const attemptedMissingColumns = new Set();

  for (let i = 0; i < 10; i += 1) {
    const cleanPayload = Object.fromEntries(
      Object.entries(workingPayload).filter(([, value]) => value !== undefined),
    );
    const { error } = await supabase
      .from("clients")
      .upsert(cleanPayload, { onConflict: "user_id" });
    if (!error) return;
    if (!isMissingColumnError(error)) throw error;

    const missingColumn = getMissingColumnFromError(error);
    if (!missingColumn || attemptedMissingColumns.has(missingColumn) || missingColumn === "user_id") {
      throw error;
    }
    attemptedMissingColumns.add(missingColumn);
    delete workingPayload[missingColumn];
  }

  throw new Error("Could not save profile with current client schema.");
};

const loadProfile = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  state.user = user;

  let profile = null;
  try {
    profile = await selectClientProfile(user.id);
  } catch (_error) {
    profile = null;
  }
  state.profile = profile;

  const metadata = user.user_metadata || {};
  state.avatarUrl = profile?.avatar_url || metadata.client_avatar_url || "";
  state.bannerUrl = profile?.banner_url || metadata.client_banner_url || "";
  applyPreview();

  fullNameInput.value = profile?.full_name || metadata.client_name || "";
  nickNameInput.value = profile?.nick_name || "";
  emailInput.value = profile?.email || user.email || "";
  phoneInput.value = profile?.phone || "";
  if (profile?.country) countryInput.value = profile.country;
  if (profile?.gender) genderInput.value = profile.gender;
  addressInput.value = profile?.address || profile?.location || metadata.client_location || "";
};

const handleImageUpload = async (file, type) => {
  if (!supabase || !state.user || !file) return;
  if (typeof window.nlinkOpenImageCropper !== "function") {
    setStatus("Image cropper is unavailable.", "error");
    return;
  }

  const isBanner = type === "banner";
  const crop = await window.nlinkOpenImageCropper({
    file,
    title: isBanner ? "Adjust Banner" : "Adjust Profile Image",
    aspectRatio: isBanner ? 16 / 9 : 1,
    circle: !isBanner,
    outputWidth: isBanner ? 1600 : 600,
  });

  if (!crop?.blob || !crop.previewDataUrl) {
    setStatus("Image update cancelled.", "info");
    return;
  }

  if (isBanner) state.bannerUrl = crop.previewDataUrl;
  else state.avatarUrl = crop.previewDataUrl;
  applyPreview();
  setStatus("Uploading image...", "info");

  try {
    const filePath = isBanner
      ? `clients/${state.user.id}/banner-${Date.now()}.jpg`
      : `clients/${state.user.id}/avatar-${Date.now()}.jpg`;
    const url = await uploadImage(crop.blob, filePath);
    if (!url) throw new Error("Could not get uploaded image URL.");
    if (isBanner) state.bannerUrl = url;
    else state.avatarUrl = url;
    applyPreview();
    setStatus(`${isBanner ? "Banner" : "Profile image"} uploaded. Save profile to apply everywhere.`, "success");
  } catch (error) {
    setStatus(error.message || "Upload failed.", "error");
  }
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const user = state.user || await getSessionUser();
  if (!user) return;

  if (!fullNameInput.value.trim()) {
    setStatus("Full name is required.", "error");
    return;
  }

  setStatus("Saving...", "info");

  const payload = {
    full_name: fullNameInput.value.trim(),
    nick_name: nickNameInput.value.trim(),
    email: emailInput.value.trim(),
    email_verified: Boolean(user.email_confirmed_at),
    phone: phoneInput.value.trim(),
    country: countryInput.value,
    gender: genderInput.value,
    address: addressInput.value.trim(),
    location: addressInput.value.trim(),
    avatar_url: state.avatarUrl || null,
    banner_url: state.bannerUrl || null,
  };

  try {
    await upsertClientProfile(user.id, payload);
  } catch (error) {
    setStatus(error.message || "Could not save profile.", "error");
    return;
  }

  const metadata = {
    ...(user.user_metadata || {}),
    client_name: fullNameInput.value.trim(),
    client_location: addressInput.value.trim() || user.user_metadata?.client_location || "",
    client_avatar_url: state.avatarUrl || "",
    client_banner_url: state.bannerUrl || "",
    client_email_verified: Boolean(user.email_confirmed_at),
  };
  const { error: metadataError } = await supabase.auth.updateUser({ data: metadata });
  if (metadataError) {
    setStatus(metadataError.message || "Saved profile, but could not update account metadata.", "error");
    return;
  }

  setStatus("Profile saved.", "success");
  window.setTimeout(() => {
    window.location.href = "/client/client-profile.html";
  }, 500);
});

bannerUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (bannerUploadName) bannerUploadName.textContent = `Selected: ${file.name}`;
  handleImageUpload(file, "banner");
});

avatarUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (avatarUploadName) avatarUploadName.textContent = `Selected: ${file.name}`;
  handleImageUpload(file, "avatar");
});

bannerPresets?.querySelectorAll("[data-banner-color]").forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.bannerColor || "";
    if (!color) return;
    state.bannerUrl = createSolidBannerDataUrl(color);
    applyPreview();
    bannerPresets.querySelectorAll(".color-swatch").forEach((node) => node.classList.remove("selected"));
    button.classList.add("selected");
    setStatus("Preset banner selected. Save profile to apply everywhere.", "success");
  });
});

loadProfile();
