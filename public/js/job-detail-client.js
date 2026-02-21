const supabase = typeof window.getNlinkSupabaseClient === "function"
  ? window.getNlinkSupabaseClient()
  : null;

const titleEl = document.getElementById("job-title");
const statusEl = document.getElementById("job-status");
const metaEl = document.getElementById("job-meta");
const descriptionEl = document.getElementById("job-description");
const galleryEl = document.getElementById("job-gallery");
const requestsEl = document.getElementById("job-requests");
const closeButton = document.getElementById("job-close-btn");
const reopenButton = document.getElementById("job-reopen-btn");

let jobId = null;

const getSessionUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

const loadJob = async (userId) => {
  if (!supabase || !jobId) return null;
  const { data } = await supabase
    .from("jobs")
    .select("title,location,budget_min,budget_max,sqft,description,status,client_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data || data.client_id !== userId) return null;
  return data;
};

const loadPhotos = async () => {
  const { data } = await supabase
    .from("job_photos")
    .select("url")
    .eq("job_id", jobId);
  return data || [];
};

const loadRequests = async () => {
  const { data } = await supabase
    .from("job_requests")
    .select("id,status,created_at,provider_id,providers(name)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  return data || [];
};

const updateJobStatus = async (nextStatus) => {
  if (!supabase || !jobId) return;
  const user = await getSessionUser();
  if (!user) return;
  await supabase
    .from("jobs")
    .update({ status: nextStatus })
    .eq("id", jobId)
    .eq("client_id", user.id);
  await render();
};

const updateRequestStatus = async (requestId, nextStatus) => {
  if (!supabase || !jobId || !requestId) return;
  await supabase
    .from("job_requests")
    .update({ status: nextStatus })
    .eq("id", requestId)
    .eq("job_id", jobId);

  if (nextStatus === "accepted") {
    await supabase
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", jobId);
  }
  await render();
};

const render = async () => {
  if (!supabase) return;
  const user = await getSessionUser();
  if (!user) return;
  const job = await loadJob(user.id);
  if (!job) return;

  if (titleEl) titleEl.textContent = job.title;
  const jobStatus = job.status || "open";
  if (statusEl) statusEl.textContent = jobStatus;
  if (closeButton) closeButton.disabled = jobStatus === "closed";
  if (reopenButton) reopenButton.disabled = jobStatus === "open" || jobStatus === "in_progress";
  if (metaEl) {
    const bits = [
      job.location,
      `$${job.budget_min} - $${job.budget_max}`,
      job.sqft ? `${job.sqft} sqft` : null,
    ].filter(Boolean);
    metaEl.textContent = bits.join(" • ");
  }
  if (descriptionEl) descriptionEl.textContent = job.description || "";

  if (galleryEl) {
    const photos = await loadPhotos();
    galleryEl.innerHTML = "";
    if (photos.length === 0) {
      galleryEl.innerHTML = "<p class='muted'>No photos uploaded.</p>";
    } else {
      photos.forEach((photo) => {
        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = job.title;
        galleryEl.appendChild(img);
      });
    }
  }

  if (requestsEl) {
    const requests = await loadRequests();
    requestsEl.innerHTML = "";
    if (requests.length === 0) {
      requestsEl.innerHTML = "<p class='muted'>No requests yet.</p>";
    } else {
      requests.forEach((request) => {
        const card = document.createElement("article");
        card.className = "job-card";
        const isPending = (request.status || "pending") === "pending";
        const isAccepted = request.status === "accepted";
        card.innerHTML = `
          <div class="job-card-body">
            <h4>${request.providers?.name || "Provider"}</h4>
            <p class="muted">${new Date(request.created_at).toLocaleDateString()}</p>
          </div>
          <div class="job-actions">
            <span class="pill">${request.status || "pending"}</span>
            ${isPending ? `
              <button class="ghost-button" data-request-action="decline" data-request-id="${request.id}">Decline</button>
              <button class="primary-button" data-request-action="accept" data-request-id="${request.id}">Accept</button>
            ` : ""}
            ${isAccepted ? `<button class="ghost-button" data-request-action="close" data-request-id="${request.id}">Mark Closed</button>` : ""}
          </div>
        `;
        requestsEl.appendChild(card);
      });
      requestsEl.querySelectorAll("button[data-request-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const requestId = button.dataset.requestId;
          const action = button.dataset.requestAction;
          if (!requestId || !action) return;
          if (action === "accept") await updateRequestStatus(requestId, "accepted");
          if (action === "decline") await updateRequestStatus(requestId, "declined");
          if (action === "close") await updateRequestStatus(requestId, "closed");
        });
      });
    }
  }
};

const init = () => {
  const params = new URLSearchParams(window.location.search);
  jobId = params.get("id");
  if (!jobId) return;
  render();
};

init();

closeButton?.addEventListener("click", async () => {
  await updateJobStatus("closed");
});

reopenButton?.addEventListener("click", async () => {
  await updateJobStatus("open");
});
