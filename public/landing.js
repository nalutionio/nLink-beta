const carousel = document.getElementById("hero-carousel");
if (!carousel) {
  // Landing variants without carousel should fail gracefully.
} else {
const cards = Array.from(carousel.querySelectorAll(".profile-card"));
let activeIndex = 0;
let autoTimer = null;

const stackCards = () => {
  cards.forEach((card, index) => {
    const offset = (index - activeIndex + cards.length) % cards.length;
    card.style.zIndex = String(cards.length - offset);
    card.style.opacity = offset > 2 ? "0" : "1";
    card.style.transform = `translateY(${offset * 12}px) scale(${1 - offset * 0.04})`;
    card.style.pointerEvents = offset === 0 ? "auto" : "none";
  });
};

const animateOut = (direction = 1) => {
  const topCard = cards[activeIndex];
  topCard.style.transition = "transform 0.3s ease, opacity 0.3s ease";
  topCard.style.transform = `translate(${direction * 220}px, -20px) rotate(${direction * 12}deg)`;
  topCard.style.opacity = "0";

  setTimeout(() => {
    topCard.style.transition = "";
    topCard.style.opacity = "1";
    activeIndex = (activeIndex + 1) % cards.length;
    stackCards();
  }, 280);
};

const attachSwipe = (card) => {
  let startX = 0;
  let startY = 0;
  let dragging = false;

  card.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const rotate = deltaX / 20;
    card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotate}deg)`;
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    const deltaX = event.clientX - startX;
    const threshold = card.offsetWidth * 0.25;

    if (Math.abs(deltaX) > threshold) {
      animateOut(deltaX > 0 ? 1 : -1);
    } else {
      card.style.transform = "";
      stackCards();
    }

    card.releasePointerCapture(event.pointerId);
  };

  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
};

cards.forEach(attachSwipe);
stackCards();

autoTimer = setInterval(() => animateOut(1), 3500);

carousel.addEventListener("pointerdown", () => {
  clearInterval(autoTimer);
});

carousel.addEventListener("pointerup", () => {
  autoTimer = setInterval(() => animateOut(1), 3500);
});
}
