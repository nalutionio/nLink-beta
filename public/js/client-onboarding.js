const clientOnboardSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("client-onboarding-form");
const steps = Array.from(document.querySelectorAll(".onboard-step"));
const backButton = document.getElementById("client-back");
const nextButton = document.getElementById("client-next");
const finishButton = document.getElementById("client-finish");
const statusEl = document.getElementById("client-onboarding-status");
const stepCounterEl = document.getElementById("client-step-counter");

const nameInput = document.getElementById("client-name");
const locationInput = document.getElementById("client-location");

let stepIndex = 0;
const normalizeLocation = (value) => (
  window.NLINK_SERVICE_TAGS?.normalizeLocation
    ? window.NLINK_SERVICE_TAGS.normalizeLocation(value)
    : String(value || "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim()
);

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

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const renderStep = () => {
  steps.forEach((step, index) => {
    step.classList.toggle("hidden", index !== stepIndex);
  });
  if (stepCounterEl) stepCounterEl.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
  backButton.hidden = stepIndex === 0;
  nextButton.hidden = stepIndex === steps.length - 1;
  finishButton.hidden = stepIndex !== steps.length - 1;
};

const validateStep = () => {
  if (stepIndex === 0 && !nameInput.value.trim()) {
    setStatus("Please enter your name.", "error");
    return false;
  }
  if (stepIndex === 1 && !locationInput.value.trim()) {
    setStatus("Please add your location.", "error");
    return false;
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
  if (!clientOnboardSupabase) {
    setStatus("Supabase is not configured.", "error");
    return;
  }
  try {
    setStatus("Saving onboarding...", "info");
    const { data } = await clientOnboardSupabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) {
      setStatus("Sign in required.", "error");
      return;
    }

    const normalizedLocation = normalizeLocation(locationInput.value);
    const validation = await (window.NLINK_SERVICE_TAGS?.validateLocation?.(normalizedLocation)
      || Promise.resolve({ ok: true, normalized: normalizedLocation }));
    if (!validation.ok) {
      setStatus(validation.message || "Enter a valid location.", "error");
      return;
    }
    const verifiedLocation = validation.normalized || normalizedLocation;
    if (locationInput) locationInput.value = verifiedLocation;
    const metadata = {
      ...sanitizeAuthMetadata(user.user_metadata || {}),
      onboarding_client_complete: true,
      client_name: nameInput.value.trim(),
      client_location: verifiedLocation,
      role: user.user_metadata?.role || "client",
      roles: Array.isArray(user.user_metadata?.roles)
        ? Array.from(new Set([...user.user_metadata.roles, "client"]))
        : ["client"],
    };

    const { error } = await clientOnboardSupabase.auth.updateUser({ data: metadata });
    if (error) throw error;

    const { error: profileError } = await clientOnboardSupabase
      .from("clients")
      .upsert({
        user_id: user.id,
        email: user.email,
        email_verified: Boolean(user.email_confirmed_at),
        full_name: nameInput.value.trim(),
        location: verifiedLocation,
      }, { onConflict: "user_id" });
    if (profileError) {
      if (!(profileError.code === "42703" || profileError.code === "PGRST204" || profileError.code === "PGRST205")) {
        throw profileError;
      }
      const { error: fallbackError } = await clientOnboardSupabase
        .from("clients")
        .upsert({
          user_id: user.id,
          email: user.email,
          email_verified: Boolean(user.email_confirmed_at),
          full_name: nameInput.value.trim(),
        }, { onConflict: "user_id" });
      if (fallbackError) throw fallbackError;
    }

    localStorage.setItem("nlink_last_role", "client");
    window.location.href = "/client/discover.html";
  } catch (error) {
    setStatus(error.message || "Could not complete onboarding.", "error");
  }
});

const prefillFromUser = async () => {
  if (!clientOnboardSupabase) return;
  const { data } = await clientOnboardSupabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;
  const meta = user.user_metadata || {};
  if (nameInput && !nameInput.value.trim()) {
    const fallbackName = meta.client_name || user.email?.split("@")[0] || "";
    if (fallbackName) nameInput.value = fallbackName;
  }
  if (locationInput && !locationInput.value.trim() && meta.client_location) {
    locationInput.value = meta.client_location;
  }
};

renderStep();
prefillFromUser();
