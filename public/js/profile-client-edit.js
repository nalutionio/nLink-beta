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
const propertyTypeInput = document.getElementById("property-type");
const propertyOwnershipInput = document.getElementById("property-ownership");
const propertyYearBuiltInput = document.getElementById("property-year-built");
const propertyRoofAgeInput = document.getElementById("property-roof-age");
const propertyHvacAgeInput = document.getElementById("property-hvac-age");
const propertyPanelAgeInput = document.getElementById("property-panel-age");
const propertyWaterHeaterAgeInput = document.getElementById("property-water-heater-age");
const propertyRenovationYearInput = document.getElementById("property-renovation-year");
const propertyAccessNotesInput = document.getElementById("property-access-notes");
const propertyPhotoUpload = document.getElementById("property-photo-upload");
const propertyPhotoUploadName = document.getElementById("property-photo-upload-name");
const propertyPhotoEditor = document.getElementById("property-photo-editor");
const propertyCompletionEl = document.getElementById("property-completion");

const fallbackAvatar = "../assets/blankpropic.png";
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"]);

const state = {
  user: null,
  profile: null,
  avatarUrl: "",
  bannerUrl: "",
  propertyProfile: {},
  propertyPhotos: [],
};

const sanitizeAuthMetadata = (metadata = {}) => {
  const next = { ...(metadata || {}) };
  const dropDataImage = (key) => {
    if (typeof next[key] === "string" && next[key].startsWith("data:image/")) delete next[key];
  };
  dropDataImage("client_banner_url");
  dropDataImage("provider_banner_url");
  if (next.client_property_profile && typeof next.client_property_profile === "object") {
    delete next.client_property_profile;
  }
  return next;
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

const getLocalPropertyProfile = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("nlink_client_property_profile") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const updatePropertyCompletion = () => {
  const fields = [
    propertyTypeInput?.value,
    propertyOwnershipInput?.value,
    propertyYearBuiltInput?.value,
    propertyRoofAgeInput?.value,
    propertyHvacAgeInput?.value,
    propertyPanelAgeInput?.value,
    propertyWaterHeaterAgeInput?.value,
    propertyRenovationYearInput?.value,
    propertyAccessNotesInput?.value?.trim(),
  ];
  const completed = fields.filter((value) => String(value || "").trim().length > 0).length;
  if (propertyCompletionEl) propertyCompletionEl.textContent = `${completed}/9 completed`;
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
  let uploadBlob = fileOrBlob;
  let contentType = "image/jpeg";
  let extension = "jpg";
  if (typeof window.nlinkPrepareImageForUpload === "function") {
    const prepared = await window.nlinkPrepareImageForUpload(fileOrBlob, { forceJpeg: true });
    uploadBlob = prepared.blob;
    contentType = prepared.type || "image/jpeg";
    extension = prepared.ext || "jpg";
  } else {
    contentType = fileOrBlob?.type || "image/jpeg";
    extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  }
  const basePath = String(path || "").replace(/\.(jpg|jpeg|png|webp|heic|heif|tif|tiff)$/i, "");
  const finalPath = `${basePath}.${extension}`;
  const { error } = await supabase.storage.from("provider-media").upload(finalPath, uploadBlob, {
    upsert: true,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("provider-media").getPublicUrl(finalPath);
  return data?.publicUrl || "";
};

const selectClientProfile = async (userId) => {
  const tries = [
    "full_name,nick_name,email,phone,country,gender,address,location,avatar_url,banner_url,property_profile",
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
  state.bannerUrl = profile?.banner_url || "";
  state.propertyProfile = (profile?.property_profile && typeof profile.property_profile === "object")
    ? profile.property_profile
    : getLocalPropertyProfile();
  state.propertyPhotos = Array.isArray(state.propertyProfile.photos)
    ? state.propertyProfile.photos
      .filter((item) => item && typeof item.url === "string" && item.url)
      .map((item) => ({ url: item.url, hidden: Boolean(item.hidden) }))
      .slice(0, 3)
    : [];
  applyPreview();

  fullNameInput.value = profile?.full_name || metadata.client_name || "";
  nickNameInput.value = profile?.nick_name || "";
  emailInput.value = profile?.email || user.email || "";
  phoneInput.value = profile?.phone || "";
  if (profile?.country) countryInput.value = profile.country;
  if (profile?.gender) genderInput.value = profile.gender;
  addressInput.value = profile?.address || profile?.location || metadata.client_location || "";

  propertyTypeInput.value = state.propertyProfile.propertyType || "";
  propertyOwnershipInput.value = state.propertyProfile.ownership || "";
  propertyYearBuiltInput.value = state.propertyProfile.yearBuilt || "";
  propertyRoofAgeInput.value = state.propertyProfile.roofAge || "";
  propertyHvacAgeInput.value = state.propertyProfile.hvacAge || "";
  propertyPanelAgeInput.value = state.propertyProfile.panelAge || "";
  propertyWaterHeaterAgeInput.value = state.propertyProfile.waterHeaterAge || "";
  propertyRenovationYearInput.value = state.propertyProfile.renovationYear || "";
  propertyAccessNotesInput.value = state.propertyProfile.accessNotes || "";
  renderPropertyPhotoEditor();
  updatePropertyCompletion();
};

const renderPropertyPhotoEditor = () => {
  if (!propertyPhotoEditor) return;
  propertyPhotoEditor.innerHTML = "";
  if (!state.propertyPhotos.length) {
    propertyPhotoEditor.innerHTML = "<p class=\"muted\">No property photos yet.</p>";
    return;
  }

  state.propertyPhotos.forEach((photo, index) => {
    const card = document.createElement("article");
    card.className = "gallery-card property-photo-card";
    card.innerHTML = `
      <img src="${photo.url}" alt="Property reference ${index + 1}" class="${photo.hidden ? "is-hidden-photo" : ""}" />
      <span class="pill property-photo-visibility">${photo.hidden ? "Hidden" : "Visible"}</span>
      <div class="compact-actions" style="display:grid;grid-template-columns:1fr 1fr;">
        <button type="button" class="ghost-button" data-action="toggle" data-index="${index}">${photo.hidden ? "Hidden" : "Visible"}</button>
        <button type="button" class="ghost-button" data-action="remove" data-index="${index}">Remove</button>
        <button type="button" class="ghost-button" data-action="up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
        <button type="button" class="ghost-button" data-action="down" data-index="${index}" ${index === state.propertyPhotos.length - 1 ? "disabled" : ""}>Down</button>
      </div>
    `;
    propertyPhotoEditor.appendChild(card);
  });

  propertyPhotoEditor.querySelectorAll("button[data-action='toggle']").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index) || !state.propertyPhotos[index]) return;
      state.propertyPhotos[index].hidden = !state.propertyPhotos[index].hidden;
      renderPropertyPhotoEditor();
      setStatus("Photo visibility updated. Save profile to apply.", "info");
    });
  });
  propertyPhotoEditor.querySelectorAll("button[data-action='remove']").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index)) return;
      state.propertyPhotos = state.propertyPhotos.filter((_, i) => i !== index);
      renderPropertyPhotoEditor();
      setStatus("Photo removed. Save profile to apply.", "info");
    });
  });
  propertyPhotoEditor.querySelectorAll("button[data-action='up']").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index) || index <= 0 || !state.propertyPhotos[index]) return;
      const next = state.propertyPhotos.slice();
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      state.propertyPhotos = next;
      renderPropertyPhotoEditor();
      setStatus("Photo order updated. Save profile to apply.", "info");
    });
  });
  propertyPhotoEditor.querySelectorAll("button[data-action='down']").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index) || index >= state.propertyPhotos.length - 1 || !state.propertyPhotos[index]) return;
      const next = state.propertyPhotos.slice();
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      state.propertyPhotos = next;
      renderPropertyPhotoEditor();
      setStatus("Photo order updated. Save profile to apply.", "info");
    });
  });
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
    property_profile: {
      propertyType: propertyTypeInput.value,
      ownership: propertyOwnershipInput.value,
      yearBuilt: propertyYearBuiltInput.value,
      roofAge: propertyRoofAgeInput.value,
      hvacAge: propertyHvacAgeInput.value,
      panelAge: propertyPanelAgeInput.value,
      waterHeaterAge: propertyWaterHeaterAgeInput.value,
      renovationYear: propertyRenovationYearInput.value,
      accessNotes: propertyAccessNotesInput.value.trim(),
      photos: state.propertyPhotos.slice(0, 3),
    },
  };

  try {
    await upsertClientProfile(user.id, payload);
  } catch (error) {
    setStatus(error.message || "Could not save profile.", "error");
    return;
  }

  const metadata = {
    ...sanitizeAuthMetadata(user.user_metadata || {}),
    client_name: fullNameInput.value.trim(),
    client_location: addressInput.value.trim() || user.user_metadata?.client_location || "",
    client_avatar_url: state.avatarUrl || "",
    client_email_verified: Boolean(user.email_confirmed_at),
  };
  const { error: metadataError } = await supabase.auth.updateUser({ data: metadata });
  if (metadataError) {
    setStatus(metadataError.message || "Saved profile, but could not update account metadata.", "error");
    return;
  }

  setStatus("Profile saved.", "success");
  try {
    localStorage.setItem("nlink_client_property_profile", JSON.stringify(payload.property_profile));
  } catch (_error) {
    // no-op
  }
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

propertyPhotoUpload?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []).slice(0, 3);
  if (!files.length || !state.user) return;

  const remainingSlots = Math.max(0, 3 - state.propertyPhotos.length);
  if (remainingSlots === 0) {
    setStatus("You can upload up to 3 property photos.", "error");
    return;
  }
  const selected = files.slice(0, remainingSlots);
  if (propertyPhotoUploadName) {
    propertyPhotoUploadName.textContent = `Selected: ${selected.map((file) => file.name).join(", ")}`;
  }

  setStatus("Uploading property photos...", "info");
  for (const file of selected) {
    try {
      const type = String(file.type || "").toLowerCase();
      const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
      if (!(type.startsWith("image/") || ALLOWED_IMAGE_EXTS.has(ext))) throw new Error("Unsupported image format.");
      const path = `clients/${state.user.id}/property-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const url = await uploadImage(file, path);
      if (url) state.propertyPhotos.push({ url, hidden: false });
    } catch (error) {
      setStatus(error.message || "Some photos could not be uploaded. Use JPG/PNG/WEBP photos.", "error");
    }
  }
  renderPropertyPhotoEditor();
  setStatus("Property photos uploaded. Save profile to apply.", "success");
});

[
  propertyTypeInput,
  propertyOwnershipInput,
  propertyYearBuiltInput,
  propertyRoofAgeInput,
  propertyHvacAgeInput,
  propertyPanelAgeInput,
  propertyWaterHeaterAgeInput,
  propertyRenovationYearInput,
  propertyAccessNotesInput,
].forEach((input) => {
  input?.addEventListener("input", updatePropertyCompletion);
  input?.addEventListener("change", updatePropertyCompletion);
});

loadProfile();
