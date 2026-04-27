(function initFirstRunTutorial() {
  const supabase = typeof window.getNlinkSupabaseClient === "function"
    ? window.getNlinkSupabaseClient()
    : null;
  if (!supabase) return;

  const path = window.location.pathname || "";
  const role = path.includes("/provider/provider-jobs.html") ? "provider"
    : path.includes("/client/discover.html") ? "client"
      : "";
  if (!role) return;

  const flagName = role === "provider" ? "tutorial_provider_seen" : "tutorial_client_seen";
  const urlParams = new URLSearchParams(window.location.search || "");
  const forcedFromUrl = urlParams.get("tour") === "1";

  const sanitizeMetadata = (metadata = {}) => {
    const next = { ...(metadata || {}) };
    const dropDataImage = (key) => {
      if (typeof next[key] === "string" && next[key].startsWith("data:image/")) delete next[key];
    };
    dropDataImage("client_banner_url");
    dropDataImage("provider_banner_url");
    if (next.client_property_profile && typeof next.client_property_profile === "object") {
      delete next.client_property_profile;
    }
    return next;
  };

  const getSteps = () => {
    if (role === "provider") {
      return [
        {
          selector: ".job-feed .job-card",
          targetKey: "provider-discover-job",
          title: "Welcome To Plug Discover",
          body: "This feed is your lead lane. Open each Neighbor job and send a clean proposal fast.",
          ringPadding: 6,
        },
        {
          selector: "main .panel",
          title: "Filter Jobs Fast",
          body: "Use category, location, and budget filters to lock into jobs that match your service.",
        },
        {
          selector: '.bottom-nav a[href*="provider-requests"]',
          title: "Proposals",
          body: "Track Direct Requests, pending proposals, accepted work, and completed jobs in one place.",
        },
        {
          selector: '.bottom-nav a[href*="community"]',
          title: "Community",
          body: "Post tips and project updates to build trust. Trust drives more hires.",
        },
        {
          selector: '.bottom-nav a[href*="provider-messages"]',
          title: "Messages",
          body: "When a Neighbor opens the thread, you can coordinate cleanly and keep momentum.",
        },
        {
          selector: '.bottom-nav a[href*="profile"]',
          title: "Profile",
          body: "Keep your Plug profile sharp. Better profiles win better requests.",
        },
      ];
    }

    return [
      {
        selector: ".card-stack .card-content.compact-card",
        targetKey: "discover-card-info",
        title: "Welcome To PlugFeed",
        body: "Swipe through local Plugs here. Save the best fits and open full profiles before deciding.",
        dockMobile: "top",
        ringPadding: 2,
      },
      {
        selector: "#filters-panel",
        title: "Use Filters",
        body: "Set service, tags, budget, and location so your feed stays relevant to your exact need.",
      },
      {
        selector: '.bottom-nav a[href*="community"]',
        title: "Community",
        body: "Ask for help, read recommendations, and Plug a Pro. Community builds confidence before hiring.",
      },
      {
        selector: '.bottom-nav a[href*="client-jobs"]',
        title: "Jobs",
        body: "Post requests, compare proposals, accept your best match, and track the full flow.",
      },
      {
        selector: '.bottom-nav a[href*="client-messages"]',
        title: "Messages",
        body: "Message only the Plugs you choose. You stay in control of contact.",
      },
      {
        selector: '.bottom-nav a[href*="client-profile"]',
        title: "Profile",
        body: "Update your Neighbor profile and property details for better proposal quality.",
      },
    ];
  };

  const renderTutorial = async (user) => {
    const localKey = `plugfeed_tutorial_seen:${role}:${user.id}`;
    const forceKey = `plugfeed_tutorial_force:${role}:${user.id}`;
    const forcedReplay = forcedFromUrl || sessionStorage.getItem(forceKey) === "1";
    if (!forcedReplay && localStorage.getItem(localKey) === "1") return;
    if (!forcedReplay && user?.user_metadata?.[flagName] === true) {
      localStorage.setItem(localKey, "1");
      return;
    }
    if (forcedReplay) {
      sessionStorage.removeItem(forceKey);
      if (forcedFromUrl) {
        urlParams.delete("tour");
        const nextQuery = urlParams.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, "", nextUrl);
      }
    }

    const steps = getSteps();
    let index = 0;
    let currentTarget = null;
    let stepRetryTimer = null;

    const shell = document.createElement("div");
    shell.className = "tutorial-shell";
    shell.id = "first-run-tutorial";
    shell.innerHTML = `
      <div class="tutorial-dim top" data-dim="top"></div>
      <div class="tutorial-dim left" data-dim="left"></div>
      <div class="tutorial-dim right" data-dim="right"></div>
      <div class="tutorial-dim bottom" data-dim="bottom"></div>
      <div class="tutorial-focus-ring" id="tutorial-focus-ring"></div>
      <div class="tutorial-popover" id="tutorial-popover">
        <div class="tutorial-popover-head">
          <p class="kicker">Quick Tour</p>
          <button class="ghost-button compact" type="button" data-action="skip">Skip</button>
        </div>
        <h3 id="tutorial-title"></h3>
        <p class="muted" id="tutorial-body"></p>
        <div class="tutorial-progress" id="tutorial-progress"></div>
        <div class="tutorial-actions">
          <button class="ghost-button" type="button" data-action="back">Back</button>
          <button class="primary-button" type="button" data-action="next">Next</button>
        </div>
      </div>
    `;

    const focusRing = shell.querySelector("#tutorial-focus-ring");
    const popover = shell.querySelector("#tutorial-popover");
    const titleEl = shell.querySelector("#tutorial-title");
    const bodyEl = shell.querySelector("#tutorial-body");
    const progressEl = shell.querySelector("#tutorial-progress");
    const backBtn = shell.querySelector('[data-action="back"]');
    const nextBtn = shell.querySelector('[data-action="next"]');

    const setDims = (rect) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = Math.max(0, rect.top);
      const left = Math.max(0, rect.left);
      const right = Math.min(vw, rect.right);
      const bottom = Math.min(vh, rect.bottom);

      const dims = {
        top: shell.querySelector('[data-dim="top"]'),
        left: shell.querySelector('[data-dim="left"]'),
        right: shell.querySelector('[data-dim="right"]'),
        bottom: shell.querySelector('[data-dim="bottom"]'),
      };

      if (dims.top) {
        dims.top.style.top = "0px";
        dims.top.style.left = "0px";
        dims.top.style.width = `${vw}px`;
        dims.top.style.height = `${top}px`;
      }
      if (dims.left) {
        dims.left.style.top = `${top}px`;
        dims.left.style.left = "0px";
        dims.left.style.width = `${left}px`;
        dims.left.style.height = `${Math.max(0, bottom - top)}px`;
      }
      if (dims.right) {
        dims.right.style.top = `${top}px`;
        dims.right.style.left = `${right}px`;
        dims.right.style.width = `${Math.max(0, vw - right)}px`;
        dims.right.style.height = `${Math.max(0, bottom - top)}px`;
      }
      if (dims.bottom) {
        dims.bottom.style.top = `${bottom}px`;
        dims.bottom.style.left = "0px";
        dims.bottom.style.width = `${vw}px`;
        dims.bottom.style.height = `${Math.max(0, vh - bottom)}px`;
      }
    };

    const positionPopover = (rect, step = {}) => {
      if (!popover) return;
      const useDockedMobile = window.innerWidth <= 760 || window.innerHeight <= 720;
      if (useDockedMobile) {
        const targetCenterY = rect.top + (rect.height / 2);
        const computedTop = targetCenterY > (window.innerHeight * 0.56);
        const showOnTop = step.dockMobile === "top"
          ? true
          : step.dockMobile === "bottom"
            ? false
            : computedTop;
        const safeTop = 12;
        const safeBottom = 12 + (window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0);
        const dockedMaxHeight = Math.min(window.innerHeight * 0.46, 360);
        const expectedHeight = Math.min(Math.max(120, popover.scrollHeight), dockedMaxHeight);
        let resolvedTop = showOnTop;
        const topBottom = safeTop + expectedHeight;
        const bottomTop = window.innerHeight - safeBottom - expectedHeight;
        if (resolvedTop && rect.top < topBottom + 10) {
          resolvedTop = false;
        } else if (!resolvedTop && rect.bottom > bottomTop - 10) {
          resolvedTop = true;
        }
        popover.classList.add("tutorial-popover-docked");
        popover.classList.toggle("tutorial-popover-docked-top", resolvedTop);
        popover.classList.toggle("tutorial-popover-docked-bottom", !resolvedTop);
        popover.style.top = "";
        popover.style.left = "";
        return;
      }
      popover.classList.remove("tutorial-popover-docked");
      popover.classList.remove("tutorial-popover-docked-top");
      popover.classList.remove("tutorial-popover-docked-bottom");
      const margin = 12;
      const popRect = popover.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeAbove = spaceBelow < popRect.height + 20;
      const top = placeAbove
        ? Math.max(margin, rect.top - popRect.height - 12)
        : Math.min(window.innerHeight - popRect.height - margin, rect.bottom + 12);
      const left = Math.min(
        window.innerWidth - popRect.width - margin,
        Math.max(margin, rect.left),
      );
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    };

    const clearTarget = () => {
      if (!currentTarget) return;
      currentTarget.classList.remove("tutorial-target-highlight");
      currentTarget = null;
    };

    const resolveStepTarget = (step) => {
      if (!step) return null;
      if (step.targetKey === "discover-card-info") {
        const matches = Array.from(document.querySelectorAll(".card-stack .card-content.compact-card"));
        return matches.length ? matches[matches.length - 1] : null;
      }
      if (step.targetKey === "provider-discover-job") {
        const matches = Array.from(document.querySelectorAll(".job-feed .job-card"));
        return matches.length ? matches[0] : null;
      }
      return resolveTarget(step.selector);
    };

    const resolveTarget = (selector) => {
      if (!selector) return null;
      return document.querySelector(selector);
    };

    const markSeen = async () => {
      localStorage.setItem(localKey, "1");
      try {
        const metadata = sanitizeMetadata(user.user_metadata || {});
        if (metadata[flagName] !== true) {
          const payload = { ...metadata, [flagName]: true };
          const { error } = await supabase.auth.updateUser({ data: payload });
          if (!error) user.user_metadata = payload;
        }
      } catch (_error) {
        // best effort
      }
    };

    const closeTutorial = async () => {
      if (stepRetryTimer) {
        clearTimeout(stepRetryTimer);
        stepRetryTimer = null;
      }
      window.removeEventListener("resize", renderStep);
      window.removeEventListener("scroll", renderStep, true);
      clearTarget();
      await markSeen();
      shell.remove();
    };

    function renderStep() {
      const step = steps[index];
      if (popover) popover.scrollTop = 0;
      if (titleEl) titleEl.textContent = step.title;
      if (bodyEl) bodyEl.textContent = step.body;
      if (progressEl) {
        progressEl.innerHTML = steps
          .map((_, i) => `<span class="tutorial-dot ${i === index ? "active" : ""}"></span>`)
          .join("");
      }
      if (backBtn) backBtn.disabled = index === 0;
      if (nextBtn) nextBtn.textContent = index === steps.length - 1 ? "Done" : "Next";

      clearTarget();
      const target = resolveStepTarget(step);
      if (!target || !focusRing) {
        if (stepRetryTimer) clearTimeout(stepRetryTimer);
        stepRetryTimer = setTimeout(() => {
          stepRetryTimer = null;
          renderStep();
        }, 140);
        const fallbackRect = {
          top: window.innerHeight * 0.18,
          left: 16,
          right: window.innerWidth - 16,
          bottom: window.innerHeight * 0.36,
          width: window.innerWidth - 32,
          height: window.innerHeight * 0.18,
        };
        setDims(fallbackRect);
        focusRing.style.top = `${fallbackRect.top}px`;
        focusRing.style.left = `${fallbackRect.left}px`;
        focusRing.style.width = `${fallbackRect.width}px`;
        focusRing.style.height = `${fallbackRect.height}px`;
        positionPopover(fallbackRect, step);
        return;
      }
      if (stepRetryTimer) {
        clearTimeout(stepRetryTimer);
        stepRetryTimer = null;
      }

      currentTarget = target;
      currentTarget.classList.add("tutorial-target-highlight");
      currentTarget.scrollIntoView({ block: "center", behavior: "auto" });
      const rect = currentTarget.getBoundingClientRect();
      const ringPadding = Number.isFinite(step.ringPadding) ? Number(step.ringPadding) : 6;
      setDims(rect);
      focusRing.style.top = `${rect.top - ringPadding}px`;
      focusRing.style.left = `${rect.left - ringPadding}px`;
      focusRing.style.width = `${rect.width + (ringPadding * 2)}px`;
      focusRing.style.height = `${rect.height + (ringPadding * 2)}px`;
      positionPopover(rect, step);
    }

    shell.querySelector('[data-action="skip"]')?.addEventListener("click", () => {
      closeTutorial();
    });
    backBtn?.addEventListener("click", () => {
      if (index > 0) {
        index -= 1;
        renderStep();
      }
    });
    nextBtn?.addEventListener("click", () => {
      if (index >= steps.length - 1) {
        closeTutorial();
        return;
      }
      index += 1;
      renderStep();
    });

    document.body.appendChild(shell);
    window.addEventListener("resize", renderStep);
    window.addEventListener("scroll", renderStep, true);
    renderStep();
  };

  const boot = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;
    if (!forcedFromUrl) {
      if (role === "client" && user.user_metadata?.onboarding_client_complete !== true) return;
      if (role === "provider" && user.user_metadata?.onboarding_provider_complete !== true) return;
    }
    await renderTutorial(user);
  };

  boot();
})();
