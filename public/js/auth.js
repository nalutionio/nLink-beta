/*
  NLink auth (Supabase) - beta
  Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project credentials.
*/

const { url: AUTH_SUPABASE_URL, anonKey: AUTH_SUPABASE_ANON_KEY } = window.NLINK_SUPABASE || {};
const statusEl = document.getElementById("auth-status");
const form = document.getElementById("auth-form");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const passwordField = passwordInput ? passwordInput.closest(".password-field") : null;
const confirmInput = document.getElementById("auth-confirm");
const confirmWrap = document.getElementById("confirm-wrap");
const toggleButtons = document.querySelectorAll(".toggle-password");
const submitButton = document.getElementById("auth-submit");
const authActions = document.getElementById("auth-actions");
const signOutButton = document.getElementById("sign-out");
const tabs = document.querySelectorAll(".auth-tabs .tab");
const signupType = document.getElementById("signup-type");
const brandLink = document.getElementById("auth-brand");

let currentMode = "signin";

const authClientReady = Boolean(AUTH_SUPABASE_URL) && Boolean(AUTH_SUPABASE_ANON_KEY);
const authSupabase = (authClientReady && window.supabase)
  ? window.supabase.createClient(AUTH_SUPABASE_URL, AUTH_SUPABASE_ANON_KEY)
  : null;
const isFileProtocol = window.location.protocol === "file:";
const fallbackRedirect = "http://localhost:5173/public/shared/auth.html";
const getRedirectUrl = () => (isFileProtocol ? fallbackRedirect : window.location.href);

const setStatus = (message, type = "") => {
  statusEl.textContent = message;
  statusEl.className = `auth-status ${type}`.trim();
};

const updateMode = (mode) => {
  currentMode = mode;
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === mode));
  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  if (passwordField) passwordField.classList.toggle("hidden", isReset);
  if (passwordInput) {
    passwordInput.required = !isReset;
    if (isReset) passwordInput.value = "";
    passwordInput.type = "password";
  }

  if (confirmWrap) confirmWrap.classList.toggle("hidden", !isSignup);
  if (confirmInput) {
    confirmInput.required = isSignup;
    if (!isSignup) confirmInput.value = "";
    confirmInput.type = "password";
  }

  toggleButtons.forEach((button) => {
    const targetId = button.dataset.target;
    const shouldShow =
      targetId === "auth-password"
        ? !isReset
        : isSignup;
    button.classList.toggle("hidden", !shouldShow);
    button.classList.add("is-hidden");
  });
  signupType.hidden = mode !== "signup";

  if (mode === "signin") {
    submitButton.textContent = "Sign In";
    setStatus("", "");
  } else if (mode === "signup") {
    submitButton.textContent = "Create Account";
    setStatus("", "");
  } else {
    submitButton.textContent = "Send Reset Link";
    setStatus("", "");
  }
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

const toggleSignedIn = (email) => {
  if (email) {
    authActions.hidden = false;
    setStatus(`Signed in as ${email}`, "success");
  } else {
    authActions.hidden = true;
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();

  if (!authClientReady) {
    setStatus("Add your Supabase URL and anon key in auth.js.", "error");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    if (currentMode === "signin") {
      const { data, error } = await authSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toggleSignedIn(data.user?.email);
      setStatus("Signed in successfully.", "success");
    }

    if (currentMode === "signup") {
      if (password !== confirmInput.value.trim()) {
        setStatus("Passwords do not match.", "error");
        return;
      }
      const role = document.querySelector("input[name='role']:checked")?.value || "client";
      const { data, error } = await authSupabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl(),
          data: { role },
        },
      });
      if (error) throw error;
      if (data.user?.identities?.length === 0) {
        setStatus("Account already exists. Try signing in.", "error");
      } else {
        setStatus("Check your email to confirm your account.", "success");
      }
    }

    if (currentMode === "reset") {
      const { error } = await authSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl(),
      });
      if (error) throw error;
      setStatus("Password reset email sent.", "success");
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
  }
};

const init = async () => {
  updateMode("signin");
  form.addEventListener("submit", handleSubmit);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => updateMode(tab.dataset.tab));
  });

  toggleButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePasswordVisibility(button);
    });
  });

  if (!authClientReady) {
    setStatus("Add your Supabase URL and anon key in auth.js to enable sign in.", "info");
    return;
  }

  if (isFileProtocol) {
    setStatus("Open via http://localhost:5173/auth.html so email links can return correctly.", "info");
  }

  const { data } = await authSupabase.auth.getSession();
  toggleSignedIn(data.session?.user?.email);
  if (data.session?.user && brandLink) {
    brandLink.setAttribute("href", "dashboard.html");
  }

  authSupabase.auth.onAuthStateChange((_event, session) => {
    toggleSignedIn(session?.user?.email);
  });

  signOutButton.addEventListener("click", async () => {
    await authSupabase.auth.signOut();
    setStatus("Signed out.", "info");
  });
};

init();
