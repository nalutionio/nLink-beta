(function initServiceTags() {
  const homeServiceTags = [
    "Painting",
    "Roofing",
    "HVAC",
    "Plumbing",
    "Electrical",
    "Solar",
    "Cleaning",
    "Lawn Care",
    "Gutters",
    "Flooring",
    "Carpentry",
    "Handyman",
    "Appliance Repair",
    "Pest Control",
    "Pool Service",
    "Moving",
    "Junk Removal",
    "Home Improvement",
  ];

  const otherServiceTags = [
    "Barber",
    "Hair Stylist",
    "Personal Trainer",
  ];

  const allServiceTags = Array.from(new Set([...homeServiceTags, ...otherServiceTags]));

  const normalizeTag = (value) => String(value || "").trim().toLowerCase();
  const canonicalByKey = {};
  allServiceTags.forEach((tag) => {
    canonicalByKey[normalizeTag(tag)] = tag;
  });

  const parseInputValues = (value) => String(value || "")
    .split(",")
    .map((item) => canonicalByKey[normalizeTag(item)] || "")
    .filter(Boolean);

  const renderTagPicker = ({
    container,
    input,
    options = allServiceTags,
    multiple = false,
    max = 8,
    allowAll = false,
    allLabel = "All",
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
      const values = parseInputValues(input.value);
      values.forEach((tag) => {
        if (options.includes(tag)) selected.add(tag);
      });
      if (!multiple && selected.size > 1) {
        const [first] = Array.from(selected);
        selected.clear();
        if (first) selected.add(first);
      }
      refreshButtons();
    };

    const onTagClick = (tagValue) => {
      if (allowAll && tagValue === "__all__") {
        selected.clear();
        input.value = "all";
        refreshButtons();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (!multiple) {
        const isSelected = selected.has(tagValue);
        selected.clear();
        if (!isSelected) selected.add(tagValue);
      } else if (selected.has(tagValue)) {
        selected.delete(tagValue);
      } else if (selected.size < max) {
        selected.add(tagValue);
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
      button.addEventListener("click", () => onTagClick(value));
      return button;
    };

    const buttons = [];
    if (allowAll) {
      const allButton = buttonFor(allLabel, "__all__");
      buttons.push(allButton);
      container.appendChild(allButton);
    }
    options.forEach((tag) => {
      const button = buttonFor(tag, tag);
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

    if (String(input.value || "").trim().toLowerCase() === "all") {
      refreshButtons();
    } else {
      syncFromInput();
    }

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
    homeServiceTags,
    otherServiceTags,
    allServiceTags,
    normalizeTag,
    renderTagPicker,
  };
})();
