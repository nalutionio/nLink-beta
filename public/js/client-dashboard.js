const dashboardSupabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const savedCountEl = document.getElementById("client-stat-saved");
const savedTrendEl = document.getElementById("client-stat-saved-trend");
const bookingsEl = document.getElementById("client-stat-bookings");
const reviewsEl = document.getElementById("client-stat-reviews");
const headingEl = document.querySelector(".topbar-title h1");

const storageKey = "nlink_saved";

const getSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch (_error) {
    return [];
  }
};

const loadDashboard = async () => {
  const saved = getSaved();
  if (savedCountEl) savedCountEl.textContent = String(saved.length);
  if (savedTrendEl) {
    savedTrendEl.textContent = saved.length
      ? `${saved.length} provider${saved.length === 1 ? "" : "s"} in your shortlist`
      : "Start swiping to build your shortlist";
    savedTrendEl.classList.toggle("up", saved.length > 0);
  }
  if (bookingsEl) bookingsEl.textContent = "0";
  if (reviewsEl) reviewsEl.textContent = "0";

  if (!dashboardSupabase) return;
  const { data } = await dashboardSupabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const displayName = user.user_metadata?.client_name || user.email?.split("@")[0] || "there";
  if (headingEl) headingEl.textContent = `Welcome back, ${displayName}.`;
};

loadDashboard();
