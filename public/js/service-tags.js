(function initServiceTags() {
  const categoryServiceMap = {
    "Home Repair": [
      "Electrician",
      "Plumber",
      "HVAC",
      "Appliance Repair",
      "Handyman",
      "Carpentry",
    ],
    "Home Improvement": [
      "Painting",
      "Flooring",
      "Roofing",
      "Solar",
      "Gutters",
      "General Home Improvement",
    ],
    "Outdoor & Property": [
      "Lawn Care",
      "Pest Control",
      "Pool Service",
      "Landscaping",
    ],
    "Cleaning & Moving": [
      "Cleaning",
      "Junk Removal",
      "Moving",
    ],
    "Personal Services": [
      "Barber",
      "Hair Stylist",
      "Personal Trainer",
    ],
  };

  const serviceTagMap = {
    "Electrician": ["EV charger install", "Panel upgrade", "Smart home", "Lighting", "Emergency repair"],
    "Plumber": ["Leak repair", "Drain cleaning", "Water heater", "Fixture install", "Emergency repair"],
    "HVAC": ["AC tune-up", "Furnace repair", "Ductwork", "Thermostat install", "Emergency service"],
    "Appliance Repair": ["Washer", "Dryer", "Refrigerator", "Dishwasher", "Same-day repair"],
    "Handyman": ["Drywall patch", "Door repair", "TV mounting", "Furniture assembly", "Odd jobs"],
    "Carpentry": ["Trim work", "Cabinets", "Custom shelving", "Framing", "Finish carpentry"],
    "Painting": ["Interior painting", "Exterior painting", "Cabinets", "Wallpaper removal", "Touch-ups"],
    "Flooring": ["Hardwood", "Laminate", "Tile", "Vinyl plank", "Floor repair"],
    "Roofing": ["Roof repair", "Roof replacement", "Flashing", "Leak inspection", "Shingle work"],
    "Solar": ["Panel install", "Inverter service", "System inspection", "Battery setup", "Monitoring setup"],
    "Gutters": ["Gutter cleaning", "Gutter install", "Downspouts", "Guards", "Drainage fixes"],
    "General Home Improvement": ["Renovation", "Remodeling", "Punch list", "Property upgrades", "Project coordination"],
    "Lawn Care": ["Mowing", "Edging", "Seasonal cleanup", "Fertilizing", "Weed control"],
    "Pest Control": ["Termites", "Rodents", "Ants", "Preventive treatment", "Inspection"],
    "Pool Service": ["Pool cleaning", "Chemical balancing", "Equipment repair", "Opening/closing", "Leak checks"],
    "Landscaping": ["Design", "Mulching", "Planting", "Hardscaping", "Irrigation"],
    "Cleaning": ["Deep cleaning", "Airbnb turnover", "Office cleaning", "Move-out cleaning", "Recurring service"],
    "Junk Removal": ["Furniture haul", "Appliance pickup", "Garage cleanout", "Construction debris", "Same-day pickup"],
    "Moving": ["Local move", "Packing", "Loading", "Unloading", "Furniture assembly"],
    "Barber": ["Fade", "Beard trim", "Shape-up", "Kids cuts", "Mobile service"],
    "Hair Stylist": ["Color", "Braids", "Blowout", "Extensions", "Event styling"],
    "Personal Trainer": ["Strength training", "Weight loss", "Mobility", "Virtual coaching", "Nutrition guidance"],
  };

  const categories = Object.keys(categoryServiceMap);
  const allServices = categories.flatMap((category) => categoryServiceMap[category]);
  const allTags = Array.from(new Set(allServices.flatMap((service) => serviceTagMap[service] || [])));

  const normalizeTag = (value) => String(value || "").trim().toLowerCase();
  const canonicalServiceByKey = {};
  const canonicalCategoryByKey = {};
  const canonicalTagByKey = {};

  categories.forEach((category) => {
    canonicalCategoryByKey[normalizeTag(category)] = category;
  });
  allServices.forEach((service) => {
    canonicalServiceByKey[normalizeTag(service)] = service;
  });
  allTags.forEach((tag) => {
    canonicalTagByKey[normalizeTag(tag)] = tag;
  });

  const serviceAliases = {
    "electrical": "Electrician",
    "electric": "Electrician",
    "electrician": "Electrician",
    "plumbing": "Plumber",
    "plumber": "Plumber",
    "home improvement": "General Home Improvement",
    "general home improvement": "General Home Improvement",
    "fitness": "Personal Trainer",
    "personal training": "Personal Trainer",
    "trainer": "Personal Trainer",
    "hair": "Hair Stylist",
    "landscape": "Landscaping",
    "landscaping": "Landscaping",
  };

  const categoryAliases = {
    "home services": "Home Repair",
    "outdoor": "Outdoor & Property",
    "cleaning and moving": "Cleaning & Moving",
    "personal": "Personal Services",
  };

  const toCanonicalCategory = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const key = normalizeTag(raw);
    const aliasTarget = categoryAliases[key];
    if (aliasTarget && canonicalCategoryByKey[normalizeTag(aliasTarget)]) return aliasTarget;
    return canonicalCategoryByKey[key] || raw;
  };

  const toCanonicalService = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const key = normalizeTag(raw);
    const aliasTarget = serviceAliases[key];
    if (aliasTarget && canonicalServiceByKey[normalizeTag(aliasTarget)]) return aliasTarget;
    return canonicalServiceByKey[key] || raw;
  };

  const toCanonicalDiscoveryTerm = (value) => {
    const category = toCanonicalCategory(value);
    if (category && categories.includes(category)) return category;
    return toCanonicalService(value);
  };

  const toCanonicalTag = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const key = normalizeTag(raw);
    return canonicalTagByKey[key] || raw;
  };

  const getServicesForCategory = (category) => {
    const canonical = toCanonicalCategory(category);
    return categoryServiceMap[canonical] ? [...categoryServiceMap[canonical]] : [];
  };

  const getTagsForService = (service) => {
    const canonical = toCanonicalService(service);
    return serviceTagMap[canonical] ? [...serviceTagMap[canonical]] : [];
  };

  const inferCategoryForService = (service) => {
    const canonicalService = toCanonicalService(service);
    return categories.find((category) => categoryServiceMap[category].includes(canonicalService)) || "";
  };

  const parseInputValues = (value, canonicalizeFn) => String(value || "")
    .split(",")
    .map((item) => canonicalizeFn(item))
    .filter(Boolean);

  const renderTagPicker = ({
    container,
    input,
    options = allServices,
    multiple = false,
    max = 8,
    allowAll = false,
    allLabel = "All",
    canonicalize = toCanonicalService,
  }) => {
    if (!container || !input) return null;
    container.innerHTML = "";
    container.classList.add("tag-picker");
    if (multiple) container.classList.add("multi");
    else container.classList.add("single");

    const selected = new Set();

    const applyInputValue = () => {
      if (!multiple && selected.size > 1) {
        const [first] = Array.from(selected);
        selected.clear();
        if (first) selected.add(first);
      }
      input.value = multiple ? Array.from(selected).join(", ") : (Array.from(selected)[0] || "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const syncFromInput = () => {
      selected.clear();
      const values = parseInputValues(input.value, canonicalize);
      values.forEach((term) => {
        if (options.includes(term)) selected.add(term);
      });
      if (!multiple && selected.size > 1) {
        const [first] = Array.from(selected);
        selected.clear();
        if (first) selected.add(first);
      }
      refreshButtons();
    };

    const onOptionClick = (optionValue) => {
      if (allowAll && optionValue === "__all__") {
        selected.clear();
        input.value = "all";
        refreshButtons();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (!multiple) {
        const isSelected = selected.has(optionValue);
        selected.clear();
        if (!isSelected) selected.add(optionValue);
      } else if (selected.has(optionValue)) {
        selected.delete(optionValue);
      } else if (selected.size < max) {
        selected.add(optionValue);
      }

      applyInputValue();
      refreshButtons();
    };

    const buttonFor = (label, value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-chip";
      button.dataset.value = value;
      button.textContent = label;
      button.addEventListener("click", () => onOptionClick(value));
      return button;
    };

    const buttons = [];
    if (allowAll) {
      const allButton = buttonFor(allLabel, "__all__");
      buttons.push(allButton);
      container.appendChild(allButton);
    }
    options.forEach((option) => {
      const button = buttonFor(option, option);
      buttons.push(button);
      container.appendChild(button);
    });

    function refreshButtons() {
      const allMode = allowAll && String(input.value || "").trim().toLowerCase() === "all";
      buttons.forEach((button) => {
        const value = button.dataset.value;
        const active = value === "__all__" ? allMode : selected.has(value);
        button.classList.toggle("active", active);
      });
    }

    if (String(input.value || "").trim().toLowerCase() === "all") refreshButtons();
    else syncFromInput();

    return {
      syncFromInput,
      setValues(values) {
        input.value = Array.isArray(values) ? values.join(", ") : String(values || "");
        syncFromInput();
      },
      getValues() {
        return multiple ? Array.from(selected) : (Array.from(selected)[0] || "");
      },
    };
  };

  window.NLINK_SERVICE_TAGS = {
    categories,
    categoryServiceMap,
    serviceTagMap,
    allServices,
    allTags,
    allServiceTags: allServices,
    normalizeTag,
    toCanonicalCategory,
    toCanonicalService,
    toCanonicalTag,
    toCanonicalDiscoveryTerm,
    getServicesForCategory,
    getTagsForService,
    inferCategoryForService,
    renderTagPicker,
  };
})();
