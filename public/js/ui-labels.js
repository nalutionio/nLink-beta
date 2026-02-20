/*
  Centralized UI labels so copy stays consistent and easy to adjust.
  Data fields come from Supabase; these are only empty-state/fallback labels.
*/
(function setNlinkUiLabels() {
  if (window.NLINK_UI_LABELS) return;
  window.NLINK_UI_LABELS = {
    common: {
      unavailable: "Not provided",
      notSet: "Not set",
    },
    rating: {
      unrated: "Unrated",
      noReviews: "No reviews yet",
    },
    profile: {
      noDescription: "No business description added yet.",
      noServices: "No services listed yet.",
      noGallery: "No gallery photos yet.",
      noProfile: "No profile data yet.",
      noProfileFound: "No provider profile found.",
      createFirst: "No provider profile yet. Use Edit to create your first profile card.",
    },
    pricing: {
      title: "Pricing",
      quote: "Custom quote",
      details: "Request a quote for final pricing.",
    },
    actions: {
      book: "Book",
      contact: "Contact",
      directions: "Directions",
      leaveReview: "Leave Review",
      viewProfile: "View Profile",
      save: "Save",
      remove: "Remove",
      viewPhotos: "View More Photos",
      close: "Close",
    },
    beta: {
      action: "This action is coming soon in beta.",
      photos: "Photo gallery is coming soon in beta.",
    },
  };
})();
