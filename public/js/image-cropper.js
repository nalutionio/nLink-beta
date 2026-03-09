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

  const lockPageScroll = () => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  };

  const sanitizeFileType = (value) => {
    const type = String(value || "").toLowerCase();
    if (type === "image/jpg") return "image/jpeg";
    if (type.startsWith("image/")) return type;
    return "image/jpeg";
  };

  const extensionForType = (type) => {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    return "jpg";
  };

  const decodeToCanvas = async (file) => {
    if (!file) throw new Error("No image file provided.");
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not process image.");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return canvas;
    }
    const source = await createPreviewUrl(file);
    const image = await loadImage(source);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.drawImage(image, 0, 0);
    return canvas;
  };

  window.nlinkPrepareImageForUpload = async (file, options = {}) => {
    if (!file) throw new Error("No image selected.");
    const originalType = sanitizeFileType(file.type);
    const forceJpeg = options.forceJpeg !== false;
    if (!forceJpeg && ["image/jpeg", "image/png", "image/webp"].includes(originalType)) {
      const source = await createPreviewUrl(file);
      return {
        blob: file,
        type: originalType,
        ext: extensionForType(originalType),
        previewDataUrl: source,
      };
    }

    const canvas = await decodeToCanvas(file);
    const maxDimension = Number(options.maxDimension || 2200);
    if (maxDimension > 0 && (canvas.width > maxDimension || canvas.height > maxDimension)) {
      const ratio = Math.min(maxDimension / canvas.width, maxDimension / canvas.height);
      const resized = document.createElement("canvas");
      resized.width = Math.max(1, Math.round(canvas.width * ratio));
      resized.height = Math.max(1, Math.round(canvas.height * ratio));
      const rctx = resized.getContext("2d");
      if (!rctx) throw new Error("Could not process image.");
      rctx.drawImage(canvas, 0, 0, resized.width, resized.height);
      const blob = await canvasToBlob(resized, "image/jpeg", 0.9);
      return {
        blob,
        type: "image/jpeg",
        ext: "jpg",
        previewDataUrl: resized.toDataURL("image/jpeg", 0.9),
      };
    }

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    return {
      blob,
      type: "image/jpeg",
      ext: "jpg",
      previewDataUrl: canvas.toDataURL("image/jpeg", 0.9),
    };
  };

  window.nlinkOpenImageCropper = async ({
    file,
    aspectRatio = 1,
    circle = false,
    title = "Adjust image",
    outputWidth = 1200,
  }) => {
    if (!file) return null;
    const prepared = await window.nlinkPrepareImageForUpload(file, { forceJpeg: true });
    const source = prepared.previewDataUrl || await createPreviewUrl(prepared.blob);

    return new Promise((resolve) => {
      const unlockScroll = lockPageScroll();
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

      const state = { x: 0, y: 0, scale: 1, minScale: 0.4, maxScale: 4 };

      const getFrameMetrics = () => {
        const frameRect = frame.getBoundingClientRect();
        const frameW = frameRect.width || 1;
        const frameH = frameRect.height || 1;
        const naturalW = image.naturalWidth || 1;
        const naturalH = image.naturalHeight || 1;
        const imageRatio = naturalW / naturalH;
        const frameRatio = frameW / frameH;
        let baseW = frameW;
        let baseH = frameH;
        if (imageRatio > frameRatio) {
          baseW = frameH * imageRatio;
          baseH = frameH;
        } else {
          baseW = frameW;
          baseH = frameW / imageRatio;
        }
        return { frameW, frameH, naturalW, naturalH, baseW, baseH };
      };

      const clampPan = () => {
        const { frameW, frameH, baseW, baseH } = getFrameMetrics();
        const drawW = baseW * state.scale;
        const drawH = baseH * state.scale;
        const maxX = Math.max(0, (drawW - frameW) / 2);
        const maxY = Math.max(0, (drawH - frameH) / 2);
        state.x = Math.max(-maxX, Math.min(maxX, state.x));
        state.y = Math.max(-maxY, Math.min(maxY, state.y));
      };

      const applyTransform = () => {
        clampPan();
        image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      };

      const close = (value = null) => {
        unlockScroll();
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
        event.preventDefault();
        dragging = true;
        sx = event.clientX;
        sy = event.clientY;
        ox = state.x;
        oy = state.y;
        frame.setPointerCapture(event.pointerId);
      });

      frame.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        event.preventDefault();
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

      const initializeScaleBounds = () => {
        const { frameW, frameH, baseW, baseH } = getFrameMetrics();
        const containScale = Math.min(frameW / baseW, frameH / baseH);
        state.minScale = Math.max(0.25, containScale);
        state.maxScale = 4;
        zoomInput.min = String(state.minScale);
        zoomInput.max = String(state.maxScale);
        state.scale = Math.max(state.minScale, 1);
        zoomInput.value = String(state.scale);
        state.x = 0;
        state.y = 0;
        applyTransform();
      };
      if (image.complete) {
        initializeScaleBounds();
      } else {
        image.addEventListener("load", initializeScaleBounds, { once: true });
      }
      window.addEventListener("resize", initializeScaleBounds);

      frame.style.touchAction = "none";
      image.style.touchAction = "none";
      frame.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });

      const previousClose = close;
      const closeWrapped = (value = null) => {
        window.removeEventListener("resize", initializeScaleBounds);
        previousClose(value);
      };
      modal.querySelector('[data-action="cancel"]')?.addEventListener("click", () => closeWrapped(null));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeWrapped(null);
      });
      modal.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
        try {
          const raw = await loadImage(source);
          const { naturalW, naturalH, frameW, frameH, baseW, baseH } = getFrameMetrics();
          if (!frameW || !frameH) {
            closeWrapped(null);
            return;
          }
          const drawWidth = baseW * state.scale;
          const drawHeight = baseH * state.scale;
          const offsetX = (frameW - drawWidth) / 2 + state.x;
          const offsetY = (frameH - drawHeight) / 2 + state.y;
          const sxCrop = Math.max(0, -offsetX * (naturalW / drawWidth));
          const syCrop = Math.max(0, -offsetY * (naturalH / drawHeight));
          const swCrop = Math.min(naturalW - sxCrop, frameW * (naturalW / drawWidth));
          const shCrop = Math.min(naturalH - syCrop, frameH * (naturalH / drawHeight));
          const width = outputWidth;
          const height = Math.max(1, Math.round(width / aspectRatio));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            closeWrapped(null);
            return;
          }
          ctx.drawImage(raw, sxCrop, syCrop, swCrop, shCrop, 0, 0, width, height);
          const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
          closeWrapped({ blob, previewDataUrl: canvas.toDataURL("image/jpeg", 0.9) });
        } catch (_error) {
          closeWrapped(null);
        }
      });

      applyTransform();
    });
  };
})();
