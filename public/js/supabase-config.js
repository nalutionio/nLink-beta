window.NLINK_SUPABASE = {
  url: "https://xqfxlqlzuhdblotkenwd.supabase.co",
  anonKey: "sb_publishable_Zzy3KtIHuU_DO5X7Qpieog_HRv6B51G",
};

window.getNlinkSupabaseClient = () => {
  if (window.__NLINK_SUPABASE_CLIENT) return window.__NLINK_SUPABASE_CLIENT;
  const cfg = window.NLINK_SUPABASE || {};
  if (!cfg.url || !cfg.anonKey || !window.supabase) return null;
  window.__NLINK_SUPABASE_CLIENT = window.supabase.createClient(cfg.url, cfg.anonKey);
  return window.__NLINK_SUPABASE_CLIENT;
};
