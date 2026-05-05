(function initAccessControl() {
  const getSupabase = () => (typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null);

  const getMetadataRoles = (metadata) => {
    const roles = [];
    if (Array.isArray(metadata?.roles)) {
      metadata.roles.forEach((role) => {
        if (typeof role === "string" && role.trim()) roles.push(role.trim().toLowerCase());
      });
    }
    if (typeof metadata?.role === "string" && metadata.role.trim()) roles.push(metadata.role.trim().toLowerCase());
    return Array.from(new Set(roles));
  };

  const getInternalRoles = async (supabase, userId) => {
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from("internal_roles")
      .select("role")
      .eq("user_id", userId);
    if (error || !Array.isArray(data)) return [];
    return Array.from(new Set(data.map((row) => String(row.role || "").toLowerCase()).filter(Boolean)));
  };

  window.PLUGFEED_ACCESS = {
    getMetadataRoles,
    async getAllRoles() {
      const supabase = getSupabase();
      if (!supabase) return [];
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user || null;
      if (!user) return [];
      const metaRoles = getMetadataRoles(user.user_metadata || {});
      const internalRoles = await getInternalRoles(supabase, user.id);
      return Array.from(new Set([...metaRoles, ...internalRoles]));
    },
    async requireRole(allowedRoles = []) {
      const normalized = Array.isArray(allowedRoles)
        ? allowedRoles.map((role) => String(role || "").toLowerCase()).filter(Boolean)
        : [];
      if (!normalized.length) return true;
      const roles = await window.PLUGFEED_ACCESS.getAllRoles();
      return roles.some((role) => normalized.includes(role));
    },
    async requirePermission(permissionKey) {
      const key = String(permissionKey || "").trim();
      if (!key) return false;
      const supabase = getSupabase();
      if (!supabase) return false;
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user || null;
      if (!user) return false;
      const { data: rows, error } = await supabase
        .from("internal_role_permissions")
        .select("permission_key,role")
        .in("role", await getInternalRoles(supabase, user.id));
      if (error || !Array.isArray(rows)) return false;
      return rows.some((row) => String(row.permission_key || "") === key);
    },
  };
})();
