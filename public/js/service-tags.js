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

  const usStateByName = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
    connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
    illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
    maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
    "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
  };
  const usStateAbbrSet = new Set(Object.values(usStateByName));
  const locationValidationCache = new Map();

  const normalizeLocation = (value) => String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*,\s*$/, "")
    .trim();

  const toStateAbbr = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const upper = raw.toUpperCase();
    if (usStateAbbrSet.has(upper)) return upper;
    return usStateByName[raw.toLowerCase()] || "";
  };

  const fetchJsonWithTimeout = async (url, timeoutMs = 4500) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const parseCityState = (value) => {
    const normalized = normalizeLocation(value);
    const withComma = normalized.match(/^(.+?),\s*([A-Za-z]{2}|[A-Za-z .'-]+)$/);
    if (withComma) {
      return { city: withComma[1].trim(), state: withComma[2].trim() };
    }
    return null;
  };

  const validateLocation = async (value) => {
    const normalized = normalizeLocation(value);
    if (!normalized) {
      return { ok: false, message: "Location is required." };
    }
    if (locationValidationCache.has(normalized)) {
      return locationValidationCache.get(normalized);
    }

    const zipMatch = normalized.match(/^\d{5}$/);
    if (zipMatch) {
      try {
        const zip = zipMatch[0];
        const data = await fetchJsonWithTimeout(`https://api.zippopotam.us/us/${zip}`);
        const place = Array.isArray(data?.places) ? data.places[0] : null;
        if (place?.["place name"] && place?.["state abbreviation"]) {
          const result = {
            ok: true,
            normalized: `${place["place name"]}, ${place["state abbreviation"]}`,
            city: place["place name"],
            state: place["state abbreviation"],
            zip,
          };
          locationValidationCache.set(normalized, result);
          return result;
        }
      } catch (_error) {
        const result = { ok: false, message: "ZIP not recognized. Enter a real US ZIP or City, ST." };
        locationValidationCache.set(normalized, result);
        return result;
      }
    }

    const parsed = parseCityState(normalized);
    if (!parsed) {
      const result = { ok: false, message: "Use City, ST or a 5-digit ZIP." };
      locationValidationCache.set(normalized, result);
      return result;
    }

    const stateAbbr = toStateAbbr(parsed.state);
    if (!stateAbbr) {
      const result = { ok: false, message: "Enter a valid US state (e.g., NJ)." };
      locationValidationCache.set(normalized, result);
      return result;
    }

    try {
      const query = encodeURIComponent(`${parsed.city}, ${stateAbbr}, USA`);
      const data = await fetchJsonWithTimeout(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=${query}`,
      );
      const first = Array.isArray(data) ? data[0] : null;
      const address = first?.address || {};
      const city = address.city || address.town || address.village || address.municipality || parsed.city;
      const iso = String(address["ISO3166-2-lvl4"] || "");
      const fromIso = iso.startsWith("US-") ? iso.slice(3) : "";
      const resolvedState = toStateAbbr(fromIso || address.state || stateAbbr);
      if (!first || !resolvedState || resolvedState !== stateAbbr) {
        const result = { ok: false, message: "Location not recognized. Choose a real City, ST." };
        locationValidationCache.set(normalized, result);
        return result;
      }
      const result = {
        ok: true,
        normalized: `${city}, ${resolvedState}`,
        city,
        state: resolvedState,
        zip: address.postcode || "",
      };
      locationValidationCache.set(normalized, result);
      return result;
    } catch (_error) {
      const result = { ok: false, message: "Could not verify location right now. Try a 5-digit ZIP." };
      locationValidationCache.set(normalized, result);
      return result;
    }
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
    normalizeLocation,
    validateLocation,
    renderTagPicker,
  };
})();
