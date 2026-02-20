const authSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;
const authClientReady = Boolean(authSupabase);

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("auth-email");
const businessNameInput = document.getElementById("auth-business-name");
const phoneInput = document.getElementById("auth-phone");
const passwordInput = document.getElementById("auth-password");
const confirmInput = document.getElementById("auth-confirm");
const statusEl = document.getElementById("auth-status");
const toggleButtons = document.querySelectorAll(".toggle-password");

const pageRole = document.body.dataset.role || "client";
const pageMode = document.body.dataset.mode || "signin";

const getAppOrigin = () => (
  window.location.protocol === "file:"
    ? "http://localhost:5173"
    : window.location.origin
);
const getEmailConfirmRedirectUrl = () => `${getAppOrigin()}/shared/auth-callback.html`;

const dashboardForRole = (role) => (
  role === "provider"
    ? "/provider/dashboard.html"
    : "/client/discover.html"
);

const onboardingForRole = (role) => (
  role === "provider"
    ? "/provider/onboarding.html"
    : "/client/onboarding.html"
);

const loginForRole = (role) => (
  role === "provider"
    ? "/shared/login-provider.html"
    : "/shared/login-client.html"
);

const setStatus = (message, type = "") => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const getRolesFromMetadata = (metadata) => {
  const normalized = [];
  if (Array.isArray(metadata?.roles)) {
    metadata.roles.forEach((role) => {
      if (typeof role === "string" && role) normalized.push(role);
    });
  }
  if (typeof metadata?.role === "string" && metadata.role) normalized.push(metadata.role);
  if (!normalized.length) normalized.push("client");
  return Array.from(new Set(normalized));
};

const userHasRole = (user, role) => getRolesFromMetadata(user?.user_metadata).includes(role);

const hasProviderProfile = async (userId) => {
  if (!authSupabase || !userId) return false;
  const { count, error } = await authSupabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (error) throw error;
  return (count || 0) > 0;
};

const setLastActiveRole = (role) => {
  localStorage.setItem("nlink_last_role", role);
};

const onboardingFlagForRole = (role) => `onboarding_${role}_complete`;
const isOnboardingComplete = (user, role) => user?.user_metadata?.[onboardingFlagForRole(role)] === true;
const routeAfterAuth = (user, role) => (
  isOnboardingComplete(user, role)
    ? dashboardForRole(role)
    : onboardingForRole(role)
);

const setPendingSignup = (email, role) => {
  sessionStorage.setItem("nlink_pending_signup", JSON.stringify({
    email,
    role,
    timestamp: Date.now(),
  }));
};

const getPendingSignup = () => {
  try {
    return JSON.parse(sessionStorage.getItem("nlink_pending_signup") || "null");
  } catch (_error) {
    return null;
  }
};

const clearPendingSignup = () => {
  sessionStorage.removeItem("nlink_pending_signup");
};

const togglePasswordVisibility = (button) => {
  const targetId = button.dataset.target;
  const input = document.getElementById(targetId);
  if (!input) return;
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.classList.toggle("is-hidden", !isHidden);
  button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
};

const redirectIfAlreadySignedIn = async () => {
  if (!authSupabase) return;
  const { data } = await authSupabase.auth.getSession();
  if (!data?.session?.user) return;
  const roles = getRolesFromMetadata(data.session.user.user_metadata);
  const role = roles.includes(pageRole) ? pageRole : roles[0];
  setLastActiveRole(role);
  window.location.href = routeAfterAuth(data.session.user, role);
};

const handleSubmit = async (event) => {
  event.preventDefault();

  if (!authClientReady) {
    setStatus("Supabase is not configured yet.", "error");
    return;
  }

  const email = emailInput?.value.trim() || "";
  const businessName = businessNameInput?.value.trim() || "";
  const phone = phoneInput?.value.trim() || "";
  const password = passwordInput?.value.trim() || "";

  try {
    if (pageMode === "signin") {
      const { data, error } = await authSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = data.user;
      if (!userHasRole(user, pageRole)) {
        await authSupabase.auth.signOut();
        setStatus(
          `This account does not have ${pageRole} access yet. Use Create Account on the ${pageRole} portal with this same email/password to add it.`,
          "error",
        );
        return;
      }
      if (pageRole === "provider") {
        const providerExists = await hasProviderProfile(user.id);
        if (!providerExists && isOnboardingComplete(user, pageRole)) {
          await authSupabase.auth.signOut();
          setStatus(
            "Provider profile not found. Use Provider Create Account with the same email/password to re-enable provider access.",
            "error",
          );
          return;
        }
      }
      setLastActiveRole(pageRole);
      window.location.href = routeAfterAuth(user, pageRole);
      return;
    }

    if (pageMode === "signup") {
      if (password !== confirmInput?.value.trim()) {
        setStatus("Passwords do not match.", "error");
        return;
      }

      const { data, error } = await authSupabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailConfirmRedirectUrl(),
          data: {
            role: pageRole,
            roles: [pageRole],
            provider_business_name: pageRole === "provider" ? businessName : undefined,
            contact_phone: phone || undefined,
          },
        },
      });
      if (error) throw error;

      if (data.user?.identities?.length === 0) {
        const { data: existingData, error: signInError } = await authSupabase.auth.signInWithPassword({ email, password });
        if (signInError || !existingData?.user) {
          setStatus("Account exists. Use your existing password to add this role, or login.", "error");
          return;
        }

        const existingUser = existingData.user;
        const existingRoles = getRolesFromMetadata(existingUser.user_metadata);
        if (existingRoles.includes(pageRole)) {
          setLastActiveRole(pageRole);
          window.location.href = routeAfterAuth(existingUser, pageRole);
          return;
        }

        const nextRoles = [...existingRoles, pageRole];
        const { error: updateError } = await authSupabase.auth.updateUser({
          data: {
            ...(existingUser.user_metadata || {}),
            roles: nextRoles,
            role: existingUser.user_metadata?.role || nextRoles[0] || "client",
            provider_business_name: pageRole === "provider"
              ? (businessName || existingUser.user_metadata?.provider_business_name || "")
              : existingUser.user_metadata?.provider_business_name,
            contact_phone: phone || existingUser.user_metadata?.contact_phone || "",
          },
        });
        if (updateError) throw updateError;

        setLastActiveRole(pageRole);
        setStatus(`${pageRole === "provider" ? "Provider" : "Client"} access added. Redirecting...`, "success");
        window.setTimeout(() => {
          window.location.href = routeAfterAuth(existingData.user, pageRole);
        }, 900);
        return;
      }

      if (data.session?.user) {
        clearPendingSignup();
        setLastActiveRole(pageRole);
        window.location.href = routeAfterAuth(data.session.user, pageRole);
        return;
      }

      setPendingSignup(email, pageRole);
      window.location.href = `/shared/check-email.html?role=${encodeURIComponent(pageRole)}&email=${encodeURIComponent(email)}`;
      return;
    }

    if (pageMode === "reset") {
      const { error } = await authSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getAppOrigin()}/shared/auth-reset.html`,
      });
      if (error) throw error;
      setStatus("Password reset email sent.", "success");
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
  }
};

const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
};

const setupVerifyPendingPage = async () => {
  const pending = getPendingSignup();
  const query = new URLSearchParams(window.location.search);
  const role = query.get("role") || pending?.role || "client";
  const email = query.get("email") || pending?.email || "";
  const roleLabel = role === "provider" ? "Provider" : "Client";

  setText("verify-role-label", roleLabel);
  setText("verify-email-value", email || "your email");

  const loginLink = document.getElementById("verify-login-link");
  if (loginLink) loginLink.href = loginForRole(role);

  if (!authSupabase) {
    setStatus("Supabase is not configured yet.", "error");
    return;
  }

  const { data } = await authSupabase.auth.getSession();
  if (data?.session?.user) {
    clearPendingSignup();
    const roles = getRolesFromMetadata(data.session.user.user_metadata);
    const currentRole = roles.includes(role) ? role : roles[0];
    setLastActiveRole(currentRole);
    window.location.href = routeAfterAuth(data.session.user, currentRole);
  }
};

const setupEmailConfirmPage = async () => {
  if (!authSupabase) {
    setStatus("Supabase is not configured yet.", "error");
    return;
  }

  const query = new URLSearchParams(window.location.search);
  const hashString = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hash = new URLSearchParams(hashString);
  const errorMessage = query.get("error_description")
    || hash.get("error_description")
    || query.get("error")
    || hash.get("error");

  if (errorMessage) {
    setStatus(decodeURIComponent(errorMessage), "error");
    return;
  }

  const code = query.get("code");
  if (code) {
    const { error } = await authSupabase.auth.exchangeCodeForSession(code);
    if (error) {
      setStatus(error.message || "Confirmation failed. Please try again.", "error");
      return;
    }
  }

  if (!code && hash.get("access_token") && hash.get("refresh_token")) {
    const { error } = await authSupabase.auth.setSession({
      access_token: hash.get("access_token"),
      refresh_token: hash.get("refresh_token"),
    });
    if (error) {
      setStatus(error.message || "Could not complete sign in after confirmation.", "error");
      return;
    }
  }

  const { data } = await authSupabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    setStatus("Email confirmed. Return to login to continue.", "success");
    clearPendingSignup();
    return;
  }

  const pendingRole = getPendingSignup()?.role;
  const roles = getRolesFromMetadata(user.user_metadata);
  const role = pendingRole && roles.includes(pendingRole) ? pendingRole : roles[0];
  clearPendingSignup();
  setLastActiveRole(role);
  setStatus("Email confirmed. Redirecting to your dashboard...", "success");
  window.setTimeout(() => {
    window.location.href = routeAfterAuth(user, role);
  }, 1200);
};

if (toggleButtons.length) {
  toggleButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePasswordVisibility(button);
    });
  });
}

if (form) form.addEventListener("submit", handleSubmit);

if (pageMode === "verify-pending") {
  setupVerifyPendingPage();
} else if (pageMode === "email-confirm") {
  setupEmailConfirmPage();
} else {
  redirectIfAlreadySignedIn();
}
