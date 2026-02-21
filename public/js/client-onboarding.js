const clientOnboardSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const form = document.getElementById("client-onboarding-form");
const steps = Array.from(document.querySelectorAll(".onboard-step"));
const backButton = document.getElementById("client-back");
const nextButton = document.getElementById("client-next");
const finishButton = document.getElementById("client-finish");
const statusEl = document.getElementById("client-onboarding-status");

const nameInput = document.getElementById("client-name");
const locationInput = document.getElementById("client-location");
const interestsInput = document.getElementById("client-interests");
const budgetInput = document.getElementById("client-budget");

let stepIndex = 0;

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const parseBudgetRange = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9-]/g, "");
  const [first, second] = cleaned.split("-").map((part) => Number(part.trim()));
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { min: Math.min(first, second), max: Math.max(first, second) };
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
  if (stepIndex === 0 && !nameInput.value.trim()) {
    setStatus("Please enter your name.", "error");
    return false;
  }
  if (stepIndex === 1 && !locationInput.value.trim()) {
    setStatus("Please add your location.", "error");
    return false;
  }
  if (stepIndex === 2) {
    if (!interestsInput.value.trim()) {
      setStatus("Please add at least one service interest.", "error");
      return false;
    }
    if (budgetInput.value.trim() && !parseBudgetRange(budgetInput.value.trim())) {
      setStatus("Use budget format like 100-500 or leave it empty.", "error");
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

    const metadata = {
      ...(user.user_metadata || {}),
      onboarding_client_complete: true,
      client_name: nameInput.value.trim(),
      client_location: locationInput.value.trim(),
      client_interests: interestsInput.value.trim(),
      client_budget_pref: budgetInput.value.trim(),
      role: user.user_metadata?.role || "client",
      roles: Array.isArray(user.user_metadata?.roles)
        ? Array.from(new Set([...user.user_metadata.roles, "client"]))
        : ["client"],
    };

    const { error } = await clientOnboardSupabase.auth.updateUser({ data: metadata });
    if (error) throw error;

    const budgetRange = parseBudgetRange(budgetInput.value.trim());
    const interestTags = interestsInput.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
    const { error: profileError } = await clientOnboardSupabase
      .from("clients")
      .upsert({
        user_id: user.id,
        email: user.email,
        email_verified: Boolean(user.email_confirmed_at),
        full_name: nameInput.value.trim(),
        location: locationInput.value.trim(),
        interests: interestTags,
        budget_min: budgetRange?.min ?? null,
        budget_max: budgetRange?.max ?? null,
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
  if (interestsInput && !interestsInput.value.trim() && meta.client_interests) {
    interestsInput.value = meta.client_interests;
  }
  if (budgetInput && !budgetInput.value.trim() && meta.client_budget_pref) {
    budgetInput.value = meta.client_budget_pref;
  }
};

renderStep();
prefillFromUser();
