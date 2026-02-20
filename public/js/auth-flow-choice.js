/*
  Personalize auth flow choices based on last role used.
  Uses localStorage key set during successful auth: nlink_last_role.
*/
(function applyAuthChoicePersonalization() {
  const body = document.body;
  if (!body) return;

  const flow = body.dataset.authFlow || "";
  const queryRole = new URLSearchParams(window.location.search).get("preferred");
  const lastRole = localStorage.getItem("nlink_last_role");
  const preferredRole = queryRole === "client" || queryRole === "provider"
    ? queryRole
    : (lastRole === "client" || lastRole === "provider" ? lastRole : "");

  const recent = document.getElementById("auth-choice-recent");
  if (recent && preferredRole) {
    recent.hidden = false;
    recent.textContent = `Last used: ${preferredRole === "provider" ? "Provider" : "Client"} portal`;
  }

  if (flow === "root") {
    const login = document.getElementById("auth-choice-login");
    const signup = document.getElementById("auth-choice-signup");
    if (preferredRole && login) login.href = `login-choice.html?preferred=${encodeURIComponent(preferredRole)}`;
    if (preferredRole && signup) signup.href = `signup-choice.html?preferred=${encodeURIComponent(preferredRole)}`;
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
