(function initProviderBilling() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const planCopyEl = document.getElementById("billing-plan-copy");
  const proposalsUsedEl = document.getElementById("billing-proposals-used");
  const directUsedEl = document.getElementById("billing-direct-used");
  const statusEl = document.getElementById("billing-status");
  const upgradeBtn = document.getElementById("billing-upgrade");
  const addCardBtn = document.getElementById("billing-add-card");
  const historyBtn = document.getElementById("billing-history");

  const setStatus = (message, type = "") => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = `muted ${type}`.trim();
  };

  const startOfMonthIso = () => {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return date.toISOString().slice(0, 10);
  };

  const init = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) return;

    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!provider?.id) {
      setStatus("Plug account not found.", "error");
      return;
    }

    let { data: billing } = await supabase
      .from("provider_billing_profiles")
      .select("*")
      .eq("provider_id", provider.id)
      .maybeSingle();

    if (!billing) {
      const { data: inserted } = await supabase
        .from("provider_billing_profiles")
        .insert({ provider_id: provider.id })
        .select("*")
        .maybeSingle();
      billing = inserted || null;
    }

    const usageMonth = startOfMonthIso();
    let { data: usage } = await supabase
      .from("provider_usage_monthly")
      .select("*")
      .eq("provider_id", provider.id)
      .eq("usage_month", usageMonth)
      .maybeSingle();
    if (!usage) {
      const { data: insertedUsage } = await supabase
        .from("provider_usage_monthly")
        .insert({ provider_id: provider.id, usage_month: usageMonth })
        .select("*")
        .maybeSingle();
      usage = insertedUsage || null;
    }

    if (billing && planCopyEl) {
      const tier = String(billing.plan_tier || "free");
      const proposals = Number(billing.proposal_quota_monthly || 0);
      const direct = Number(billing.direct_request_quota_monthly || 0);
      planCopyEl.textContent = `Plan: ${tier.toUpperCase()} • Monthly quota: ${proposals} proposal responses, ${direct} direct-request responses.`;
    }
    if (proposalsUsedEl) proposalsUsedEl.textContent = String(usage?.proposals_used || 0);
    if (directUsedEl) directUsedEl.textContent = String(usage?.direct_requests_used || 0);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";

    const callProtectedApi = async (path) => {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Request failed");
      return payload;
    };

    upgradeBtn?.addEventListener("click", async () => {
      try {
        setStatus("Preparing secure checkout...", "info");
        const payload = await callProtectedApi("/api/create-checkout-session");
        if (!payload?.url) throw new Error("Checkout URL missing");
        window.location.href = payload.url;
      } catch (error) {
        setStatus(error?.message || "Could not open checkout.", "error");
      }
    });

    addCardBtn?.addEventListener("click", async () => {
      try {
        setStatus("Opening billing portal...", "info");
        const payload = await callProtectedApi("/api/create-billing-portal-session");
        if (!payload?.url) throw new Error("Billing portal URL missing");
        window.location.href = payload.url;
      } catch (error) {
        setStatus(error?.message || "Could not open billing portal.", "error");
      }
    });

    historyBtn?.addEventListener("click", async () => {
      try {
        setStatus("Opening billing portal history...", "info");
        const payload = await callProtectedApi("/api/create-billing-portal-session");
        if (!payload?.url) throw new Error("Billing portal URL missing");
        window.location.href = payload.url;
      } catch (error) {
        setStatus(error?.message || "Could not open billing history.", "error");
      }
    });
  };

  init().catch((error) => {
    setStatus(error?.message || "Could not load billing.", "error");
  });
})();
