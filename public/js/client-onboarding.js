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

    localStorage.setItem("nlink_last_role", "client");
    window.location.href = "/client/discover.html";
  } catch (error) {
    setStatus(error.message || "Could not complete onboarding.", "error");
  }
});

renderStep();
