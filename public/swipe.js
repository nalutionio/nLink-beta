/*
  Swipe mechanics for the discovery feed.
*/

const attachSwipeHandlers = (card, onSwipe) => {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let dragging = false;

  card.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    currentY = startY;
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    currentX = event.clientX;
    currentY = event.clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const rotate = deltaX / 18;
    card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotate}deg)`;
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;

    const deltaX = currentX - startX;
    const threshold = card.offsetWidth * 0.28;

    if (Math.abs(deltaX) > threshold) {
      const direction = deltaX > 0 ? "right" : "left";
      onSwipe(direction, card);
    } else {
      card.style.transform = "";
    }

    card.releasePointerCapture(event.pointerId);
  };

  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
};
