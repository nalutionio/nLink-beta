(() => {
  const button = document.getElementById("replay-tour-btn");
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!button) return;

  const path = window.location.pathname || "";
  const role = path.includes("/provider/") ? "provider" : "client";
  const redirectBase = role === "provider" ? "../provider/provider-jobs.html" : "../client/discover.html";
  const redirect = `${redirectBase}?tour=1`;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Starting tour...";
    try {
      if (!supabase) {
        window.location.href = redirect;
        return;
      }
      const { data } = await supabase.auth.getSession();
      const userId = data?.session?.user?.id;
      if (userId) {
        localStorage.removeItem(`plugfeed_tutorial_seen:${role}:${userId}`);
        sessionStorage.setItem(`plugfeed_tutorial_force:${role}:${userId}`, "1");
      }
      window.location.href = redirect;
      return;
    } catch (_error) {
      // Keep UX resilient even if session read fails.
      window.location.href = redirect;
      return;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
})();
