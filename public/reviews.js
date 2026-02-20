/*
  Reviews renderer for the full profile view.
*/

const renderStars = (rating) => {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    "★".repeat(fullStars) +
    (hasHalf ? "☆" : "") +
    "✩".repeat(emptyStars)
  );
};

const renderReviewList = (provider) => {
  const labels = window.NLINK_UI_LABELS || {};
  const ratingLabels = labels.rating || {};
  const reviews = Array.isArray(provider?.reviews) ? provider.reviews : [];
  const ratingValue = Number(provider?.rating) || 0;
  const reviewCount = Number(provider?.reviewCount) || reviews.length || 0;
  const reviewItems = reviews
    .map(
      (review) => `
        <div class="review-card">
          <strong>${review.name || "Anonymous"}</strong>
          <div>${renderStars(Number(review.rating) || 0)} ${Number(review.rating) || 0}</div>
          <p>${review.text || ""}</p>
        </div>
      `
    )
    .join("");

  return `
    <section>
      <h4>Reviews (${reviewCount})</h4>
      <div class="rating">${
        ratingValue > 0
          ? `${renderStars(ratingValue)} ${ratingValue.toFixed(1)}`
          : (ratingLabels.unrated || "Unrated")
      }</div>
      ${reviewItems || `<p class="muted">${ratingLabels.noReviews || "No reviews yet"}</p>`}
    </section>
  `;
};
