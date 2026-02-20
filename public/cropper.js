/*
  Simple client-side cropper for banner + logo images (beta).
  Stores cropped results in localStorage.
*/

const cropStorageKey = "nlink_crops";

const getCropStore = () => {
  try {
    return JSON.parse(localStorage.getItem(cropStorageKey)) || {};
  } catch (error) {
    return {};
  }
};

const setCropStore = (store) => {
  localStorage.setItem(cropStorageKey, JSON.stringify(store));
};

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.src = src;
});

const createCropperModal = (provider, initialTab = "banner") => {
  const modal = document.getElementById("cropper-modal");
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-card cropper-card">
      <div class="modal-header">
        <h3>Adjust Images</h3>
        <button class="ghost-button" data-action="close">Close</button>
      </div>
      <p class="muted">Upload a photo and drag to position. Use the slider to zoom.</p>
      <div class="cropper-tabs">
        <button class="tab" data-tab="banner">Banner</button>
        <button class="tab" data-tab="avatar">Logo</button>
      </div>
      <div class="cropper-body">
        <input type="file" accept="image/*" id="cropper-file" />
        <div class="cropper-frame" data-frame="banner">
          <img alt="Banner preview" />
        </div>
        <div class="cropper-frame cropper-avatar hidden" data-frame="avatar">
          <img alt="Logo preview" />
        </div>
        <label class="cropper-zoom">
          Zoom
          <input type="range" id="cropper-zoom" min="1" max="2.5" step="0.01" value="1" />
        </label>
      </div>
      <div class="cta-row">
        <button class="primary-button" data-action="save">Save Crops</button>
      </div>
    </div>
  `;

  modal.setAttribute("aria-hidden", "false");

  const fileInput = modal.querySelector("#cropper-file");
  const zoomInput = modal.querySelector("#cropper-zoom");
  const tabs = modal.querySelectorAll(".cropper-tabs .tab");
  const bannerFrame = modal.querySelector("[data-frame='banner']");
  const avatarFrame = modal.querySelector("[data-frame='avatar']");
  const bannerImg = bannerFrame.querySelector("img");
  const avatarImg = avatarFrame.querySelector("img");

  const stored = getCropStore()[provider.id] || {};
  const state = {
    active: initialTab,
    banner: {
      scale: 1,
      x: 0,
      y: 0,
      src: stored.banner || provider.bannerImage || provider.heroImage || "",
      dirty: false,
    },
    avatar: {
      scale: 1,
      x: 0,
      y: 0,
      src: stored.avatar || provider.avatar || provider.heroImage || "",
      dirty: false,
    },
  };

  const updateImages = () => {
    bannerImg.src = state.banner.src || "";
    avatarImg.src = state.avatar.src || "";
  };

  const applyTransform = () => {
    const key = state.active;
    const img = key === "banner" ? bannerImg : avatarImg;
    const { x, y, scale } = state[key];
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  const setActive = (tab) => {
    state.active = tab;
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    bannerFrame.classList.toggle("hidden", tab !== "banner");
    avatarFrame.classList.toggle("hidden", tab !== "avatar");
    zoomInput.value = state[tab].scale.toFixed(2);
    applyTransform();
  };

  const bindDrag = (frame, img, key) => {
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let dragging = false;

    frame.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = state[key].x;
      originY = state[key].y;
      frame.setPointerCapture(event.pointerId);
    });

    frame.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      state[key].x = originX + deltaX;
      state[key].y = originY + deltaY;
      state[key].dirty = true;
      img.style.transform = `translate(${state[key].x}px, ${state[key].y}px) scale(${state[key].scale})`;
    });

    const endDrag = (event) => {
      dragging = false;
      frame.releasePointerCapture(event.pointerId);
    };

    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
  };

  const renderCrop = async (frame, key, outW, outH) => {
    const src = state[key].src;
    if (!src) return null;
    const img = await loadImage(src);

    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const imgRatio = img.width / img.height;
    const frameRatio = frameW / frameH;

    let baseW = frameW;
    let baseH = frameH;
    if (imgRatio > frameRatio) {
      baseH = frameH;
      baseW = frameH * imgRatio;
    } else {
      baseW = frameW;
      baseH = frameW / imgRatio;
    }

    const { x, y, scale } = state[key];
    const drawW = baseW * scale;
    const drawH = baseH * scale;
    const offsetX = (frameW - drawW) / 2 + x;
    const offsetY = (frameH - drawH) / 2 + y;

    const scaleX = img.width / drawW;
    const scaleY = img.height / drawH;

    const sx = Math.max(0, -offsetX * scaleX);
    const sy = Math.max(0, -offsetY * scaleY);
    const sWidth = Math.min(img.width, frameW * scaleX);
    const sHeight = Math.min(img.height, frameH * scaleY);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
    return canvas;
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state[state.active].src = url;
    state[state.active].dirty = true;
    updateImages();
  });

  zoomInput.addEventListener("input", () => {
    const scale = Number(zoomInput.value);
    state[state.active].scale = scale;
    state[state.active].dirty = true;
    applyTransform();
  });

  tabs.forEach((button) => {
    button.addEventListener("click", () => setActive(button.dataset.tab));
  });

  bindDrag(bannerFrame, bannerImg, "banner");
  bindDrag(avatarFrame, avatarImg, "avatar");

  modal.querySelector("[data-action='close']").addEventListener("click", () => {
    modal.setAttribute("aria-hidden", "true");
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.setAttribute("aria-hidden", "true");
  });

  modal.querySelector("[data-action='save']").addEventListener("click", async () => {
    const store = getCropStore();
    const existing = store[provider.id] || {};

    let bannerData = existing.banner || provider.bannerImage;
    let avatarData = existing.avatar || provider.avatar;

    if (state.banner.dirty) {
      const bannerCanvas = await renderCrop(bannerFrame, "banner", 1200, 540);
      if (bannerCanvas) bannerData = bannerCanvas.toDataURL("image/jpeg", 0.85);
    }

    if (state.avatar.dirty) {
      const avatarCanvas = await renderCrop(avatarFrame, "avatar", 600, 600);
      if (avatarCanvas) avatarData = avatarCanvas.toDataURL("image/jpeg", 0.9);
    }

    store[provider.id] = { banner: bannerData, avatar: avatarData };
    setCropStore(store);
    modal.setAttribute("aria-hidden", "true");
    window.dispatchEvent(new CustomEvent("nlink:images-updated", { detail: { providerId: provider.id } }));
  });

  updateImages();
  setActive(initialTab);
};

const getCroppedImages = (providerId) => {
  const store = getCropStore();
  return store[providerId] || null;
};
