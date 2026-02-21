(function initNlinkImageCropper() {
  const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });

  const createPreviewUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });

  const canvasToBlob = (canvas, type = "image/jpeg", quality = 0.9) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create cropped image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });

  window.nlinkOpenImageCropper = async ({
    file,
    aspectRatio = 1,
    circle = false,
    title = "Adjust image",
    outputWidth = 1200,
  }) => {
    if (!file) return null;
    const source = await createPreviewUrl(file);

    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.setAttribute("aria-hidden", "false");
      modal.innerHTML = `
        <div class="modal-card cropper-card">
          <div class="modal-header">
            <h3>${title}</h3>
            <button class="ghost-button" type="button" data-action="cancel">Cancel</button>
          </div>
          <p class="muted">Drag to position and use zoom to fit the frame.</p>
          <div class="cropper-body">
            <div class="cropper-frame ${circle ? "cropper-avatar" : ""}" id="nlink-cropper-frame" style="${circle ? "border-radius:50%;" : ""}">
              <img id="nlink-cropper-image" alt="Crop preview" src="${source}" />
              <div class="cropper-guides" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
            <label class="cropper-zoom">
              Zoom
              <input type="range" id="nlink-cropper-zoom" min="0.2" max="4" step="0.01" value="1" />
            </label>
          </div>
          <div class="cta-row">
            <button class="primary-button" type="button" data-action="save">Save Crop</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const frame = modal.querySelector("#nlink-cropper-frame");
      const image = modal.querySelector("#nlink-cropper-image");
      const zoomInput = modal.querySelector("#nlink-cropper-zoom");
      if (!(frame && image && zoomInput)) {
        modal.remove();
        resolve(null);
        return;
      }

      const state = { x: 0, y: 0, scale: 1 };

      const applyTransform = () => {
        image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      };

      const close = (value = null) => {
        modal.remove();
        resolve(value);
      };

      const stopDrag = (pointerId) => {
        try {
          frame.releasePointerCapture(pointerId);
        } catch (_error) {
          // Ignore release failures from cancelled pointers.
        }
      };

      let dragging = false;
      let sx = 0;
      let sy = 0;
      let ox = 0;
      let oy = 0;

      frame.addEventListener("pointerdown", (event) => {
        dragging = true;
        sx = event.clientX;
        sy = event.clientY;
        ox = state.x;
        oy = state.y;
        frame.setPointerCapture(event.pointerId);
      });

      frame.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        state.x = ox + (event.clientX - sx);
        state.y = oy + (event.clientY - sy);
        applyTransform();
      });

      frame.addEventListener("pointerup", (event) => {
        dragging = false;
        stopDrag(event.pointerId);
      });

      frame.addEventListener("pointercancel", (event) => {
        dragging = false;
        stopDrag(event.pointerId);
      });

      zoomInput.addEventListener("input", () => {
        state.scale = Number(zoomInput.value) || 1;
        applyTransform();
      });

      modal.querySelector('[data-action="cancel"]')?.addEventListener("click", () => close(null));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) close(null);
      });

      modal.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
        try {
          const raw = await loadImage(source);
          const frameWidth = frame.clientWidth;
          const frameHeight = frame.clientHeight;
          if (!frameWidth || !frameHeight) {
            close(null);
            return;
          }

          const imageRatio = raw.width / raw.height;
          const frameRatio = frameWidth / frameHeight;
          let baseWidth = frameWidth;
          let baseHeight = frameHeight;
          if (imageRatio > frameRatio) {
            baseHeight = frameHeight;
            baseWidth = frameHeight * imageRatio;
          } else {
            baseWidth = frameWidth;
            baseHeight = frameWidth / imageRatio;
          }

          const drawWidth = baseWidth * state.scale;
          const drawHeight = baseHeight * state.scale;
          const offsetX = (frameWidth - drawWidth) / 2 + state.x;
          const offsetY = (frameHeight - drawHeight) / 2 + state.y;

          const srcScaleX = raw.width / drawWidth;
          const srcScaleY = raw.height / drawHeight;

          const sxCrop = Math.max(0, -offsetX * srcScaleX);
          const syCrop = Math.max(0, -offsetY * srcScaleY);
          const swCrop = Math.min(raw.width - sxCrop, frameWidth * srcScaleX);
          const shCrop = Math.min(raw.height - syCrop, frameHeight * srcScaleY);

          const width = outputWidth;
          const height = Math.max(1, Math.round(width / aspectRatio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            close(null);
            return;
          }
          ctx.drawImage(raw, sxCrop, syCrop, swCrop, shCrop, 0, 0, width, height);

          const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
          close({ blob, previewDataUrl: canvas.toDataURL("image/jpeg", 0.9) });
        } catch (_error) {
          close(null);
        }
      });

      applyTransform();
    });
  };
})();
