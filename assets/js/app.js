(function () {
  const STROKE_GUIDELINE_HOURS = 4;
  const DEFAULT_AVERAGE_SPEED = 40;
  const MAP_CENTER = [28.394857, 84.124008];

  const state = {
    location: null,
    locationLabel: "",
    averageSpeed: DEFAULT_AVERAGE_SPEED,
    filters: {
      thrombolysisOnly: false,
      guidelineOnly: false
    },
    selectedHospitalId: null
  };

  const elements = {
    locationStatus: document.getElementById("location-status"),
    useLocationButton: document.getElementById("use-location"),
    clearLocationButton: document.getElementById("clear-location"),
    presetLocation: document.getElementById("preset-location"),
    speedControl: document.getElementById("speed-control"),
    speedValue: document.getElementById("speed-value"),
    filterThrombolysis: document.getElementById("filter-thrombolysis"),
    filterGuideline: document.getElementById("filter-guideline"),
    recommendedContainer: document.getElementById("recommended-container"),
    hospitalList: document.getElementById("hospital-list"),
    hospitalCount: document.getElementById("hospital-count"),
    callHelplineLink: document.getElementById("call-helpline"),
    activateStrokeTeam: document.getElementById("activate-stroke-team"),
    strokeTeamInstructions: document.getElementById("stroke-team-instructions")
  };

  const map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: true,
    minZoom: 5,
    maxZoom: 16
  }).setView(MAP_CENTER, 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: "topright" }).addTo(map);

  const hospitalLayer = L.layerGroup().addTo(map);
  const markerLookup = new Map();

  let userMarker = null;
  let reachabilityCircle = null;

  initialise();

  function initialise() {
    renderHospitalMarkers();
    bindEvents();
    updateSpeedDisplay();
    refreshUI();
  }

  function renderHospitalMarkers() {
    NEURO_HOSPITALS.forEach((hospital) => {
      const marker = L.circleMarker(
        [hospital.coordinates.lat, hospital.coordinates.lng],
        {
          radius: 7,
          color: hospital.hasThrombolysis ? "#1e88e5" : "#ffa000",
          weight: 2,
          fillColor: hospital.hasThrombolysis ? "#42a5f5" : "#ffca28",
          fillOpacity: 0.85
        }
      );

      marker.bindPopup(generatePopupContent(hospital));
      marker.on("click", () => focusHospital(hospital.id));
      marker.addTo(hospitalLayer);
      markerLookup.set(hospital.id, marker);
    });
  }

  function bindEvents() {
    map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      setUserLocation(lat, lng, "Pinned location");
    });

    elements.useLocationButton.addEventListener("click", useDeviceLocation);
    elements.clearLocationButton.addEventListener("click", clearUserLocation);

    elements.presetLocation.addEventListener("change", (event) => {
      const value = event.target.value;
      if (!value) {
        return;
      }
      const [lat, lng] = value.split(",").map((coordinate) => parseFloat(coordinate.trim()));
      const label = event.target.options[event.target.selectedIndex].text;
      setUserLocation(lat, lng, label);
    });

    elements.speedControl.addEventListener("input", (event) => {
      const newSpeed = Number(event.target.value);
      state.averageSpeed = newSpeed;
      updateSpeedDisplay();
      updateReachabilityCircle();
      refreshUI();
    });

    elements.filterThrombolysis.addEventListener("change", (event) => {
      state.filters.thrombolysisOnly = event.target.checked;
      refreshUI();
    });

    elements.filterGuideline.addEventListener("change", (event) => {
      state.filters.guidelineOnly = event.target.checked;
      if (state.filters.guidelineOnly && !state.location) {
        setStatusMessage(
          "Set a location to filter by the four-hour travel guideline.",
          true
        );
      } else if (!state.location) {
        resetStatusMessage();
      }
      refreshUI();
    });

    elements.activateStrokeTeam.addEventListener("click", () => {
      elements.strokeTeamInstructions.classList.toggle("open");
    });

    elements.hospitalList.addEventListener("click", (event) => {
      const actionElement =
        event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
      if (!actionElement) {
        return;
      }
      const action = actionElement.getAttribute("data-action");
      const hospitalId = actionElement.getAttribute("data-id");
      if (action === "focus" && hospitalId) {
        focusHospital(hospitalId);
      }
    });
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported on this device.", true);
      return;
    }

    setStatusMessage("Locating…", false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation(latitude, longitude, "My current location");
      },
      () => {
        setStatusMessage("Unable to retrieve your location. Try setting it manually.", true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 15_000
      }
    );
  }

  function clearUserLocation() {
    state.location = null;
    state.locationLabel = "";
    state.selectedHospitalId = null;

    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    if (reachabilityCircle) {
      map.removeLayer(reachabilityCircle);
      reachabilityCircle = null;
    }

    resetStatusMessage();
    map.setView(MAP_CENTER, 7);
    refreshUI();
  }

  function setUserLocation(lat, lng, label) {
    state.location = { lat, lng };
    state.locationLabel = label || "Pinned location";
    state.selectedHospitalId = null;

    updateUserMarker();
    updateReachabilityCircle();
    setStatusMessage(`Using ${state.locationLabel} for travel estimates.`);
    refreshUI();
  }

  function updateUserMarker() {
    if (!state.location) {
      return;
    }

    const icon = L.divIcon({
      className: "user-location-icon",
      html: '<span class="user-location-pulse"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    if (userMarker) {
      userMarker.setLatLng([state.location.lat, state.location.lng]);
    } else {
      userMarker = L.marker([state.location.lat, state.location.lng], {
        icon,
        keyboard: false
      }).addTo(map);
    }

    const targetZoom = map.getZoom() < 9 ? 9 : map.getZoom();
    map.flyTo([state.location.lat, state.location.lng], targetZoom, { duration: 0.8 });
  }

  function updateReachabilityCircle() {
    if (!state.location) {
      return;
    }

    const radiusKm = state.averageSpeed * STROKE_GUIDELINE_HOURS;
    const radiusMeters = radiusKm * 1000;

    const circleOptions = {
      radius: radiusMeters,
      color: "#2e7d32",
      weight: 1.4,
      fillColor: "#2e7d32",
      fillOpacity: 0.08,
      dashArray: "6 8"
    };

    if (reachabilityCircle) {
      reachabilityCircle.setLatLng([state.location.lat, state.location.lng]);
      reachabilityCircle.setRadius(radiusMeters);
    } else {
      reachabilityCircle = L.circle(
        [state.location.lat, state.location.lng],
        circleOptions
      ).addTo(map);
    }
  }

  function refreshUI() {
    const enriched = computeHospitalMetrics();
    updateHospitalMarkers(enriched);
    updateHospitalList(enriched);
    updateRecommendedFacility(enriched);
  }

  function computeHospitalMetrics() {
    const enriched = NEURO_HOSPITALS.map((hospital) => {
      if (!state.location) {
        return {
          ...hospital,
          distanceKm: null,
          travelHours: null,
          reachableWithinGuideline: false,
          meetsGuideline: false
        };
      }

      const distanceKm = haversine(
        state.location.lat,
        state.location.lng,
        hospital.coordinates.lat,
        hospital.coordinates.lng
      );
      const travelHours = distanceKm / state.averageSpeed;
      const reachableWithinGuideline = travelHours <= STROKE_GUIDELINE_HOURS;

      return {
        ...hospital,
        distanceKm,
        travelHours,
        reachableWithinGuideline,
        meetsGuideline: hospital.hasThrombolysis && reachableWithinGuideline
      };
    });

    if (state.location) {
      enriched.sort((a, b) => {
        const timeA = a.travelHours ?? Number.POSITIVE_INFINITY;
        const timeB = b.travelHours ?? Number.POSITIVE_INFINITY;
        return timeA - timeB;
      });
    } else {
      enriched.sort((a, b) => a.name.localeCompare(b.name));
    }

    return enriched;
  }

  function updateHospitalMarkers(enrichedList) {
    enrichedList.forEach((hospital) => {
      const marker = markerLookup.get(hospital.id);
      if (!marker) {
        return;
      }

      const passesThrombolysisFilter =
        !state.filters.thrombolysisOnly || hospital.hasThrombolysis;
      const passesGuidelineFilter =
        !state.filters.guidelineOnly ||
        (state.location ? hospital.reachableWithinGuideline : true);

      if (passesThrombolysisFilter && passesGuidelineFilter) {
        const isSelected = state.selectedHospitalId === hospital.id;
        const isGuideline = hospital.meetsGuideline;
        const baseColor = hospital.hasThrombolysis ? "#1e88e5" : "#fb8c00";
        const highlightColor = isGuideline ? "#1b5e20" : baseColor;
        const fillColor = isGuideline ? "#2e7d32" : hospital.hasThrombolysis ? "#42a5f5" : "#ffca28";

        marker.setStyle({
          color: highlightColor,
          fillColor,
          fillOpacity: isGuideline ? 0.95 : 0.8,
          radius: isSelected ? 11 : isGuideline ? 9 : 7,
          weight: isGuideline ? 2.4 : 2
        });

        if (!hospitalLayer.hasLayer(marker)) {
          hospitalLayer.addLayer(marker);
        }
      } else if (hospitalLayer.hasLayer(marker)) {
        hospitalLayer.removeLayer(marker);
      }
    });
  }

  function updateHospitalList(enrichedList) {
    const list = elements.hospitalList;
    list.innerHTML = "";

    const filtered = enrichedList.filter((hospital) => {
      if (state.filters.thrombolysisOnly && !hospital.hasThrombolysis) {
        return false;
      }
      if (state.filters.guidelineOnly && state.location && !hospital.reachableWithinGuideline) {
        return false;
      }
      return true;
    });

    const reachableCount = enrichedList.filter((hospital) => hospital.reachableWithinGuideline).length;
    const guidelineCount = enrichedList.filter((hospital) => hospital.meetsGuideline).length;

    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = state.location
        ? "No hospitals match the current filters. Try widening your criteria."
        : "Select a location to view travel times and filter results.";
      list.append(empty);
    } else {
      filtered.forEach((hospital) => {
        const item = document.createElement("li");
        item.className = "hospital-card";
        if (hospital.meetsGuideline) {
          item.classList.add("meets-guideline");
        }
        if (state.selectedHospitalId === hospital.id) {
          item.classList.add("is-selected");
        }
        item.dataset.id = hospital.id;
        item.innerHTML = createHospitalCardContent(hospital);
        list.append(item);
      });
    }

    const totalShown = filtered.length;
    elements.hospitalCount.textContent = `${totalShown} of ${NEURO_HOSPITALS.length} hospitals shown • ${reachableCount} within 4 hours • ${guidelineCount} meet the thrombolysis guideline`;
  }

  function createHospitalCardContent(hospital) {
    const badges = [
      hospital.hasThrombolysis
        ? '<span class="badge badge-thrombolysis">Thrombolysis</span>'
        : '<span class="badge badge-basic">Stabilisation</span>',
      hospital.hasStrokeUnit
        ? '<span class="badge badge-stroke-unit">Stroke unit</span>'
        : "",
      hospital.reachableWithinGuideline
        ? '<span class="badge badge-reachable">≤4 h</span>'
        : ""
    ]
      .filter(Boolean)
      .join(" ");

    const distanceText = formatDistance(hospital.distanceKm);
    const timeText = formatTime(hospital.travelHours);
    const servicesSnippet =
      (hospital.services || []).slice(0, 3).join(" • ") ||
      "Specialist services data pending update.";
    const displayNumber = hospital.emergencyHotline || DEFAULT_HELPLINE_NUMBER;
    const telLink = createTelLink(displayNumber);

    return `
      <div class="meta">${hospital.city}, ${hospital.province}</div>
      <h3>${hospital.name}</h3>
      <div class="meta">${badges}</div>
      <p class="distance">Distance: ${distanceText} • ETA: ${timeText}</p>
      <p class="services">${servicesSnippet}</p>
      <div class="actions">
        <button type="button" data-action="focus" data-id="${hospital.id}">
          View on map
        </button>
        <a class="call-link" href="${telLink}">
          Call ${displayNumber}
        </a>
      </div>
    `;
  }

  function updateRecommendedFacility(enrichedList) {
    const container = elements.recommendedContainer;
    container.innerHTML = "";

    if (!state.location) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Set a location to receive the best hospital recommendation.";
      container.append(empty);
      updateHelplineLink();
      return;
    }

    const recommended = enrichedList.find((hospital) => hospital.meetsGuideline);
    if (recommended) {
      const card = document.createElement("div");
      card.className = "recommended-card";
      const contactNumber =
        recommended.strokeTeamNumber ||
        recommended.emergencyHotline ||
        DEFAULT_HELPLINE_NUMBER;
      const callLabel = recommended.strokeTeamNumber
        ? `Call stroke team (${recommended.strokeTeamNumber})`
        : `Call hospital (${contactNumber})`;
      const capabilityList = (recommended.services || []).slice(0, 3).join(", ");
      card.innerHTML = `
        <h3>${recommended.name}</h3>
        <p>${recommended.city}, ${recommended.province}</p>
        <p class="metric"><strong>Estimated arrival:</strong> ${formatTime(
          recommended.travelHours
        )} (${formatDistance(recommended.distanceKm)})</p>
        <p class="metric"><strong>Capabilities:</strong> ${capabilityList}</p>
        <div class="actions">
          <a class="call-primary" href="${createTelLink(contactNumber)}">
            ${callLabel}
          </a>
          ${recommended.website
            ? `<a class="secondary-link" href="${recommended.website}" target="_blank" rel="noopener">Visit website</a>`
            : ""}
        </div>
      `;
      container.append(card);
      updateHelplineLink(recommended);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "empty-state";
      const nearest = enrichedList.find((hospital) => hospital.travelHours != null);
      fallback.innerHTML = nearest
        ? `No thrombolysis-capable hospitals are reachable within four hours at ${state.averageSpeed} km/h. Nearest option is <strong>${nearest.name}</strong> with an ETA of ${formatTime(
            nearest.travelHours
          )}. Consider activating tele-stroke support via the helpline.`
        : "No distance data yet. Adjust your location to explore options.";
      container.append(fallback);
      updateHelplineLink();
    }
  }

  function updateHelplineLink(hospital) {
    const link = elements.callHelplineLink;
    const number =
      hospital?.strokeTeamNumber || hospital?.emergencyHotline || DEFAULT_HELPLINE_NUMBER;
    link.href = createTelLink(number);
    let label;
    if (hospital?.strokeTeamNumber) {
      label = `Call stroke team (${hospital.strokeTeamNumber})`;
    } else if (hospital?.emergencyHotline) {
      label = `Call hospital (${hospital.emergencyHotline})`;
    } else {
      label = `Call stroke helpline (${DEFAULT_HELPLINE_NUMBER})`;
    }
    link.textContent = label;
  }

  function focusHospital(hospitalId) {
    const hospital = NEURO_HOSPITALS.find((item) => item.id === hospitalId);
    if (!hospital) {
      return;
    }

    state.selectedHospitalId = hospitalId;
    map.flyTo([hospital.coordinates.lat, hospital.coordinates.lng], 12, {
      duration: 0.8
    });

    const marker = markerLookup.get(hospitalId);
    if (marker) {
      marker.openPopup();
    }

    refreshUI();
  }

  function generatePopupContent(hospital) {
    const badges = [];
    if (hospital.hasThrombolysis) {
      badges.push("Thrombolysis capable");
    }
    if (hospital.hasStrokeUnit) {
      badges.push("Stroke unit");
    }
    badges.push(hospital.twentyFourSevenImaging ? "24/7 imaging" : "Imaging on-call");

    const contactLines = [];
    if (hospital.emergencyHotline) {
      contactLines.push(`<strong>Emergency:</strong> ${hospital.emergencyHotline}`);
    }
    if (hospital.strokeTeamNumber) {
      contactLines.push(`<strong>Stroke team:</strong> ${hospital.strokeTeamNumber}`);
    }

    return `
      <div class="popup-content">
        <strong>${hospital.name}</strong><br />
        ${hospital.city}, ${hospital.province}<br />
        <small>${badges.join(" • ")}</small><br />
        <small>${hospital.notes || ""}</small><br />
        ${contactLines.join("<br />")}
      </div>
    `;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(distanceKm) {
    if (distanceKm == null) {
      return "—";
    }
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)} m`;
    }
    const precision = distanceKm < 10 ? 1 : 0;
    return `${distanceKm.toFixed(precision)} km`;
  }

  function formatTime(hours) {
    if (hours == null) {
      return "—";
    }
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) {
      return `${m} min`;
    }
    if (m === 0) {
      return `${h} h`;
    }
    return `${h} h ${m} min`;
  }

  function createTelLink(number) {
    const digits = number ? number.replace(/[^+0-9]/g, "") : "";
    return `tel:${digits}`;
  }

  function updateSpeedDisplay() {
    elements.speedValue.textContent = state.averageSpeed.toString();
  }

  function setStatusMessage(message, isError = false) {
    elements.locationStatus.textContent = message;
    elements.locationStatus.classList.toggle("error", Boolean(isError));
  }

  function resetStatusMessage() {
    setStatusMessage("Tip: you can also tap anywhere on the map to drop a location pin.");
  }
})();
