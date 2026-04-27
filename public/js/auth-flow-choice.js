/*
  Personalize auth flow choices based on last role used.
  Uses localStorage key set during successful auth: nlink_last_role.
*/
(function applyAuthChoicePersonalization() {
  const body = document.body;
  if (!body) return;

  const flow = body.dataset.authFlow || "";
  const params = new URLSearchParams(window.location.search);
  const queryRole = params.get("preferred");
  const queryMode = params.get("mode");
  const lastRole = localStorage.getItem("nlink_last_role");
  const mode = queryMode === "signup" ? "signup" : "login";
  const preferredRole = queryRole === "client" || queryRole === "provider"
    ? queryRole
    : (lastRole === "client" || lastRole === "provider" ? lastRole : "");

  const recent = document.getElementById("auth-choice-recent");
  if (recent && preferredRole) {
    recent.hidden = false;
    recent.textContent = `Last used: ${preferredRole === "provider" ? "Plug" : "Neighbor"} portal`;
  }

  if (flow === "root") {
    const tabs = Array.from(document.querySelectorAll("#auth-choice-mode-tabs [data-mode]"));
    const neighborLink = document.getElementById("auth-choice-neighbor");
    const plugLink = document.getElementById("auth-choice-plug");
    const cards = Array.from(document.querySelectorAll(".choice-card[data-role]"));

    const updateRoleLinks = (nextMode) => {
      const normalizedMode = nextMode === "signup" ? "signup" : "login";
      const clientHref = normalizedMode === "signup" ? "signup-client.html" : "login-client.html";
      const providerHref = normalizedMode === "signup" ? "signup-provider.html" : "login-provider.html";
      if (neighborLink) neighborLink.href = clientHref;
      if (plugLink) plugLink.href = providerHref;
      tabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.mode === normalizedMode);
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const nextMode = tab.dataset.mode === "signup" ? "signup" : "login";
        const next = new URL(window.location.href);
        next.searchParams.set("mode", nextMode);
        history.replaceState(null, "", next.toString());
        updateRoleLinks(nextMode);
      });
    });

    if (preferredRole && cards.length) {
      const preferredCard = cards.find((card) => card.dataset.role === preferredRole);
      if (preferredCard) preferredCard.classList.add("recommended");
      const firstCard = cards[0];
      if (preferredCard && firstCard && preferredCard !== firstCard && preferredCard.parentElement) {
        preferredCard.parentElement.insertBefore(preferredCard, firstCard);
      }
    }

    updateRoleLinks(mode);
    return;
  }

  const cards = Array.from(document.querySelectorAll(".choice-card[data-role]"));
  if (!cards.length || !preferredRole) return;

  const preferredCard = cards.find((card) => card.dataset.role === preferredRole);
  if (!preferredCard) return;

  preferredCard.classList.add("recommended");
  const firstCard = cards[0];
  if (firstCard && firstCard !== preferredCard && preferredCard.parentElement) {
    preferredCard.parentElement.insertBefore(preferredCard, firstCard);
  }
})();
