(() => {
  const nav = document.querySelector("[data-settings-nav]");
  if (!nav) return;

  const buttons = Array.from(nav.querySelectorAll(".settings-nav-item[data-target]"));
  if (!buttons.length) return;

  const sections = Array.from(document.querySelectorAll(".settings-section[id]"));

  const setActive = (targetId) => {
    buttons.forEach((button) => {
      const isActive = button.dataset.target === targetId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    sections.forEach((section) => {
      const isActive = section.id === targetId;
      section.classList.toggle("active", isActive);
      section.hidden = !isActive;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => setActive(button.dataset.target));
  });

  const firstTarget = buttons[0]?.dataset.target || "";
  if (firstTarget) setActive(firstTarget);
})();
