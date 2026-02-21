const providerOnboardSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("provider-onboarding-form");
const steps = Array.from(document.querySelectorAll(".onboard-step"));
const backButton = document.getElementById("provider-back");
const nextButton = document.getElementById("provider-next");
const finishButton = document.getElementById("provider-finish");
const statusEl = document.getElementById("provider-onboarding-status");

const nameInput = document.getElementById("provider-name");
const categoryInput = document.getElementById("provider-category");
const locationInput = document.getElementById("provider-location");
const budgetInput = document.getElementById("provider-budget");
const descriptionInput = document.getElementById("provider-description");
const logoUpload = document.getElementById("provider-logo-upload");
const bannerUpload = document.getElementById("provider-banner-upload");
const galleryUpload = document.getElementById("provider-gallery-upload");
const logoUploadName = document.getElementById("provider-logo-upload-name");
const bannerUploadName = document.getElementById("provider-banner-upload-name");
const galleryUploadName = document.getElementById("provider-gallery-upload-name");
const bannerPresetWrap = document.getElementById("provider-onboarding-banner-presets");

let stepIndex = 0;
let selectedBannerColor = "";
const MAX_UPLOAD_SIZE_MB = 10;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

if (window.NLINK_SERVICE_TAGS && categoryInput) {
  const tags = window.NLINK_SERVICE_TAGS.allServiceTags || [];
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    categoryInput.appendChild(option);
  });
}

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const parseBudgetRange = (value) => {
  const cleaned = value.replace(/[^0-9-]/g, "");
  const [min, max] = cleaned.split("-").map((part) => Number(part.trim()));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
};

const uploadFile = async (file, path) => {
  const extension = file.type.split("/")[1] || "jpg";
  const finalPath = `${path}.${extension}`;
  let uploadError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await providerOnboardSupabase.storage.from("provider-media").upload(finalPath, file, {
      upsert: true,
      contentType: file.type,
    });
    uploadError = error || null;
    if (!uploadError) break;
  }
  if (uploadError) throw uploadError;
  const { data } = providerOnboardSupabase.storage.from("provider-media").getPublicUrl(finalPath);
  return { url: data?.publicUrl || null, storagePath: finalPath };
};

const isValidImageUpload = (file) => {
  if (!file) return false;
  if (!file.type || !file.type.startsWith("image/")) return false;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return false;
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return false;
  return true;
};

const createSolidBannerDataUrl = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 540"><rect width="1200" height="540" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const renderStep = () => {
  steps.forEach((step, index) => {
    step.classList.toggle("hidden", index !== stepIndex);
  });
  backButton.hidden = stepIndex === 0;
  nextButton.hidden = stepIndex === steps.length - 1;
  finishButton.hidden = stepIndex !== steps.length - 1;
};

const validateStep = () => {
  if (stepIndex === 0 && (!nameInput.value.trim() || !categoryInput.value.trim())) {
    setStatus("Add business name and category.", "error");
    return false;
  }
  if (stepIndex === 1) {
    if (!locationInput.value.trim()) {
      setStatus("Add your location.", "error");
      return false;
    }
    if (!parseBudgetRange(budgetInput.value.trim())) {
      setStatus("Add budget like 100-500.", "error");
      return false;
    }
  }
  if (stepIndex === 2 && !descriptionInput.value.trim()) {
    setStatus("Add a short bio.", "error");
    return false;
  }
  if (stepIndex === 3) {
    const logoCount = logoUpload?.files?.length || 0;
    const bannerCount = bannerUpload?.files?.length || 0;
    const galleryCount = Math.min(galleryUpload?.files?.length || 0, 3);
    const totalImages = logoCount + bannerCount + galleryCount;
    if (totalImages < 2) {
      setStatus("Upload at least 2 images (logo, banner, or gallery).", "error");
      return false;
    }
    const files = [
      ...(logoUpload?.files ? Array.from(logoUpload.files) : []),
      ...(bannerUpload?.files ? Array.from(bannerUpload.files) : []),
      ...Array.from(galleryUpload?.files || []).slice(0, 3),
    ];
    const invalid = files.find((file) => !isValidImageUpload(file));
    if (invalid) {
      setStatus(`"${invalid.name}" is not valid. Use JPG/PNG/WEBP/HEIC up to ${MAX_UPLOAD_SIZE_MB}MB.`, "error");
      return false;
    }
  }
  setStatus("");
  return true;
};

nextButton?.addEventListener("click", () => {
  if (!validateStep()) return;
  stepIndex = Math.min(stepIndex + 1, steps.length - 1);
  renderStep();
});

backButton?.addEventListener("click", () => {
  stepIndex = Math.max(stepIndex - 1, 0);
  renderStep();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  if (!providerOnboardSupabase) {
    setStatus("Supabase is not configured.", "error");
    return;
  }

  try {
    setStatus("Creating provider profile...", "info");
    const { data } = await providerOnboardSupabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) {
      setStatus("Sign in required.", "error");
      return;
    }

    const budget = parseBudgetRange(budgetInput.value.trim());
    const providerPayload = {
      name: nameInput.value.trim(),
      category: categoryInput.value.trim(),
      location: locationInput.value.trim(),
      budget_min: budget.min,
      budget_max: budget.max,
      description: descriptionInput.value.trim(),
    };

    const { data: existingProviders, error: providersReadError } = await providerOnboardSupabase
      .from("providers")
      .select("id,avatar_url,banner_url,hero_url,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (providersReadError) throw providersReadError;

    const existingProvider = existingProviders?.[0] || null;
    let providerId = existingProvider?.id || crypto.randomUUID();

    const logoFile = logoUpload?.files?.[0] || null;
    const bannerFile = bannerUpload?.files?.[0] || null;
    const galleryFiles = Array.from(galleryUpload?.files || []).slice(0, 3);

    const imageUpdates = {};
    if (logoFile) {
      const { url } = await uploadFile(
        logoFile,
        `providers/${user.id}/${providerId}/avatar-onboarding-${Date.now()}`,
      );
      if (url) imageUpdates.avatar_url = url;
    }
    if (bannerFile) {
      const { url } = await uploadFile(
        bannerFile,
        `providers/${user.id}/${providerId}/banner-onboarding-${Date.now()}`,
      );
      if (url) {
        imageUpdates.banner_url = url;
        imageUpdates.hero_url = url;
      }
    } else if (selectedBannerColor) {
      const bannerDataUrl = createSolidBannerDataUrl(selectedBannerColor);
      imageUpdates.banner_url = bannerDataUrl;
      imageUpdates.hero_url = bannerDataUrl;
    }
    const finalProviderPayload = {
      ...providerPayload,
      avatar_url: imageUpdates.avatar_url ?? existingProvider?.avatar_url ?? null,
      banner_url: imageUpdates.banner_url ?? existingProvider?.banner_url ?? null,
      hero_url: imageUpdates.hero_url ?? existingProvider?.hero_url ?? null,
    };

    if (existingProvider?.id) {
      const { data: updatedProvider, error: updateError } = await providerOnboardSupabase
        .from("providers")
        .update(finalProviderPayload)
        .eq("id", providerId)
        .eq("owner_id", user.id)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedProvider) {
        throw new Error("Could not save provider images. Please try again.");
      }
    } else {
      const { data: insertedProvider, error: insertError } = await providerOnboardSupabase
        .from("providers")
        .insert({
          id: providerId,
          owner_id: user.id,
          ...finalProviderPayload,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (!insertedProvider?.id) {
        throw new Error("Could not create provider profile. Please try again.");
      }
    }

    if (galleryFiles.length > 0) {
      const photoRows = [];
      for (const [index, file] of galleryFiles.entries()) {
        const photoId = crypto.randomUUID();
        const { url, storagePath } = await uploadFile(
          file,
          `providers/${user.id}/${providerId}/gallery/onboard-${Date.now()}-${index}`,
        );
        if (!url || !storagePath) continue;
        photoRows.push({
          id: photoId,
          provider_id: providerId,
          url,
          storage_path: storagePath,
        });
      }
      if (photoRows.length > 0) {
        const { error: photoInsertError } = await providerOnboardSupabase
          .from("provider_photos")
          .insert(photoRows);
        if (photoInsertError) throw photoInsertError;
      }
    }

    const phoneFromMetadata = user.user_metadata?.contact_phone || null;
    const profilePayload = {
      provider_id: providerId,
      owner_id: user.id,
      listing_status: "draft",
      profile_completion: 0,
    };
    if (phoneFromMetadata) profilePayload.phone = phoneFromMetadata;
    const { error: profileUpsertError } = await providerOnboardSupabase
      .from("provider_profiles")
      .upsert(profilePayload, { onConflict: "provider_id" });
    if (profileUpsertError && !(profileUpsertError.code === "42703" || profileUpsertError.code === "PGRST204")) {
      throw profileUpsertError;
    }
    if (profileUpsertError) {
      const legacyPayload = {
        provider_id: providerId,
        owner_id: user.id,
      };
      if (phoneFromMetadata) legacyPayload.phone = phoneFromMetadata;
      const { error: legacyProfileError } = await providerOnboardSupabase
        .from("provider_profiles")
        .upsert(legacyPayload, { onConflict: "provider_id" });
      if (legacyProfileError) throw legacyProfileError;
    }

    const roles = Array.isArray(user.user_metadata?.roles)
      ? Array.from(new Set([...user.user_metadata.roles, "provider"]))
      : ["provider"];

    const { error: metadataError } = await providerOnboardSupabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        role: user.user_metadata?.role || "provider",
        roles,
        onboarding_provider_complete: true,
        provider_business_name: providerPayload.name,
        provider_avatar_url: finalProviderPayload.avatar_url || "",
        provider_banner_url: finalProviderPayload.banner_url || "",
      },
    });
    if (metadataError) throw metadataError;

    localStorage.setItem("nlink_last_role", "provider");
    localStorage.setItem("nlink_primary_provider_id", providerId);
    window.location.href = "/provider/dashboard.html";
  } catch (error) {
    setStatus(error.message || "Could not complete onboarding.", "error");
  }
});

renderStep();

const prefillFromMetadata = async () => {
  if (!providerOnboardSupabase) return;
  const { data } = await providerOnboardSupabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;
  const metadataBusinessName = user.user_metadata?.provider_business_name;
  if (nameInput && metadataBusinessName && !nameInput.value.trim()) {
    nameInput.value = metadataBusinessName;
  }
};

logoUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (logoUploadName) logoUploadName.textContent = file ? `Selected: ${file.name}` : "No image chosen";
});

bannerUpload?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (bannerUploadName) bannerUploadName.textContent = file ? `Selected: ${file.name}` : "No image chosen";
});

galleryUpload?.addEventListener("change", (event) => {
  const count = Math.min(event.target.files?.length || 0, 3);
  if (galleryUploadName) galleryUploadName.textContent = count ? `${count} image(s) selected` : "No images chosen";
});

bannerPresetWrap?.querySelectorAll("[data-banner-color]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedBannerColor = button.dataset.bannerColor || "";
    bannerPresetWrap.querySelectorAll(".color-swatch").forEach((el) => el.classList.remove("selected"));
    button.classList.add("selected");
  });
});

prefillFromMetadata();
