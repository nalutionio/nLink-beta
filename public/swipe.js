/*
  Swipe mechanics for the discovery feed.
*/

const attachSwipeHandlers = (card, onSwipe) => {
  const interactiveSelector = "button, a, input, select, textarea, label";
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let dragging = false;
  let pointerId = null;

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest(interactiveSelector)) return;
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    currentY = startY;
    card.setPointerCapture(pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    currentX = event.clientX;
    currentY = event.clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2 && Math.abs(deltaY) > 18) {
      dragging = false;
      card.style.transform = "";
      if (pointerId !== null && card.hasPointerCapture(pointerId)) {
        card.releasePointerCapture(pointerId);
      }
      pointerId = null;
      return;
    }
    const rotate = deltaX / 18;
    card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotate}deg)`;
  });

  const endDrag = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;

    const deltaX = currentX - startX;
    const threshold = card.offsetWidth * 0.28;

    if (Math.abs(deltaX) > threshold) {
      const direction = deltaX > 0 ? "right" : "left";
      onSwipe(direction, card);
    } else {
      card.style.transform = "";
    }

    if (pointerId !== null && card.hasPointerCapture(pointerId)) {
      card.releasePointerCapture(pointerId);
    }
    pointerId = null;
  };

  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
  card.addEventListener("pointerleave", endDrag);
};
