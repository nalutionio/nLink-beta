const signoutSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const signOutButton = document.getElementById("sign-out");

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    if (signoutSupabase) {
      await signoutSupabase.auth.signOut();
    }
    window.location.href = "/shared/auth-choice.html";
  });
}
