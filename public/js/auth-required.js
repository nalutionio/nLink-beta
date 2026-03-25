const authReqSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

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

const dashboardForRole = (role) => (
  role === "provider"
    ? "/provider/provider-jobs.html"
    : "/client/discover.html"
);

const injectRoleSwitch = (roles, path) => {
  const hasClient = roles.includes("client");
  const hasProvider = roles.includes("provider");
  if (!(hasClient && hasProvider)) return;

  const isProviderArea = path.includes("/provider/");
  const isClientArea = path.includes("/client/");
  const targetRole = isProviderArea ? "client" : "provider";
  if ((targetRole === "client" && !hasClient) || (targetRole === "provider" && !hasProvider)) return;

  const isClientProfilePage = path.includes("/client/client-profile.html");
  const isProviderProfilePage = path.includes("/provider/profile.html");
  if (!(isClientProfilePage || isProviderProfilePage)) return;

  const header = document.querySelector(".topbar, .app-header");
  if (!header) return;

  let switchLink = document.getElementById("role-switch-link");
  if (!switchLink) {
    switchLink = document.createElement("a");
    switchLink.id = "role-switch-link";
    switchLink.className = "ghost-button role-switch-button";
    header.appendChild(switchLink);
  }

  switchLink.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">swap_horiz</span>';
  switchLink.setAttribute("aria-label", targetRole === "provider" ? "Switch to Plug" : "Switch to Neighbor");
  switchLink.title = targetRole === "provider" ? "Switch to Plug" : "Switch to Neighbor";
  switchLink.href = dashboardForRole(targetRole);
  switchLink.addEventListener("click", () => {
    localStorage.setItem("nlink_last_role", targetRole);
  });
};

const requireAuth = async (redirectTo = "/landing.html") => {
  if (!authReqSupabase) return;
  const { data } = await authReqSupabase.auth.getSession();
  if (!data?.session?.user) {
    window.location.href = redirectTo;
    return;
  }

  const roles = getRolesFromMetadata(data.session.user.user_metadata);
  const path = window.location.pathname || "";
  const isProviderArea = path.includes("/provider/");
  const isClientArea = path.includes("/client/");

  if (isProviderArea && !roles.includes("provider")) {
    window.location.href = "/client/discover.html";
    return;
  }

  if (isClientArea && !roles.includes("client")) {
    window.location.href = "/provider/provider-jobs.html";
    return;
  }

  const isClientOnboardingPage = path.includes("/client/onboarding.html");
  if (isClientArea && roles.includes("client") && !isClientOnboardingPage) {
    const clientOnboardingDone = data.session.user.user_metadata?.onboarding_client_complete === true;
    if (!clientOnboardingDone) {
      window.location.href = "/client/onboarding.html";
      return;
    }
  }

  const currentRole = isProviderArea ? "provider" : "client";
  localStorage.setItem("nlink_last_role", currentRole);
  injectRoleSwitch(roles, path);
};
