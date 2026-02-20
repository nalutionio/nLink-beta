(() => {
  const guardSupabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;

  const getRolesFromMetadataLocal = (metadata) => {
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

  const getDashboardForUser = (user) => {
    const roles = getRolesFromMetadataLocal(user?.user_metadata);
    const lastRole = localStorage.getItem("nlink_last_role");
    const role = (lastRole && roles.includes(lastRole)) ? lastRole : roles[0];
    const onboardingComplete = user?.user_metadata?.[`onboarding_${role}_complete`] === true;
    if (!onboardingComplete) {
      return role === "provider"
        ? "/provider/onboarding.html"
        : "/client/onboarding.html";
    }
    return role === "provider"
      ? "/provider/dashboard.html"
      : "/client/discover.html";
  };

  window.redirectIfSignedIn = async (target) => {
    if (!guardSupabase) return;
    const { data } = await guardSupabase.auth.getSession();
    if (data?.session?.user) {
      window.location.href = target || getDashboardForUser(data.session.user);
    }
  };
})();
