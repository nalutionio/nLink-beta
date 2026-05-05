(function initSettingsConsoleLinks() {
  const supportLink = document.querySelector("[data-access-console='support']");
  const adminLink = document.querySelector("[data-access-console='admin']");
  if (!supportLink && !adminLink) return;

  const applyVisibility = async () => {
    if (!window.PLUGFEED_ACCESS?.getAllRoles) return;
    const roles = await window.PLUGFEED_ACCESS.getAllRoles();
    const isAdmin = roles.includes("owner_admin") || roles.includes("admin");
    const isSupport = isAdmin || roles.includes("support_agent") || roles.includes("moderator");
    if (supportLink) supportLink.classList.toggle("hidden", !isSupport);
    if (adminLink) adminLink.classList.toggle("hidden", !isAdmin);
  };

  applyVisibility().catch(() => {
    if (supportLink) supportLink.classList.add("hidden");
    if (adminLink) adminLink.classList.add("hidden");
  });
})();

