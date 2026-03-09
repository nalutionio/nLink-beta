const signoutSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const signOutButton = document.getElementById("sign-out");

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      if (signoutSupabase) {
        await signoutSupabase.auth.signOut();
      }
    } catch (_error) {
      // Network failures should not block local sign-out UX.
    }
    const removeByPrefix = (storage, prefixes) => {
      const keys = Object.keys(storage || {});
      keys.forEach((key) => {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          storage.removeItem(key);
        }
      });
    };
    const keysToClear = [
      "nlink_primary_provider_id",
      "nlink_provider_draft",
      "nlink_profile_draft",
      "nlink_gallery_draft",
      "nlink_provider_meta",
      "nlink_badge_legend_seen_provider",
      "nlink_badge_legend_seen_client",
    ];
    keysToClear.forEach((key) => localStorage.removeItem(key));
    removeByPrefix(localStorage, ["nlink_seen_", "nlink_", "sb-", "supabase.auth."]);
    removeByPrefix(sessionStorage, ["nlink_seen_", "nlink_", "sb-", "supabase.auth."]);
    window.location.replace("/shared/auth-choice.html");
  });
}
