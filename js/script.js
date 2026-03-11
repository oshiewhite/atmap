const firebaseConfig = {
  apiKey: "AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs",
  authDomain: "at-map-tmc.firebaseapp.com",
  projectId: "at-map-tmc",
  storageBucket: "at-map-tmc.firebasestorage.app",
  messagingSenderId: "862190385314",
  appId: "1:862190385314:web:f7fbf6a9eed1061231fffb",
  measurementId: "G-90GYNPFF82"
};

const isRuntimeOffline = window.ATMAP_RUNTIME_OFFLINE === true;

let auth = null;
let db = null;
let googleProvider = null;
let firebaseFns = null;

async function initializeFirebase() {
  if (firebaseFns) return firebaseFns;
  if (isRuntimeOffline) {
    throw new Error("Feedback is unavailable while offline.");
  }

  const [{ initializeApp }, authMod, firestoreMod, appCheckMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-check.js")
  ]);

  const app = initializeApp(firebaseConfig);
  if (appCheckMod) {
    appCheckMod.initializeAppCheck(app, {
      provider: new appCheckMod.ReCaptchaV3Provider("6LckRIcsAAAAABtcx9DepGiprCzFv_ex-5imoKGl"),
      isTokenAutoRefreshEnabled: true
    });
  }
  auth = authMod.getAuth(app);
  googleProvider = new authMod.GoogleAuthProvider();
  db = firestoreMod.getFirestore(app);

  firebaseFns = {
    signInWithPopup: authMod.signInWithPopup,
    signOut: authMod.signOut,
    onAuthStateChanged: authMod.onAuthStateChanged,
    collection: firestoreMod.collection,
    addDoc: firestoreMod.addDoc,
    serverTimestamp: firestoreMod.serverTimestamp,
    doc: firestoreMod.doc,
    getDoc: firestoreMod.getDoc,
    setDoc: firestoreMod.setDoc
  };

  return firebaseFns;
}

// Ensure signed-in user has a profile doc w/ username (REQUIRED)
async function ensureUserProfile() {
  const {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
  } = await initializeFirebase();

  if (!auth.currentUser) {
    throw new Error("Sign in with Google before creating a profile.");
  }

  const u = auth.currentUser;
  const userRef = doc(db, "users", u.uid);
  let snap;

  try {
    snap = await getDoc(userRef);
  } catch (err) {
    console.error("FAILED getDoc(users/{uid})", err);
    throw err;
  }

  const existingData = snap.exists() ? snap.data() : {};

  if (!existingData?.username) {
    const profileDetails = await promptForProfileDetails(existingData);

    try {
      await setDoc(userRef, {
        uid: u.uid,
        username: profileDetails.username,
        email: u.email || "",
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
        receiveMapUpdates: profileDetails.receiveMapUpdates,
        marketingEmailsOptIn: profileDetails.marketingEmailsOptIn,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("FAILED setDoc(users/{uid})", err);
      throw err;
    }

    return { uid: u.uid, username: profileDetails.username, email: u.email || "" };
  }

  if (typeof existingData.receiveMapUpdates === "undefined" || typeof existingData.marketingEmailsOptIn === "undefined") {
    await setDoc(userRef, {
      receiveMapUpdates: existingData.receiveMapUpdates === true,
      marketingEmailsOptIn: existingData.marketingEmailsOptIn === true,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  return {
    uid: u.uid,
    username: existingData.username,
    email: u.email || ""
  };
}
function titleCase(str) {
  return String(str || "")
    .trim()
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : "")
    .join(" ");
}

// Save any feedback payload to Firestore
// Save any feedback payload to Firestore (requires Google login + username)
// (REPLACES your current saveFeedback)
async function saveFeedback(payload) {
  console.log("[saveFeedback] CALLED", payload);

  const { addDoc, collection, serverTimestamp } = await initializeFirebase();
  const u = await ensureUserProfile();
  console.log("[saveFeedback] user", { uid: u.uid, username: u.username });

  const ref = await addDoc(collection(db, "feedback"), {
    ...payload,
    createdAt: serverTimestamp(),
    uid: u.uid,
    username: u.username
  });

  console.log("[saveFeedback] WROTE DOC:", ref.id);
  return ref;
}

async function saveMarkerSuggestion(payload) {
  const { addDoc, collection, serverTimestamp } = await initializeFirebase();
  const u = await ensureUserProfile();
  const suggestionDoc = {
    ...payload,
    kind: "marker_suggestion",
    createdAt: serverTimestamp(),
    uid: u.uid,
    username: u.username
  };

  try {
    return await addDoc(collection(db, "markerSuggestions"), suggestionDoc);
  } catch (err) {
    const isPermissionDenied = err?.code === "permission-denied" || err?.code === "PERMISSION_DENIED";

    if (!isPermissionDenied) throw err;

    console.warn("markerSuggestions write denied by rules; falling back to feedback collection.", err);
    return await addDoc(collection(db, "feedback"), {
      ...suggestionDoc,
      kind: "markerSuggestion"
    });
  }
}
document.getElementById("account-btn")?.addEventListener("click", async () => {
  try {
    const hasAccess = await requireMapSignIn({ prompt: true, allowGuest: false });
    if (!hasAccess) return;
    window.location.href = "account.html";
  } catch (e) {
    console.error(e);
  }
});



const authGate = document.getElementById("auth-gate");
const authGateSignInCard = document.getElementById("auth-gate-signin-card");
const authGateProfileCard = document.getElementById("auth-gate-profile-card");
const authGateMessage = document.getElementById("auth-gate-message");
const authGateProfileMessage = document.getElementById("auth-gate-profile-message");
const authGateLoginBtn = document.getElementById("auth-gate-login-btn");
const authGateGuestBtn = document.getElementById("auth-gate-guest-btn");
const authGateProfileForm = document.getElementById("auth-gate-profile-form");
const authGateUsernameInput = document.getElementById("auth-gate-username");
const authGateMapUpdatesCheckbox = document.getElementById("auth-gate-map-updates");
const authGateMarketingConsentCheckbox = document.getElementById("auth-gate-marketing-consent");
const authGateProfileError = document.getElementById("auth-gate-profile-error");
const authGateProfileSubmit = document.getElementById("auth-gate-profile-submit");
const appLoading = document.getElementById("app-loading");
const appLoadingText = document.getElementById("app-loading-text");
const MAP_GUEST_MODE_STORAGE_KEY = "atmap-guest-mode";

let appLoadingCount = 0;

function startAppLoading(message = "Loading map…") {
  appLoadingCount += 1;
  if (appLoadingText) appLoadingText.textContent = message;
  if (appLoading) appLoading.hidden = false;
}

function stopAppLoading() {
  appLoadingCount = Math.max(0, appLoadingCount - 1);
  if (appLoadingCount === 0 && appLoading) {
    appLoading.hidden = true;
  }
}

async function withAppLoading(message, task) {
  startAppLoading(message);
  try {
    return await task();
  } finally {
    stopAppLoading();
  }
}

function syncElevationPanelForAuthGate(locked) {
  const panel = document.getElementById("elevation-panel");
  const btn = document.getElementById("elevation-toggle");
  if (!panel || !btn) return;

  if (locked) {
    if (!panel.classList.contains("is-collapsed")) {
      panel.dataset.authForcedCollapsed = "true";
      panel.classList.add("is-collapsed");
    }
  } else if (panel.dataset.authForcedCollapsed === "true") {
    panel.classList.remove("is-collapsed");
    delete panel.dataset.authForcedCollapsed;
    scheduleElevationUpdate();
  }

  const collapsed = panel.classList.contains("is-collapsed");
  btn.setAttribute("aria-expanded", String(!collapsed));
  btn.title = collapsed ? "Show elevation" : "Minimize elevation";
  btn.textContent = collapsed ? "▴" : "▾";
}

function setMapLocked(locked, message = "") {
  document.body.classList.toggle("map-locked", locked);
  if (authGate) authGate.hidden = !locked;
  if (message && authGateMessage) authGateMessage.textContent = message;
  syncElevationPanelForAuthGate(locked);
}

function showAuthScreen(mode) {
  const showProfile = mode === "profile" && Boolean(auth?.currentUser);
  if (authGateSignInCard) authGateSignInCard.hidden = showProfile;
  if (authGateProfileCard) authGateProfileCard.hidden = !showProfile;
}

function setAuthGateMode(mode, message = "") {
  showAuthScreen(mode);
  if (mode === "profile") {
    if (authGateProfileMessage && message) authGateProfileMessage.textContent = message;
  } else if (authGateMessage && message) {
    authGateMessage.textContent = message;
  }
  if (authGateProfileError) authGateProfileError.textContent = "";
}

function promptForProfileDetails(existingProfile = {}) {
  return new Promise((resolve, reject) => {
    if (!auth?.currentUser) {
      reject(new Error("Sign in with Google before completing your profile."));
      return;
    }

    if (!authGateProfileForm || !authGateUsernameInput) {
      reject(new Error("Profile form is unavailable."));
      return;
    }

    setMapLocked(true, "Finish creating your account to continue.");
    setAuthGateMode("profile", "Finish creating your account to continue.");

    authGateUsernameInput.value = existingProfile.username || "";
    if (authGateMapUpdatesCheckbox) {
      authGateMapUpdatesCheckbox.checked = existingProfile.receiveMapUpdates === true;
    }
    if (authGateMarketingConsentCheckbox) {
      authGateMarketingConsentCheckbox.checked = existingProfile.marketingEmailsOptIn === true;
    }

    const handleSubmit = (event) => {
      event.preventDefault();
      const username = authGateUsernameInput.value.trim();

      if (username.length < 3 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
        if (authGateProfileError) {
          authGateProfileError.textContent = "Username must be at least 3 characters and use only letters, numbers, underscores, or hyphens.";
        }
        return;
      }

      cleanup();
      resolve({
        username,
        receiveMapUpdates: Boolean(authGateMapUpdatesCheckbox?.checked),
        marketingEmailsOptIn: Boolean(authGateMarketingConsentCheckbox?.checked)
      });
    };

    const cleanup = () => {
      authGateProfileForm.removeEventListener("submit", handleSubmit);
      if (authGateProfileSubmit) authGateProfileSubmit.disabled = false;
    };

    authGateProfileForm.addEventListener("submit", handleSubmit);
    authGateUsernameInput.focus();
  });
}

function isGuestModeEnabled() {
  return localStorage.getItem(MAP_GUEST_MODE_STORAGE_KEY) === "true";
}

function setGuestModeEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(MAP_GUEST_MODE_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(MAP_GUEST_MODE_STORAGE_KEY);
  }
}

function continueAsGuest() {
  setGuestModeEnabled(true);
  setMapLocked(false);
}

async function requireMapSignIn({ prompt = false, allowGuest = true } = {}) {
  const { onAuthStateChanged, signInWithPopup } = await initializeFirebase();

  if (allowGuest && isGuestModeEnabled()) {
    setMapLocked(false);
    return true;
  }

  const existingUser = await waitForInitialAuthUser(onAuthStateChanged);

  if (existingUser) {
    setGuestModeEnabled(false);
    await ensureUserProfile();
    setMapLocked(false);
    return true;
  }

  if (!prompt) {
    setAuthGateMode("signin", "Please sign in with Google to view the map.");
    setMapLocked(true, "Please sign in with Google to view the map.");
    return false;
  }

  try {
    await signInWithPopup(auth, googleProvider);
    setGuestModeEnabled(false);
    await ensureUserProfile();
    setMapLocked(false);
    return true;
  } catch (err) {
    console.error("Map sign-in failed:", err);
    setAuthGateMode("signin", "Sign-in was cancelled or failed. Please sign in to view the map.");
    setMapLocked(true, "Sign-in was cancelled or failed. Please sign in to view the map.");
    return false;
  }
}

function waitForInitialAuthUser(onAuthStateChanged) {
  if (auth?.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let unsub = null;

    const finalize = (user) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (typeof unsub === "function") unsub();
      resolve(user || null);
    };

    unsub = onAuthStateChanged(auth, (user) => finalize(user));
    timer = window.setTimeout(() => finalize(auth?.currentUser || null), 2500);
  });
}

setAuthGateMode("signin", "Please sign in with Google to view the map.");

if (authGateLoginBtn) {
  authGateLoginBtn.addEventListener("click", async () => {
    authGateLoginBtn.disabled = true;
    const ok = await withAppLoading("Signing you in…", () => requireMapSignIn({ prompt: true }));
    if (!ok) authGateLoginBtn.disabled = false;
  });
}

if (authGateGuestBtn) {
  authGateGuestBtn.addEventListener("click", () => {
    continueAsGuest();
  });
}

withAppLoading("Checking sign-in…", () => requireMapSignIn({ prompt: false })).catch((err) => {
  console.error("Initial map sign-in check failed:", err);
  setAuthGateMode("signin", "Please sign in with Google to view the map.");
  setMapLocked(true, "Please sign in with Google to view the map.");
});

const L = window.L;


// =======================
// UI: Sidebar & Mode Toggle
// =======================
// Toggle sidebar
// =======================
// UI: Sidebar pull-tab toggle
// =======================
const sidebar = document.getElementById("sidebar");
const sidebarTab = document.getElementById("sidebar-tab");
const themeToggleCheckbox = document.getElementById("theme-toggle-checkbox");
const markerLabelsCheckbox = document.getElementById("marker-labels-checkbox");
const saveViewBtn = document.getElementById("save-view-btn");
const loadViewBtn = document.getElementById("load-view-btn");

const THEME_STORAGE_KEY = "atmap-theme";
const MARKER_LABELS_STORAGE_KEY = "atmap-show-marker-labels";
const SAVED_VIEW_STORAGE_KEY = "atmap-saved-view";

let showMarkerLabels = localStorage.getItem(MARKER_LABELS_STORAGE_KEY) === "true";
const labelManagedMarkers = new Set();
let pendingLabelOverlapRefresh = false;

function refreshVisibleMarkerLabels() {
  pendingLabelOverlapRefresh = false;

  if (!showMarkerLabels || !map || !map._loaded) return;

  const bounds = map.getBounds();
  const mapSize = map.getSize();

  function unbindMarkerLabel(marker) {
    if (!marker?.getTooltip()) return;
    marker.closeTooltip();
    marker.unbindTooltip();
  }

  function bindMarkerLabel(marker) {
    if (marker?.getTooltip()) return;
    marker.bindTooltip(marker.__alwaysLabelText, {
      permanent: true,
      direction: "top",
      offset: [0, -26],
      className: "marker-name-label"
    });
  }

  labelManagedMarkers.forEach((marker) => {
    if (!marker || !marker._map || !marker.__alwaysLabelText) return;

    const latLng = marker.getLatLng();
    if (!latLng || !bounds.contains(latLng)) {
      unbindMarkerLabel(marker);
      return;
    }

    const point = map.latLngToContainerPoint(latLng);
    if (point.x < 0 || point.y < 0 || point.x > mapSize.x || point.y > mapSize.y) {
      unbindMarkerLabel(marker);
      return;
    }

    bindMarkerLabel(marker);
    marker.openTooltip();

    const tooltip = marker.getTooltip();
    const tooltipEl = tooltip?.getElement?.();
    if (!tooltipEl) return;

    const labelWidth = Math.max(36, Math.min(180, 14 + marker.__alwaysLabelText.length * 6.5));
    const labelHeight = 18;
    const box = {
      left: point.x - labelWidth / 2,
      right: point.x + labelWidth / 2,
      top: point.y - 26 - labelHeight,
      bottom: point.y - 26
    };

    if (box.left < 0 || box.top < 0 || box.right > mapSize.x || box.bottom > mapSize.y) {
      tooltipEl.style.display = "none";
      tooltipEl.setAttribute("aria-hidden", "true");
      return;
    }

    tooltipEl.style.display = "";
    tooltipEl.setAttribute("aria-hidden", "false");
  });
}

function scheduleVisibleMarkerLabelsRefresh() {
  if (pendingLabelOverlapRefresh) return;
  pendingLabelOverlapRefresh = true;
  requestAnimationFrame(refreshVisibleMarkerLabels);
}

function applyTheme(theme) {
  document.body.classList.toggle("dark-mode", theme === "dark");
  if (themeToggleCheckbox) {
    themeToggleCheckbox.checked = theme === "dark";
  }
}

function updateMarkerLabelsVisibility() {
  labelManagedMarkers.forEach((marker) => {
    if (!marker || !marker.__alwaysLabelText) return;

    if (!showMarkerLabels) {
      marker.closeTooltip();
      marker.unbindTooltip();
    }
  });

  if (markerLabelsCheckbox) {
    markerLabelsCheckbox.checked = showMarkerLabels;
  }

  scheduleVisibleMarkerLabelsRefresh();
}

function registerMarkerLabel(marker, labelText) {
  if (!marker || !labelText) return;
  marker.__alwaysLabelText = labelText;
  labelManagedMarkers.add(marker);
  updateMarkerLabelsVisibility();
}

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(savedTheme === "dark" ? "dark" : "light");
updateMarkerLabelsVisibility();

themeToggleCheckbox?.addEventListener("change", () => {
  const theme = themeToggleCheckbox.checked ? "dark" : "light";
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
});

markerLabelsCheckbox?.addEventListener("change", () => {
  showMarkerLabels = markerLabelsCheckbox.checked;
  localStorage.setItem(MARKER_LABELS_STORAGE_KEY, String(showMarkerLabels));
  updateMarkerLabelsVisibility();
});

function getCurrentViewState() {
  const checkedCheckboxIds = Array.from(document.querySelectorAll("#sidebar input[type=\"checkbox\"]:checked"))
    .map((el) => el.id)
    .filter(Boolean);

  const center = map.getCenter();
  return {
    center: { lat: center.lat, lng: center.lng },
    zoom: map.getZoom(),
    checkedCheckboxIds
  };
}

function saveCurrentView() {
  if (!map || !map._loaded) return;

  const viewState = getCurrentViewState();
  localStorage.setItem(SAVED_VIEW_STORAGE_KEY, JSON.stringify(viewState));
}

function loadSavedView() {
  const raw = localStorage.getItem(SAVED_VIEW_STORAGE_KEY);
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to parse saved view:", err);
    return;
  }

  const checkedIds = new Set(Array.isArray(parsed.checkedCheckboxIds) ? parsed.checkedCheckboxIds : []);

  const sidebarCheckboxes = document.querySelectorAll("#sidebar input[type=\"checkbox\"]");
  sidebarCheckboxes.forEach((checkbox) => {
    if (!checkbox.id) return;
    const shouldBeChecked = checkedIds.has(checkbox.id);
    if (checkbox.checked === shouldBeChecked) return;
    checkbox.checked = shouldBeChecked;
    checkbox.dispatchEvent(new Event("change"));
  });

  const lat = Number(parsed?.center?.lat);
  const lng = Number(parsed?.center?.lng);
  const zoom = Number(parsed?.zoom);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
    map.setView([lat, lng], zoom);
  }
}

saveViewBtn?.addEventListener("click", saveCurrentView);
loadViewBtn?.addEventListener("click", loadSavedView);

function setSidebarOpen(isOpen){
  sidebar.classList.toggle("open", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);

  // a11y + label
  sidebarTab.setAttribute("aria-expanded", String(isOpen));
  sidebarTab.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");

  // optional: change icon direction
  sidebarTab.textContent = isOpen ? "❯" : "❮";
}


// start state (match your current default)
setSidebarOpen(sidebar ? sidebar.classList.contains("open") : false);


// click
sidebarTab.addEventListener("click", () => {
  setSidebarOpen(!sidebar.classList.contains("open"));
});


function wireResupplySubmenus() {
  const sections = document.querySelectorAll('#sidebar .menu-section[data-collapsible]');

  sections.forEach(section => {
    const title = section.querySelector('.menu-title');
    const submenu = section.querySelector('.sub-menu');
    if (!title || !submenu) return;

    title.addEventListener('click', (e) => {
      // if you ever click directly on a checkbox inside title (you don't right now), don't toggle
      if (e.target && e.target.tagName === 'INPUT') return;

      const nowCollapsed = submenu.classList.toggle('is-collapsed');
      section.classList.toggle('is-open', !nowCollapsed);
    });

    // set initial arrow state
    section.classList.toggle('is-open', !submenu.classList.contains('is-collapsed'));
  });
}

wireResupplySubmenus();
// --- Water checkbox should NOT toggle submenu ---
const waterCheckbox = document.getElementById("water-checkbox");

if (waterCheckbox) {
  waterCheckbox.addEventListener("click", (e) => {
    e.stopPropagation(); // prevents submenu collapse
  });
}


// =======================
// escapeHTML
// =======================
function escapeHtml(value) {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// =======================
// Map Initialization
// =======================
var map = L.map('map', {
    closePopupOnClick: false
}).setView([39.725324, -76.904297], 5);

map.on("zoomend moveend", scheduleVisibleMarkerLabelsRefresh);

const suggestionIcon = L.icon({
  iconUrl: "icons/tent_marker.png",
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -36]
});

const suggestMarkerBtn = document.getElementById("suggest-marker-btn");
const suggestMarkerLoading = document.getElementById("suggest-marker-loading");

let suggestedDraftMarker = null;
let suggestionCurrentLocation = null;
let suggestionMarkerConfirmed = false;
let suggestionMarkerType = "";
let suggestionNotes = "";

function setSuggestionLocationLoading(isLoading) {
  if (suggestMarkerBtn) suggestMarkerBtn.disabled = isLoading;
  if (suggestMarkerLoading) suggestMarkerLoading.hidden = !isLoading;
}

function formatLatLng(latlng) {
  if (!latlng) return "—";
  return `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

function buildSuggestionPopupHtml() {
  const markerLatLng = suggestedDraftMarker ? suggestedDraftMarker.getLatLng() : null;
  const submitDisabled = !suggestionMarkerConfirmed || !suggestionMarkerType;

  return `
    <div class="suggestion-popup">
      <p class="suggest-copy">A marker will drop on your current location. Drag it to the exact spot and confirm.</p>
      <p class="suggest-coords">Current location: ${formatLatLng(suggestionCurrentLocation)}</p>
      <p class="suggest-coords">Suggested marker: ${formatLatLng(markerLatLng)}</p>

      <button class="account-btn suggest-marker-confirm-btn" type="button">Confirm Marker Position</button>

      <label for="suggest-marker-type-popup" class="suggest-label">Marker type</label>
      <select id="suggest-marker-type-popup" class="suggest-select suggest-marker-type-select" ${suggestionMarkerConfirmed ? "" : "disabled"}>
        <option value="">Select a type</option>
        <option value="tentsite" ${suggestionMarkerType === "tentsite" ? "selected" : ""}>Tentsite</option>
        <option value="water" ${suggestionMarkerType === "water" ? "selected" : ""}>Water</option>
        <option value="business" ${suggestionMarkerType === "business" ? "selected" : ""}>Business</option>
        <option value="other" ${suggestionMarkerType === "other" ? "selected" : ""}>Other</option>
      </select>

      <label for="suggest-marker-notes-popup" class="suggest-label">Suggestion details</label>
      <textarea id="suggest-marker-notes-popup" class="suggest-textarea suggest-marker-notes-input" placeholder="Add details (name, notes, anything helpful)...">${escapeHtml(suggestionNotes)}</textarea>

      <button class="account-btn suggest-marker-submit-btn" type="button" ${submitDisabled ? "disabled" : ""}>Submit Suggestion</button>
      <button class="account-btn suggest-marker-cancel-btn" type="button">Cancel</button>
    </div>
  `;
}

function renderSuggestionPopup(openPopup = false) {
  if (!suggestedDraftMarker) return;
  suggestedDraftMarker.bindPopup(buildSuggestionPopupHtml(), { autoClose: false });
  if (openPopup) suggestedDraftMarker.openPopup();
}

function resetSuggestionForm() {
  setSuggestionLocationLoading(false);
  suggestionCurrentLocation = null;
  suggestionMarkerConfirmed = false;
  suggestionMarkerType = "";
  suggestionNotes = "";

  if (suggestedDraftMarker && map.hasLayer(suggestedDraftMarker)) {
    map.removeLayer(suggestedDraftMarker);
  }
  suggestedDraftMarker = null;
}

function setSuggestionMarkerAtLatLng(currentLatLng) {
  suggestionCurrentLocation = currentLatLng;
  suggestionMarkerConfirmed = false;
  suggestionMarkerType = "";
  suggestionNotes = "";

  if (suggestedDraftMarker && map.hasLayer(suggestedDraftMarker)) {
    map.removeLayer(suggestedDraftMarker);
  }

  suggestedDraftMarker = L.marker(currentLatLng, {
    draggable: true,
    icon: suggestionIcon
  }).addTo(map);

  renderSuggestionPopup(true);

  suggestedDraftMarker.on("dragend", () => {
    suggestionMarkerConfirmed = false;
    renderSuggestionPopup(true);
  });

  map.setView([currentLatLng.lat, currentLatLng.lng], 14);
}

function setSuggestionMarkerAtCurrentLocation(position) {
  setSuggestionMarkerAtLatLng({
    lat: position.coords.latitude,
    lng: position.coords.longitude
  });
}

function promptForManualCurrentLocation() {
  const defaultCenter = map.getCenter();
  const latInput = window.prompt("Enter your current latitude (example: 34.123456)", defaultCenter.lat.toFixed(6));
  if (latInput === null) return null;

  const lngInput = window.prompt("Enter your current longitude (example: -84.123456)", defaultCenter.lng.toFixed(6));
  if (lngInput === null) return null;

  const lat = Number(latInput.trim());
  const lng = Number(lngInput.trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    alert("That location is invalid. Please enter valid numeric coordinates.");
    return null;
  }

  return { lat, lng };
}

function showLocationPermissionInstructions() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const safariHint = isSafari && isIOS
    ? " On iPhone Safari, open Settings > Safari > Location, make sure it is allowed, and confirm this site is using HTTPS."
    : "";

  alert(
    `Location access is blocked. Please enable location permissions for this site in your browser settings, then try again.${safariHint}`
  );
}

function requestCurrentPosition(options = {}) {
  const {
    onSuccess,
    onError,
    onUnavailable
  } = options;

  if (!navigator.geolocation) {
    if (typeof onUnavailable === "function") {
      onUnavailable();
    } else {
      alert("Geolocation is not supported by this browser.");
    }
    return;
  }

  if (!window.isSecureContext) {
    alert("Location access requires HTTPS in Safari and many mobile browsers. Please open this site over https:// and try again.");
    return;
  }

  // Important: request location directly inside the click handler call stack.
  // This helps Safari on iPhone display the native permission prompt.
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (typeof onSuccess === "function") onSuccess(position);
    },
    (error) => {
      if (typeof onError === "function") onError(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function requestCurrentLocationForSuggestion() {
  setSuggestionLocationLoading(true);

  requestCurrentPosition({
    onSuccess: (position) => {
      setSuggestionMarkerAtCurrentLocation(position);
      setSuggestionLocationLoading(false);
    },
    onError: (error) => {
      console.error("Unable to get your location for marker suggestion:", error);

      if (error?.code === error.PERMISSION_DENIED) {
        showLocationPermissionInstructions();
        setSuggestionLocationLoading(false);
        return;
      }

      const useManualLocation = window.confirm(
        "We couldn't access your current location right now. Click OK to enter your location manually and continue."
      );

      if (!useManualLocation) {
        setSuggestionLocationLoading(false);
        return;
      }

      const manualCurrentLocation = promptForManualCurrentLocation();
      if (!manualCurrentLocation) {
        setSuggestionLocationLoading(false);
        return;
      }

      setSuggestionMarkerAtLatLng(manualCurrentLocation);
      setSuggestionLocationLoading(false);
    },
    onUnavailable: () => {
      alert("Geolocation is not supported by this browser.");
      setSuggestionLocationLoading(false);
    }
  });
}

resetSuggestionForm();

// ==================================================
// Elevation Profile (trail_points.csv) - viewport-aware
// ==================================================
let TRAIL_POINTS = [];  // { lat, lng, elev, mile }
let elevationChartReady = false;
let ELEV_DRAW = {
  points: [],      // points used for last draw
  minMile: 0,
  maxMile: 0,
  padL: 44,
  padR: 10,
  plotW: 1,
  cssW: 1
};


function parseTrailPointsCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // detect delimiter (tabs vs commas)
  const header = lines[0];
  const delim = header.includes("\t") ? "\t" : ",";

  // map header -> index
  const cols = header.split(delim).map(s => s.trim().toLowerCase());
  const idxLat  = cols.indexOf("latitude");
  const idxLng  = cols.indexOf("longitude");
  const idxElev = cols.indexOf("elevation");
  const idxMile = cols.indexOf("distance_along_trail_miles");

  if (idxLat < 0 || idxLng < 0 || idxElev < 0 || idxMile < 0) {
    console.warn("[elevation] Missing expected columns in trail_points header:", cols);
    return [];
  }

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim);
    if (parts.length < cols.length) continue;

    const lat  = parseFloat(parts[idxLat]);
    const lng  = parseFloat(parts[idxLng]);
    const elev = parseFloat(parts[idxElev]);
    const mile = parseFloat(parts[idxMile]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        !Number.isFinite(elev) || !Number.isFinite(mile)) continue;

    out.push({ lat, lng, elev, mile });
  }

  // Ensure sorted by mile so the chart draws correctly
  out.sort((a, b) => a.mile - b.mile);
  return out;
}

async function loadTrailPointsOnce() {
  if (elevationChartReady) return;

  // Update path if needed:
  const url = "data/trail_points.csv";

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url} (HTTP ${r.status})`);

  const text = await r.text();
  TRAIL_POINTS = parseTrailPointsCsv(text);

  elevationChartReady = true;
  console.log("[elevation] loaded points:", TRAIL_POINTS.length);
}

function getTrailPointsInView() {
  if (!TRAIL_POINTS.length) return [];

  const b = map.getBounds();
  const south = b.getSouth();
  const north = b.getNorth();
  const west  = b.getWest();
  const east  = b.getEast();

  const out = [];
  for (const p of TRAIL_POINTS) {
    if (p.lat < south || p.lat > north) continue;
    if (p.lng < west  || p.lng > east) continue;
    out.push(p);
  }
  return out;
}


function drawElevationProfile(points, opts = {}) {
  const canvas = document.getElementById("elevation-canvas");
  const titleEl = document.getElementById("elevation-title-text");
  const gainEl = document.getElementById("elevation-gain");
  const lossEl = document.getElementById("elevation-loss");
  if (!canvas) return;

  function formatElevationDelta(value) {
    const rounded = Math.max(0, Math.round(value));
    return Number.isFinite(rounded) ? rounded.toLocaleString() : "0";
  }

  function setElevationGainLoss(pointsForTotals) {
    if (!gainEl || !lossEl) return;

    if (!pointsForTotals || pointsForTotals.length < 2) {
      gainEl.textContent = "+0";
      lossEl.textContent = "-0";
      return;
    }

    let gain = 0;
    let loss = 0;
    for (let i = 1; i < pointsForTotals.length; i++) {
      const diff = pointsForTotals[i].elev - pointsForTotals[i - 1].elev;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    gainEl.textContent = `+${formatElevationDelta(gain)}`;
    lossEl.textContent = `-${formatElevationDelta(loss)}`;
  }

  const ctx = canvas.getContext("2d");
  const panel = canvas.parentElement;

  // Resize for devicePixelRatio so it’s crisp
  const dpr = window.devicePixelRatio || 1;
  const cssW = panel.clientWidth;
  const cssH = canvas.clientHeight || 120;

  canvas.width  = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;

  const bg = opts.bg ?? "rgba(255,255,255,0.0)";
  const fg = opts.fg ?? "#111";
  const grid = opts.grid ?? "rgba(0,0,0,0.12)";
  const line = opts.line ?? "#2b63ff";

  // Clear
  ctx.clearRect(0, 0, W, H);
  if (bg && bg !== "transparent") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // No data message
  if (!points || points.length < 2) {
    ctx.fillStyle = fg;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Zoom to the trail to see elevation.", 10, 18);

    if (titleEl) titleEl.textContent = "Elevation Profile";
    setElevationGainLoss(points);
    return;
  }

  const padL = 44;
  const padR = 10;
  const padT = 8;
  const padB = 18;

  const plotW = Math.max(1, W - padL - padR);
  const plotH = Math.max(1, H - padT - padB);

  const minElev = Math.min(...points.map(p => p.elev));
  const maxElev = Math.max(...points.map(p => p.elev));
  const minMile = points[0].mile;
  const maxMile = points[points.length - 1].mile;
    ELEV_DRAW = {
    points: points.slice(), // copy
    minMile,
    maxMile,
    padL,
    padR,
    plotW,
    cssW: W
  };


  const elevRange = (maxElev - minElev) || 1;
  const mileRange = (maxMile - minMile) || 1;

  function xFor(mile) {
    return padL + ((mile - minMile) / mileRange) * plotW;
  }
  function yFor(elev) {
    // top is high elevation
    return padT + (1 - ((elev - minElev) / elevRange)) * plotH;
  }

  // Grid lines (simple: 3 horizontals)
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= 2; i++) {
    const y = padT + (plotH * i) / 2;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // Axis labels
  ctx.fillStyle = fg;
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";

  const topLabel = Math.round(maxElev);
  const midLabel = Math.round((minElev + maxElev) / 2);
  const botLabel = Math.round(minElev);

  ctx.fillText(String(topLabel), 6, padT + 9);
  ctx.fillText(String(midLabel), 6, padT + plotH / 2 + 4);
  ctx.fillText(String(botLabel), 6, padT + plotH + 4);

  // Line
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = xFor(p.mile);
    const y = yFor(p.elev);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Title text with range
  if (titleEl) {
    const milesText =
      mileRange >= 0.1
        ? `${minMile.toFixed(1)}–${maxMile.toFixed(1)} mi`
        : `${minMile.toFixed(2)}–${maxMile.toFixed(2)} mi`;

    titleEl.textContent = `Elevation Profile • ${milesText} • ${Math.round(minElev)}–${Math.round(maxElev)} elev`;
  }

  setElevationGainLoss(points);
}

let elevationUpdateTimer = null;
function scheduleElevationUpdate() {
  clearTimeout(elevationUpdateTimer);
  elevationUpdateTimer = setTimeout(() => {
    const pts = getTrailPointsInView();
    drawElevationProfile(pts);
  }, 60);
}

async function initElevationProfile() {
  try {
    await loadTrailPointsOnce();
    // initial draw (whole map view)
    scheduleElevationUpdate();

    // update on pan/zoom
    map.on("moveend", scheduleElevationUpdate);
    map.on("zoomend", scheduleElevationUpdate);

    // redraw on resize (sidebar open/close etc.)
    window.addEventListener("resize", scheduleElevationUpdate);

  } catch (err) {
    console.error("[elevation] init failed:", err);
  }
}

// Call it once after map is created
withAppLoading("Loading map data…", () => initElevationProfile());
function redrawElevationNow() {
  const pts = getTrailPointsInView();
  drawElevationProfile(pts);
}

// --- Redraw elevation when the panel size changes (sidebar open/close, etc.) ---
(function watchElevationPanelResize(){
  const panel = document.getElementById("elevation-panel");
  if (!panel || !("ResizeObserver" in window)) return;

  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      redrawElevationNow(); // <-- immediate, no setTimeout(60)
    });
  });

  ro.observe(panel);
})();



function initElevationChartInteractions() {
  const canvas = document.getElementById("elevation-canvas");
  if (!canvas) return;

  let dragging = false;
  let startX = 0;
  let lastX = 0;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function xToMile(x) {
    const d = ELEV_DRAW;
    if (!d || !d.points || d.points.length < 2) return null;

    // clamp x to plot area
    const xClamped = clamp(x, d.padL, d.padL + d.plotW);
    const t = (xClamped - d.padL) / d.plotW;
    return d.minMile + t * (d.maxMile - d.minMile);
  }

  function drawSelectionOverlay(x1, x2) {
    // Redraw current profile first (so overlay is always on top)
    drawElevationProfile(ELEV_DRAW.points);

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const a = clamp(Math.min(x1, x2), 0, W);
    const b = clamp(Math.max(x1, x2), 0, W);
    const w = Math.max(0, b - a);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;

    ctx.fillRect(a, 0, w, H);
    ctx.strokeRect(a + 0.5, 0.5, w - 1, H - 1);
    ctx.restore();
  }

  function swallowTouchEvent(e) {
    // Prevent touch gestures on the elevation chart from bubbling into map/sidebar gestures.
    e.preventDefault();
    e.stopPropagation();
  }

  function zoomMapToMileRange(m1, m2) {
    if (!Number.isFinite(m1) || !Number.isFinite(m2)) return;

    const lo = Math.min(m1, m2);
    const hi = Math.max(m1, m2);

    // tiny ranges are usually accidental clicks; ignore unless you want “click-to-zoom”
    if (hi - lo < 0.05) return;

    // Use the points that were actually drawn (keeps it consistent with the view-based chart)
    const pts = (ELEV_DRAW.points || []).filter(p => p.mile >= lo && p.mile <= hi);
    if (pts.length < 2) return;

    const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  // Mouse
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    lastX = startX;
    drawSelectionOverlay(startX, lastX);
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    drawSelectionOverlay(startX, lastX);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;

    const m1 = xToMile(startX);
    const m2 = xToMile(lastX);

    // Redraw without overlay
    drawElevationProfile(ELEV_DRAW.points);

    zoomMapToMileRange(m1, m2);
  });

  // Touch
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (!t) return;
    swallowTouchEvent(e);
    dragging = true;
    const rect = canvas.getBoundingClientRect();
    startX = t.clientX - rect.left;
    lastX = startX;
    drawSelectionOverlay(startX, lastX);
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    if (!t) return;
    swallowTouchEvent(e);
    const rect = canvas.getBoundingClientRect();
    lastX = t.clientX - rect.left;
    drawSelectionOverlay(startX, lastX);
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    if (!dragging) return;
    swallowTouchEvent(e);
    dragging = false;

    const m1 = xToMile(startX);
    const m2 = xToMile(lastX);

    drawElevationProfile(ELEV_DRAW.points);
    zoomMapToMileRange(m1, m2);
  });

  canvas.addEventListener("touchcancel", (e) => {
    if (!dragging) return;
    swallowTouchEvent(e);
    dragging = false;
    drawElevationProfile(ELEV_DRAW.points);
  }, { passive: false });

  // Double click: reset (just redraw based on current map bounds)
  canvas.addEventListener("dblclick", () => {
    scheduleElevationUpdate(); // your existing “draw based on viewport” function
  });
}

initElevationChartInteractions();

// =======================
// Elevation panel collapse/expand
// =======================
(function initElevationPanelToggle(){
  const panel = document.getElementById("elevation-panel");
  const btn   = document.getElementById("elevation-toggle");
  const titleText = document.getElementById("elevation-title-text");

  if (!panel || !btn) return;

  // restore saved state
  const saved = localStorage.getItem("elevationCollapsed") === "true";
  if (saved) panel.classList.add("is-collapsed");

  function syncButton(){
    const collapsed = panel.classList.contains("is-collapsed");
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.title = collapsed ? "Show elevation" : "Minimize elevation";
    btn.textContent = collapsed ? "▴" : "▾";

    // when expanding, redraw so canvas sizes correctly
    if (!collapsed) {
      scheduleElevationUpdate();
    }
  }

  btn.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
    localStorage.setItem("elevationCollapsed", panel.classList.contains("is-collapsed"));
    syncButton();
  });

  // optional: double-click title bar toggles too
  panel.querySelector("#elevation-title")?.addEventListener("dblclick", () => {
    panel.classList.toggle("is-collapsed");
    localStorage.setItem("elevationCollapsed", panel.classList.contains("is-collapsed"));
    syncButton();
  });

  // If your drawElevationProfile currently does:
  // titleEl.textContent = `Elevation Profile ...`
  // change it to target #elevation-title-text instead (see next section)

  syncButton();
})();


L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
	opacity: 0.4
}).addTo(map);

// =======================
// Places.csv spiderfier (OMS)
// =======================
const placesOms = (window.OverlappingMarkerSpiderfier)
  ? new OverlappingMarkerSpiderfier(map, {
      keepSpiderfied: true,
      nearbyDistance: 6,          // was 28 (pixels). 6 is “practically the same spot”
      circleSpiralSwitchover: 9,
      legWeight: 0
    })
  : null;


if (!placesOms) {
  console.warn("OMS not loaded (OverlappingMarkerSpiderfier missing). Places won't spiderfy.");
} else {
  // make OMS open popups correctly
  placesOms.addListener("click", function(marker) {
    //marker.openPopup();
  });
}
let isPlacesSpiderfied = false;


if (placesOms) {
  placesOms.addListener("spiderfy", function () {
    isPlacesSpiderfied = true;
  });
  placesOms.addListener("unspiderfy", function () {
    isPlacesSpiderfied = false;
  });
}

// =======================
// Configuration: Place Types & City Auto-Toggles
// =======================
const PLACE_TYPES = {
  grocery:     { checkboxId: 'grocery-stores-checkbox', icon: 'icons/grocery.png',     label: 'Grocery Store',  autoOnCityClick: true },
  hostel:      { checkboxId: 'hostel-checkbox',         icon: 'icons/hostel.png',      label: 'Hostel',         autoOnCityClick: true },
  library:     { checkboxId: 'library-checkbox',        icon: 'icons/library.png',     label: 'Library',        autoOnCityClick: true },
  postoffice:  { checkboxId: 'postoffice-checkbox',     icon: 'icons/post office.png', label: 'Post Office',    autoOnCityClick: true },
  pharmacy:    { checkboxId: 'pharmacy-checkbox',       icon: 'icons/pharmacy.png',    label: 'Pharmacy',       autoOnCityClick: true },
  hospital:    { checkboxId: 'hospital-checkbox',       icon: 'icons/hospital.png',    label: 'Hospital',       autoOnCityClick: true },
  outfitter:   { checkboxId: 'outfitter-checkbox',      icon: 'icons/outfitter.png',   label: 'Outfitter',      autoOnCityClick: true },
  laundromat:  { checkboxId: 'laundromat-checkbox',     icon: 'icons/laundromat.png',  label: 'Laundromat',     autoOnCityClick: true },
  fuel:  { checkboxId: 'fuel-checkbox',     icon: 'icons/fuel.png',  label: 'Fuel',     autoOnCityClick: true },
  tent:  { checkboxId: 'tent-checkbox',     icon: 'icons/tent.png',  label: 'Tent',     autoOnCityClick: true },
  general:  { checkboxId: 'general-checkbox',     icon: 'icons/general.png',  label: 'General',     autoOnCityClick: true },
  hotel:  { checkboxId: 'hotel-checkbox',     icon: 'icons/hotel.png',  label: 'Hotel',     autoOnCityClick: true },
  campground:  { checkboxId: 'campground-checkbox',     icon: 'icons/campground.png',  label: 'Campground',     autoOnCityClick: true },
  shower:  { checkboxId: 'shower-checkbox',     icon: 'icons/shower.png',  label: 'Shower',     autoOnCityClick: true },
buffet:  { checkboxId: 'buffet-checkbox',     icon: 'icons/buffet.png',  label: 'Buffet',     autoOnCityClick: true },


  // Transportation types (add/remove here only)
  shuttle:     { checkboxId: 'shuttle-checkbox',        icon: 'icons/shuttle.png',     label: 'Shuttle',        autoOnCityClick: false },
  bus:         { checkboxId: 'bus-checkbox',            icon: 'icons/bus.png',         label: 'Bus/Bus Stop',   autoOnCityClick: false },
  taxi:        { checkboxId: 'taxi-checkbox',           icon: 'icons/taxi.png',        label: 'Taxi',           autoOnCityClick: false },
};

const CITY_AUTO_TYPES = ["grocery", "hostel", "postoffice", "pharmacy", "hospital", "outfitter", "library","laundromat","fuel","tent","hotel"];


// =======================
// Global State
// =======================
var currentCityLayer = null; // Variable to store the current city layer group
var currentCityName = 'Appalachian Trail'; // Initialize to 'Appalachian Trail'
var geojsonLayer;
var cityLayer;
const mileTextLayer = L.layerGroup().addTo(map);
var trailCoordinates = [];
var mileMarkers = [];
var userLocationMarker;
var simulatedLocationMarker;
var currentGeoJsonLayer = null; // Variable to store the currently displayed GeoJSON layer
var currentRoutingControl = null;
var shelterLayerGroup = L.layerGroup();
var peakLayerGroup = L.layerGroup();
var parkingLayerGroup = L.layerGroup();
var gapLayerGroup = L.layerGroup();
var waterLayerGroup = L.layerGroup();
var waterSubtypes = {};
var resupplyLayerGroup = L.layerGroup();
var intersectionsLayerGroup = L.layerGroup().addTo(map);
var cityLayerGroups = {};
const ROAD_CROSSINGS = []; 


// --- Multi-city "active cities" support ---
let activeCityKeys = null;              // array of cityKey strings (lowercase), or null
let currentGeoJsonLayers = [];          // store multiple route layers, not just one
let activeCityRouteIds = new Map();     // cityKey -> routeid
let activeCityNamesByKey = new Map();   // cityKey -> display name

async function loadRouteLayersForIds(routeids, focusMarker) {
  const ROUTE_COLORS = ["purple", "green", "orange"];

  const results = await Promise.allSettled(
    routeids.map(async (rid, index) => {
      const url = `data/${rid}.geojson`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Missing route file: ${url} (HTTP ${r.status})`);

      const gj = await r.json();
      const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
      return L.geoJSON(gj, { style: { color, weight: 3 } });
    })
  );

  const layers = results.filter(x => x.status === "fulfilled").map(x => x.value);
  const failed = results
    .filter(x => x.status === "rejected")
    .map(x => x.reason?.message || String(x.reason));

  layers.forEach(l => l.addTo(map));
  currentGeoJsonLayers = layers;

  if (layers.length) {
    const allBounds = L.latLngBounds([]);
    layers.forEach(l => allBounds.extend(l.getBounds()));
    if (allBounds.isValid()) map.fitBounds(allBounds);
  } else if (focusMarker) {
    map.setView(focusMarker.getLatLng(), 15);
  }

  if (failed.length) console.warn("[routes] some routes failed to load:", failed);
  scheduleAutoSpiderfy();
}

function updateCityNameDisplayFromActiveCities() {
  if (!activeCityRouteIds.size) {
    currentCityName = "Appalachian Trail";
  } else if (activeCityRouteIds.size === 1) {
    currentCityName = [...activeCityNamesByKey.values()][0] || "Appalachian Trail";
  } else {
    currentCityName = `${activeCityRouteIds.size} Resupply Towns`;
  }

  document.getElementById("city-name-display").innerText = currentCityName;
}

function removeCityTextLabels(cityKey = null) {
  if (!resupplyLayerGroup || typeof resupplyLayerGroup.eachLayer !== "function") return;

  const normalizedKey = cityKey ? String(cityKey).trim().toLowerCase() : null;

  resupplyLayerGroup.eachLayer((layer) => {
    if (layer?.__cityLabel) {
      const labelKey = (layer.__cityLabel.__cityKey || "").trim().toLowerCase();
      if (!normalizedKey || labelKey === normalizedKey) {
        resupplyLayerGroup.removeLayer(layer.__cityLabel);
      }
    }

    if (Array.isArray(layer?.__cityLabels)) {
      layer.__cityLabels.forEach((labelLayer) => {
        if (!labelLayer) return;
        const labelKey = (labelLayer.__cityKey || "").trim().toLowerCase();
        if (!normalizedKey || labelKey === normalizedKey) {
          resupplyLayerGroup.removeLayer(labelLayer);
        }
      });
    }
  });
}

async function closeSpecificCityLayer(cityKey) {
  if (!cityKey || !activeCityRouteIds.has(cityKey)) return;

  removeCityTextLabels(cityKey);

  activeCityRouteIds.delete(cityKey);
  activeCityNamesByKey.delete(cityKey);
  const cityLayer = cityLayerGroups[cityKey];
  if (cityLayer && map.hasLayer(cityLayer)) map.removeLayer(cityLayer);
  activeCityKeys = activeCityRouteIds.size ? [...activeCityRouteIds.keys()] : null;

  if (activeCityRouteIds.size === 0) {
    clearActiveCityMode();
    return;
  }

  if (Array.isArray(currentGeoJsonLayers)) {
    currentGeoJsonLayers.forEach(l => {
      if (l && map.hasLayer(l)) map.removeLayer(l);
    });
  }
  currentGeoJsonLayers = [];

  updateCityNameDisplayFromActiveCities();
  scheduleVisiblePlaceMarkerRefresh();

  const remainingRouteids = [...new Set([...activeCityRouteIds.values()])];
  await loadRouteLayersForIds(remainingRouteids, window.__activeCityMarker);
}

function clearActiveCityMode() {
  // remove all loaded geojson route layers
  if (Array.isArray(currentGeoJsonLayers)) {
    currentGeoJsonLayers.forEach(l => {
      if (l && map.hasLayer(l)) map.removeLayer(l);
    });
  }
  currentGeoJsonLayers = [];

  removeCityTextLabels();

  // remove all active city place layers
  if (Array.isArray(activeCityKeys)) {
    activeCityKeys.forEach(k => {
      const g = cityLayerGroups[k];
      if (g && map.hasLayer(g)) map.removeLayer(g);
    });
  }
  activeCityKeys = null;
  activeCityRouteIds = new Map();
  activeCityNamesByKey = new Map();

  // also remove old single-city references if you still use them elsewhere
  if (currentCityLayer && map.hasLayer(currentCityLayer)) {
    map.removeLayer(currentCityLayer);
    currentCityLayer = null;
  }
  if (currentGeoJsonLayer && map.hasLayer(currentGeoJsonLayer)) {
    map.removeLayer(currentGeoJsonLayer);
    currentGeoJsonLayer = null;
  }

  // uncheck auto city type checkboxes
  CITY_AUTO_TYPES.forEach(type => {
    const cb = document.getElementById(PLACE_TYPES[type].checkboxId);
    if (!cb) return;
    cb.checked = false;
    cb.dispatchEvent(new Event("change"));
  });

  currentCityName = "Appalachian Trail";
  document.getElementById("city-name-display").innerText = currentCityName;
  scheduleVisiblePlaceMarkerRefresh();
}

// ==================================================
// Feedback: Water Markers
// ==================================================

// --- Water feedback system ---
const waterMarkerIndex = {};     // key -> marker
let pendingWaterFeedback = null; // { key, rating }
const waterInfoIndex = {}; // key -> { name }

// --- Resupply rating system ---
const resupplyMarkerIndex = {};      // key -> marker
let pendingResupplyRating = null;    // { key, rating }
// --- Places rating system (places.csv markers) ---
const placeMarkerIndex = {};     // key -> marker
let pendingPlaceRating = null;   // { key, rating }



// =======================
// Icons
// =======================
var redIcon = L.icon({
    iconUrl: 'icons/resupply_marker.png',
    iconSize: [42, 42],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var tentIcon = L.icon({
    iconUrl: 'icons/tent.png',
    iconSize: [62, 62],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var peakIcon = L.icon({
    iconUrl: 'icons/peak.png',
    iconSize: [62, 62],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var shelterIcon = L.icon({
    iconUrl: 'icons/shelter.png',
    iconSize: [52, 52],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var parkingIcon = L.icon({
    iconUrl: 'icons/parking.png',
    iconSize: [52, 52],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var gapIcon = L.icon({
    iconUrl: 'icons/gap.png',
    iconSize: [52, 52],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var crossingIcon = L.icon({
    iconUrl: 'icons/crossing.png',
    iconSize: [42, 42],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var waterIcon = L.icon({
    iconUrl: 'icons/water.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});


// =======================
// Cluster Groups
// =======================
var waterClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 35,
    disableClusteringAtZoom: 13,
    iconCreateFunction: function(cluster) {

        return L.divIcon({
            html: `<div style="position: relative; width: 32px; height: 32px;">
                        <img src="icons/water.png" style="width: 32px; height: 32px; position: absolute; top: 0; left: 0;" />
                        <div style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; display: flex; justify-content: center; align-items: center; color: black; font-weight: bold; font-size: 12px;">
                            ${cluster.getChildCount()}
                        </div>
                   </div>`,
            className: 'custom-water-cluster',
            iconSize: [32, 32]
        });
    }
});


var roadcrossingClusterGroup = L.markerClusterGroup();


let mainTrailLayer = null; // store reference to the main trail

// Load the GeoJSON file and add it to the map
// =======================
// Data Loading: Trail GeoJSON
// =======================
withAppLoading("Loading map data…", () => fetch('data/at.geojson'))
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            style: { color: '#486ee0' }
        }).addTo(map);

        data.features.forEach(feature => {
            if (feature.geometry.type === "LineString") {
                trailCoordinates.push(...feature.geometry.coordinates);
            } else if (feature.geometry.type === "MultiLineString") {
                feature.geometry.coordinates.forEach(line => {
                    trailCoordinates.push(...line);
                });
            }
        });


    });


// Load mile markers from CSV and add text markers based on zoom level
// =======================
// Data Loading: Mile Markers
// =======================
withAppLoading("Loading map data…", () => fetch('data/mile_markers.csv'))
    .then(response => response.text())
    .then(csvText => {
        var lines = csvText.split('\n');
        for (var i = 1; i < lines.length; i++) {
            var line = lines[i].split(',');
            if (line.length >= 4) {
                var lat = parseFloat(line[0]);
                var lng = parseFloat(line[1]);
                var mile = parseInt(line[3]);
                mileMarkers.push({ mile: mile, lat: lat, lng: lng });
            }
        }


function addTextMarkers() {
  const zoomLevel = map.getZoom();

  // Clear ONLY mile labels (not the whole map)
  mileTextLayer.clearLayers();

  // choose how often to label based on zoom
  let step = 250;
  if (zoomLevel >= 19) step = 1;
  else if (zoomLevel >= 13) step = 1;
  else if (zoomLevel >= 10) step = 5;
  else if (zoomLevel >= 8)  step = 25;
  else if (zoomLevel >= 7)  step = 50;
  else if (zoomLevel >= 6)  step = 100;
  else if (zoomLevel >= 5)  step = 250;

  const b = map.getBounds(); // optional but huge speed boost

  mileMarkers.forEach(marker => {
    if (marker.mile % step !== 0) return;
    if (!b.contains([marker.lat, marker.lng])) return;

    const textMarker = L.divIcon({
      className: 'mile-marker',
      html: `<div style="font-size:${zoomLevel * 2}px;">${marker.mile}</div>`
    });

    L.marker([marker.lat, marker.lng], {
      icon: textMarker,
      interactive: false
    }).addTo(mileTextLayer);
  });
}


        map.on("zoomend", () => {
  addTextMarkers();
});

map.on("moveend", () => {
  addTextMarkers(); // only needed because we’re filtering to bounds
});


 });

function locateUser() {
    requestCurrentPosition({
        onSuccess: function(position) {
            var userLat = position.coords.latitude;
            var userLng = position.coords.longitude;

            // Add a marker to the user's location
            userLocationMarker = L.marker([userLat, userLng]).addTo(map)
                .bindPopup('You are here').openPopup();

            // Center the map on the user's location
            map.setView([userLat, userLng], 13);

            console.log("User's location: ", [userLat, userLng]);
        },
        onError: function(error) {
            console.error("Error getting location: " + error.message);

            if (error?.code === error.PERMISSION_DENIED) {
              showLocationPermissionInstructions();
            }
        },
        onUnavailable: function() {
            console.error("Geolocation is not supported by this browser.");
        }
    });
}
function simulateLocation() {
    var simulatedLat = 34.802779;
    var simulatedLng = -83.644409;

    // Add a marker to the simulated location
    simulatedLocationMarker = L.marker([simulatedLat, simulatedLng]).addTo(map)
        .bindPopup('Simulated location').openPopup();

    map.setView([simulatedLat, simulatedLng], 13);

    console.log("Simulated location: ", [simulatedLat, simulatedLng]);
}
function haversineDistance(coords1, coords2) {
    function toRad(x) {
        return x * Math.PI / 180;
    }

    var lat1 = coords1[0];
    var lon1 = coords1[1];
    var lat2 = coords2[0];
    var lon2 = coords2[1];

    var R = 6371; // Radius of the Earth in kilometers
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;

    return d; // Distance in kilometers
}
function findClosestPoint(coords) {
    var minDistance = Infinity;
    var closestPoint = null;

    trailCoordinates.forEach(function(point) {
        var distance = haversineDistance(coords, [point[1], point[0]]);
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = [point[1], point[0]];
        }
    });

    return closestPoint;
}

function createWaterSubmenuCheckboxes() {
  var waterSubmenu = document.getElementById('water-submenu');
  waterSubmenu.innerHTML = ''; // clear out in case it was not empty

  // For each subtype we found in the CSV
  Object.keys(waterSubtypes).forEach(subtype => {
    // Create a container <label> for the checkbox
    var labelEl = document.createElement('label');
    labelEl.style.display = 'block';  // each checkbox on its own line

    // Create the checkbox input
    var inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    inputEl.checked = true;                // default: checked
    inputEl.id = 'water-subtype-' + subtype;

    // Event listener to show/hide that subtype’s LayerGroup
    inputEl.addEventListener('change', function() {
      if (this.checked) {
        map.addLayer(waterSubtypes[subtype]);
      } else {
        map.removeLayer(waterSubtypes[subtype]);
      }
    });

    // Label text
    var textNode = document.createTextNode(' ' + subtype);

    // Append to the DOM
    labelEl.appendChild(inputEl);
    labelEl.appendChild(textNode);
    waterSubmenu.appendChild(labelEl);
  });
}


// Creates text labels for "resource cities" (resources.csv, Col D = yes)
// City name = Col A (index 0)
// Show flag  = Col D (index 3)
// Lat        = Col M (index 12)
// Lng        = Col N (index 13)
function createResourceCityTextLabels() {
  const layer = L.layerGroup().addTo(map);

  // Minimal CSV line parser (handles commas inside quotes)
  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out.map(s => String(s ?? "").trim());
  }

  // If you already have escapeHtml(), this will use it; otherwise a tiny fallback
  const esc =
    (typeof escapeHtml === "function")
      ? escapeHtml
      : (str) => String(str).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  withAppLoading("Loading map data…", () => fetch("data/resources.csv"))
    .then(r => r.text())
    .then(text => {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) return;

      // Skip header row (assumes resources.csv has a header)
      for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        if (c.length < 14) continue;

        const name = (c[0] || "").trim();              // Col A
        const show = (c[3] || "").trim().toLowerCase(); // Col D
        const lat = parseFloat(c[12]);                  // Col M
        const lng = parseFloat(c[13]);                  // Col N

        if (!name) continue;
        if (show !== "yes") continue;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const icon = L.divIcon({
          className: "resource-city-label",
          iconSize: null,
          iconAnchor: [0, 0],
          html: `
            <div style="
              display:inline-block;
              font-weight:700;
              font-size:14px;
              line-height:18px;
              color:#111;
              background: rgba(255,255,255,0.3);
              border:1px solid #333;
              border-radius:4px;
              padding:4px 8px;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,0.35);
              pointer-events:none;
            ">${esc(name)}</div>
          `
        });

        L.marker([lat, lng], {
          icon,
          interactive: false,
          keyboard: false,
          zIndexOffset: 9000
        }).addTo(layer);
      }
    })
    .catch(err => console.error("createResourceCityTextLabels error:", err));

  return layer; // optional: lets you keep a reference if you ever want to toggle/remove
}
const resourceCityLabelLayer = createResourceCityTextLabels();

function loadAll() {
    fetch('data/resources.csv')
        .then(response => response.text())
        .then(csvText => {
            var lines = csvText.split('\n');
			const sharedResupplyGroups = Object.create(null);

            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].split(',');
                if (line.length >= 3) {
                    var name = line[0];
                    var lat = parseFloat(line[1]);
                    var lng = parseFloat(line[2]);
          var crstype = line[3];
          var disttowat = line[4];
          var beartowat = line[5];
		  let markertype = line[6];            // <-- DECLARE IT
		  markertype = String(markertype || "");
		  markertype = markertype.replace(/\.csv$/, "");
		  markertype = markertype.charAt(0).toUpperCase() + markertype.slice(1);


		if (markertype === "Crossing") {
		  const safeName = escapeHtml(name);
		  const safeMarkerType = escapeHtml(markertype);
		  const safeCrsType = escapeHtml(crstype);

		  const googleMapsHref = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
		  const googleMapsLink = `<a href="${googleMapsHref}" target="_blank" rel="noopener noreferrer">${safeName}</a>`;

		  var crossingMarker = L.marker([lat, lng], { icon: crossingIcon })
			.bindPopup(
			  `${safeMarkerType}<br>${googleMapsLink}<br>${lat.toFixed(6)},${lng.toFixed(6)}<br>${safeCrsType}`
			);

		  roadcrossingClusterGroup.addLayer(crossingMarker);
          registerMarkerLabel(crossingMarker, name);

		  // ✅ index it for nearest-road lookups from Gaps
		  ROAD_CROSSINGS.push({
			lat,
			lng,
			name,
			crstype,
			marker: crossingMarker
		  });
		}



          if (markertype === "Water") {
            let subtype = crstype.trim();
            if (disttowat !== null && disttowat !== "" && disttowat !== undefined) {
              disttowat = disttowat + " yards," + beartowat + " degrees";}


            if (!waterSubtypes[subtype]) {
              waterSubtypes[subtype] = L.layerGroup();
            }

            const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
			waterInfoIndex[key] = { name }; // <-- raw name from CSV (ex: "Stover Creek")


            // build the normal popup, but add "Give feedback" at the bottom
			const safeMarkerType = escapeHtml(markertype);
			const safeName = escapeHtml(name);
			const safeKey = escapeHtml(key);
			const safeCrsType = escapeHtml(crstype);
			const safeDist = escapeHtml(disttowat || "");

			const waterPopup =
			  `${safeMarkerType}<br>` +
			  `${safeName}<br>` +
			  `${safeKey}<br>` +
			  `${safeCrsType}<br>` +
			  `<br><a href="#" class="water-feedback-link" data-water-key="${safeKey}">Give feedback</a>`;


            var waterMarker = L.marker([lat, lng], { icon: waterIcon }).bindPopup(waterPopup);
            registerMarkerLabel(waterMarker, name);

            // index it so the popup click handler can find the marker later
            waterMarkerIndex[key] = waterMarker;


            // Add to both subtype layer and the cluster group
            waterSubtypes[subtype].addLayer(waterMarker);
            waterClusterGroup.addLayer(waterMarker);
          }


          if (markertype === "Shelter"){
			const safeMarkerType = escapeHtml(markertype);
			const safeName = escapeHtml(name);

			const shelterMarker = L.marker([lat, lng], { icon: shelterIcon })
			  .addTo(shelterLayerGroup)
			  .bindPopup(`${safeMarkerType}<br>${safeName}<br>${lat.toFixed(6)},${lng.toFixed(6)}`);
            registerMarkerLabel(shelterMarker, name);

          }
		  if (markertype === "Peak"){
			const safeMarkerType = escapeHtml(markertype);
			const safeName = escapeHtml(name);

			const peakMarker = L.marker([lat, lng], { icon: peakIcon })
			  .addTo(peakLayerGroup)
			  .bindPopup(`${safeName}<br>${lat.toFixed(6)},${lng.toFixed(6)}`);
            registerMarkerLabel(peakMarker, name);

          }
		  if (markertype === "Parking"){
			const safeMarkerType = escapeHtml(markertype);
			const safeName = escapeHtml(name);

			const parkingMarker = L.marker([lat, lng], { icon: parkingIcon })
			  .addTo(parkingLayerGroup)
			  .bindPopup(`${safeMarkerType}<br>${safeName}<br>${lat.toFixed(6)},${lng.toFixed(6)}`);
            registerMarkerLabel(parkingMarker, name);

          }
			if (markertype === "Gap") {
			  const safeName = escapeHtml(name);
			  const latFixed = lat.toFixed(6);
			  const lngFixed = lng.toFixed(6);

			  const gapPopup =
				`${safeName}<br>${latFixed},${lngFixed}` +
				// Slot gets filled on popupopen only if nearest road > 30ft
				`<div class="gap-nearby-road-slot"
					  data-gap-lat="${latFixed}"
					  data-gap-lng="${lngFixed}"
					  style="margin-top:8px;"></div>`;

			  const gapMarker = L.marker([lat, lng], { icon: gapIcon })
				.addTo(gapLayerGroup)
				.bindPopup(gapPopup);
              registerMarkerLabel(gapMarker, name);
			}

	  
          if (markertype === "Resupply") {
			const sharedKey = String(line[14] || "").trim(); // Column O

            var milestotown = line[10];
            var locationinfo = !isNaN(milestotown)
            ? (Math.round(milestotown * 10) / 10).toFixed(1) + " miles"
            : milestotown;

            if (locationinfo === "0.0 miles") {
            locationinfo = "On Trail";
            }
			
			
if (sharedKey !== "") {
  // Make sure bucket is always an array
  if (!Array.isArray(sharedResupplyGroups[sharedKey])) {
    sharedResupplyGroups[sharedKey] = [];
  }

  const _mLat = parseFloat(line[12]); // M
  const _nLng = parseFloat(line[13]); // N

  const labelLat =
    Number.isFinite(_mLat) && _mLat >= -90 && _mLat <= 90 ? _mLat : lat;

  const labelLng =
    Number.isFinite(_nLng) && _nLng >= -180 && _nLng <= 180 ? _nLng : lng;

  // Column P (index 15): marker type ONLY for multi-city resupply popups
  let multiMarkerType = String(line[15] || "").trim(); // P
  multiMarkerType = multiMarkerType.replace(/\.csv$/i, "");
  if (multiMarkerType) {
    multiMarkerType =
      multiMarkerType.charAt(0).toUpperCase() + multiMarkerType.slice(1);
  } else {
    multiMarkerType = "Resupply"; // fallback
  }

  sharedResupplyGroups[sharedKey].push({
    name,
    lat,
    lng,
    locationinfo,
    routeid: parseFloat(line[11]),
    labelLat,
    labelLng,
    multiMarkerType
  });

  continue; // IMPORTANT: stops single-city marker creation
}


            const resKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;

			// var marker = L.marker([lat, lng], { icon: redIcon })
			var marker = L.marker([lat, lng], { icon: redIcon })
			  .addTo(resupplyLayerGroup)
			  .bindPopup(
				`${markertype}<br>` +
				`${name}<br>` +
				`${lat.toFixed(6)},${lng.toFixed(6)}<br>` +
				`${locationinfo}` +
				`<br><a href="#" class="zoom-to-city-link" data-resupply-key="${resKey}">Zoom to city</a>` + // <-- ADD
				`<br><a href="#" class="resupply-rate-link"
   data-resupply-key="${resKey}"
   data-resupply-city="${escapeHtml(name)}">
   Rate this resupply town
</a>
`,
				{ autoClose: false }
			  );


            // index for rating popup
            registerMarkerLabel(marker, name);
            resupplyMarkerIndex[resKey] = marker;

			// NEW: build label marker but DO NOT add it yet (only show in city mode)
			const _mLat = parseFloat(line[12]); // M
			const _nLng = parseFloat(line[13]); // N

			const labelLat =
			  Number.isFinite(_mLat) && _mLat >= -90 && _mLat <= 90 ? _mLat : lat;

			const labelLng =
			  Number.isFinite(_nLng) && _nLng >= -180 && _nLng <= 180 ? _nLng : lng;

			const cityTextIcon = L.divIcon({
			  className: "city-text-label",
			  iconSize: null,
			  iconAnchor: [0, 0],
			  html: `
				<div style="
				  display:inline-flex;
				  align-items:center;
				  gap:6px;
				  font-weight:700;
				  font-size:14px;
				  line-height:18px;
				  color:#111;
				  background: rgba(255, 255, 255, 0.3);
				  border:1px solid #333;
				  border-radius:4px;
				  padding:4px 8px;
				  white-space:nowrap;
				  box-shadow:0 1px 3px rgba(0,0,0,0.35);
				">
				  <span>${escapeHtml(name)}</span>
				  <span
					class="city-label-close"
					data-city-key="${escapeHtml(name.toLowerCase())}"
					style="
					  cursor:pointer;
					  font-weight:900;
					  padding-left:6px;
					  border-left:1px solid #333;
					"
					title="Exit city"
				  >
					✕
				  </span>
				</div>
			  `
			});





			// store it on the resupply marker so click handler can toggle it
			marker.__cityLabel = L.marker([labelLat, labelLng], {
			  icon: cityTextIcon,
			  interactive: true,
			  keyboard: false,
			  zIndexOffset: 10000
			});
			marker.__cityLabel.__cityKey = String(name || "").trim().toLowerCase();


			const routeid = parseFloat(line[11]);
			addMarkerClickHandler(marker, name, routeid);

          }


                }
            }
			            // ✅ AFTER the for-loop finishes, create ONE resupply marker per sharedKey group
            // ✅ AFTER the for-loop finishes, create ONE resupply marker per sharedKey group
		Object.keys(sharedResupplyGroups).forEach(sharedKey => {
		  const entries = sharedResupplyGroups[sharedKey];
		  if (!entries || entries.length === 0) return;

		  const first = entries[0];
		  const lat = first.lat;
		  const lng = first.lng;

		  const resKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;

const citiesHtml = entries.map(e => {
  const safeCity = escapeHtml(e.name);
  const safeInfo = escapeHtml(e.locationinfo || "");

  const zoomLat = Number.isFinite(e.labelLat) ? e.labelLat : e.lat;
  const zoomLng = Number.isFinite(e.labelLng) ? e.labelLng : e.lng;

  return (
    `<div style="margin-bottom:10px;">` +
      `<div style="font-weight:700;">${safeCity}</div>` +
      `<div style="line-height:1.2;">` +
        (safeInfo ? `${safeInfo} ` : ``) +
        `<a href="#" class="zoom-to-city-link"
  data-zoom-lat="${zoomLat}"
  data-zoom-lng="${zoomLng}"
  data-city="${escapeHtml(e.name)}"
  data-routeid="${Number.isFinite(e.routeid) ? e.routeid : ""}">
  Zoom to ${safeCity}
</a>

` +
        ` &nbsp;|&nbsp; ` +
        `<a href="#" class="resupply-rate-link"
  data-resupply-key="${resKey}"
  data-resupply-city="${escapeHtml(e.name)}">
  Rate this town
</a>
` +
      `</div>` +
    `</div>`
  );
}).join("");



const header = escapeHtml(first.multiMarkerType || "Resupply");

const popupHtml =
  `${header}<br><br>` +
  `${citiesHtml}` +
  `<div style="opacity:0.8; font-size:12px;">${resKey}</div>`;




		  const marker = L.marker([lat, lng], { icon: redIcon })
			.addTo(resupplyLayerGroup)
			.bindPopup(popupHtml, { autoClose: false });

		  registerMarkerLabel(marker, entries[0]?.name || "Resupply");
          resupplyMarkerIndex[resKey] = marker;
		  marker.__cityLabels = entries
  .map(e => {
    const llLat = Number.isFinite(e.labelLat) ? e.labelLat : e.lat;
    const llLng = Number.isFinite(e.labelLng) ? e.labelLng : e.lng;
    if (!Number.isFinite(llLat) || !Number.isFinite(llLng)) return null;
    return makeCityLabelMarker(e.name, llLat, llLng, e.name);
  })
  .filter(Boolean);

		  // ✅ make the shared marker behave like a city marker (pick the first city's route)
		  // Pass ALL cities/routeids into the handler
addMarkerClickHandler(marker, entries);

		});


      createWaterSubmenuCheckboxes();
      document.getElementById('water-checkbox').dispatchEvent(new Event('change'));

        });
}
loadAll()
/*loadCityLayerGroups();*/
function findClosestRoadCrossingTo(lat, lng) {
  if (!Array.isArray(ROAD_CROSSINGS) || ROAD_CROSSINGS.length === 0) return null;

  const from = L.latLng(lat, lng);

  let best = null;
  let bestDist = Infinity;

  for (const rc of ROAD_CROSSINGS) {
    if (!Number.isFinite(rc.lat) || !Number.isFinite(rc.lng) || !rc.marker) continue;

    const d = map.distance(from, L.latLng(rc.lat, rc.lng)); // meters
    if (d < bestDist) {
      bestDist = d;
      best = rc;
    }
  }

  if (!best) return null;
  return { ...best, distanceMeters: bestDist };
}

function buildWaterFeedbackPopupHtml(key) {
  return `
   <div class="water-feedback" data-water-key="${key}" style="min-width:220px;">
      <div style="font-weight:700; margin-bottom:6px;">Water feedback</div>

      <div class="water-rating-descriptions" style="font-size:12px; line-height:1.4; margin-bottom:10px;">
        <div data-rating="5"><b>5</b> – good</div>
        <div data-rating="4"><b>4</b> – moderate / low flow, but flowing</div>
        <div data-rating="3"><b>3</b> – little to no flow but deep enough to submerge</div>
        <div data-rating="2"><b>2</b> – no flow but scoopable</div>
        <div data-rating="1"><b>1</b> – very difficult to collect but doable if desperate</div>
        <div data-rating="0"><b>0</b> – no water</div>
      </div>


      <div class="water-feedback-buttons" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        ${[5,4,3,2,1,0].map(n => `
          <button type="button"
            class="water-rating-btn"
            data-rating="${n}"
            style="padding:6px 10px; border:1px solid #999; border-radius:8px; background:#fff; cursor:pointer;">
            ${n}
          </button>
        `).join("")}
      </div>
  <div style="margin-bottom:10px;">
    <div style="font-size:12px; margin-bottom:6px; opacity:0.85;">
    Optional notes
    </div>
    <textarea
    class="water-feedback-text"
    placeholder="Example: flowing but shallow / pipe is buried / muddy / needs scoop..."
    rows="3"
    style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #999; border-radius:10px; resize:vertical;"
    ></textarea>
  </div>
      <button type="button"
        class="water-feedback-submit"
        disabled
        style="width:100%; padding:8px 10px; border-radius:10px; border:0; cursor:not-allowed; opacity:0.6;">
        Submit
      </button>

      <div style="margin-top:8px; font-size:12px;">
        <a href="#" class="water-feedback-cancel">Cancel</a>
      </div>
    </div>
  `;
}

// ===========================
// Resupply rating popup (0–5)
// ===========================
function buildResupplyRatingPopupHtml(key, city) {
  return `
    <div class="resupply-feedback" data-resupply-key="${key}" style="min-width:220px;">
      <div style="font-weight:700; margin-bottom:6px;">Resupply feedback</div>

      <div class="resupply-feedback-buttons" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        ${[5,4,3,2,1,0].map(n => `
          <button type="button"
            class="resupply-rating-btn"
            data-rating="${n}"
            style="padding:6px 10px; border:1px solid #999; border-radius:8px; background:#fff; cursor:pointer;">
            ${n}
          </button>
        `).join("")}
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-size:12px; margin-bottom:6px; opacity:0.85;">
          Optional notes
        </div>
        <textarea
          class="resupply-feedback-text"
          placeholder="Example: great food options / easy hitch / expensive / good hostel / sketchy roadwalk..."
          rows="3"
          style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #999; border-radius:10px; resize:vertical;"
        ></textarea>
      </div>

      <button type="button"
        class="resupply-feedback-submit"
        disabled
        style="width:100%; padding:8px 10px; border-radius:10px; border:0; cursor:not-allowed; opacity:0.6;">
        Submit
      </button>

      <div style="margin-top:8px; font-size:12px;">
        <a href="#" class="resupply-feedback-cancel">Cancel</a>
      </div>
    </div>
  `;
}
function buildPlaceRatingPopupHtml(key) {
  return `
    <div class="place-feedback" data-place-key="${escapeHtml(key)}" style="min-width:220px;">
      <div style="font-weight:700; margin-bottom:6px;">Place feedback</div>

      <div class="place-feedback-buttons" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        ${[5,4,3,2,1,0].map(n => `
          <button type="button"
            class="place-rating-btn"
            data-rating="${n}"
            style="padding:6px 10px; border:1px solid #999; border-radius:8px; background:#fff; cursor:pointer;">
            ${n}
          </button>
        `).join("")}
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-size:12px; margin-bottom:6px; opacity:0.85;">
          Optional notes
        </div>
        <textarea
          class="place-feedback-text"
          placeholder="Example: friendly staff / pricey / great selection..."
          rows="3"
          style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #999; border-radius:10px; resize:vertical;"
        ></textarea>
      </div>

      <button type="button"
        class="place-feedback-submit"
        disabled
        style="width:100%; padding:8px 10px; border-radius:10px; border:0; cursor:not-allowed; opacity:0.6;">
        Submit
      </button>

      <div style="margin-top:8px; font-size:12px;">
        <a href="#" class="place-feedback-cancel">Cancel</a>
      </div>
    </div>
  `;
}

function openPlaceRatingPopup(marker, key) {
  pendingPlaceRating = { key, rating: null };

  L.popup({ closeButton: true, autoClose: false })
    .setLatLng(marker.getLatLng())
    .setContent(buildPlaceRatingPopupHtml(key))
    .openOn(map);
}


function openResupplyRatingPopup(marker, key, city, routeid) {
  pendingResupplyRating = { key, rating: null, city: city || "", routeid };

  L.popup({ closeButton: true, autoClose: false })
    .setLatLng(marker.getLatLng())
    .setContent(buildResupplyRatingPopupHtml(key, city))
    .openOn(map);
}



function openWaterFeedbackPopup(marker, key, waterName) {
  pendingWaterFeedback = { key, rating: null, waterName: waterName || "" };


  L.popup({ closeButton: true, autoClose: false })
    .setLatLng(marker.getLatLng())
    .setContent(buildWaterFeedbackPopupHtml(key))
    .openOn(map);
}


function addMarkerClickHandler(marker, cityOrCities, routeidMaybe) {

  marker.on("click", async function () {

    // Always clear old mode first
    clearActiveCityMode();

    // Normalize input into an array of { city, routeid }
    let cities = [];
    if (Array.isArray(cityOrCities)) {
      cities = cityOrCities
        .map(x => ({
          city: (x.name || x.city || "").trim(),
          routeid: Number(x.routeid)
        }))
        .filter(x => x.city && Number.isFinite(x.routeid));
    } else {
      const city = String(cityOrCities || "").trim();
      const routeid = Number(routeidMaybe);
      if (city && Number.isFinite(routeid)) cities = [{ city, routeid }];
    }

    if (!cities.length) {
      console.warn("No cities/routeids found for marker");
      return;
    }

    activeCityRouteIds = new Map();
    activeCityNamesByKey = new Map();
    cities.forEach(c => {
      const key = c.city.toLowerCase();
      if (!activeCityRouteIds.has(key)) {
        activeCityRouteIds.set(key, c.routeid);
        activeCityNamesByKey.set(key, c.city);
      }
    });
    activeCityKeys = [...activeCityRouteIds.keys()];
    updateCityNameDisplayFromActiveCities();

    // Auto-check + fire place type toggles (now uses activeCityKeys)
    CITY_AUTO_TYPES.forEach(type => {
      const cb = document.getElementById(PLACE_TYPES[type].checkboxId);
      if (!cb) return;
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    });

    // Keep active cities in state only; marker rendering is viewport-cull driven.
    scheduleVisiblePlaceMarkerRefresh();

    // Load ALL routes (unique routeids)
    const routeids = [...new Set([...activeCityRouteIds.values()])];

    try {
      await loadRouteLayersForIds(routeids, marker);
    } catch (err) {
      console.error("Failed loading multi-route GeoJSON:", err);
      map.setView(marker.getLatLng(), 15);
    }

    // City label behavior (keep what you had)
// ✅ City label behavior: single OR multi
if (marker.__cityLabel) {
  if (!resupplyLayerGroup.hasLayer(marker.__cityLabel)) {
    resupplyLayerGroup.addLayer(marker.__cityLabel);
  }
}

if (Array.isArray(marker.__cityLabels)) {
  marker.__cityLabels.forEach(lbl => {
    if (lbl && !resupplyLayerGroup.hasLayer(lbl)) {
      resupplyLayerGroup.addLayer(lbl);
    }
  });
}

    marker.openPopup();
    window.__activeCityMarker = marker;
  });

  marker.on("popupclose", function () {
    if (window.__activeCityMarker === marker) window.__activeCityMarker = null;
  });
}

document.getElementById('locate-btn').addEventListener('click', locateUser);

suggestMarkerBtn?.addEventListener("click", () => {
  requestCurrentLocationForSuggestion();
});

map.getContainer().addEventListener("click", async (e) => {
  if (e.target.closest(".suggest-marker-confirm-btn")) {
    if (!suggestedDraftMarker) {
      alert("Start by clicking 'Suggest a Marker' first.");
      return;
    }

    suggestionMarkerConfirmed = true;
    renderSuggestionPopup(true);
    return;
  }

  if (e.target.closest(".suggest-marker-submit-btn")) {
    if (!suggestedDraftMarker || !suggestionCurrentLocation) {
      alert("Please start a marker suggestion first.");
      return;
    }

    if (!suggestionMarkerConfirmed) {
      alert("Please confirm the marker position before submitting.");
      return;
    }

    if (!suggestionMarkerType) {
      alert("Please select a marker type.");
      return;
    }

    const markerLatLng = suggestedDraftMarker.getLatLng();

    try {
      await saveMarkerSuggestion({
        markerType: suggestionMarkerType,
        currentLocation: {
          lat: suggestionCurrentLocation.lat,
          lng: suggestionCurrentLocation.lng
        },
        suggestedMarkerLocation: {
          lat: markerLatLng.lat,
          lng: markerLatLng.lng
        },
        suggestionDetails: suggestionNotes.trim()
      });

      alert("Thanks! Your marker suggestion has been submitted.");
      resetSuggestionForm();
    } catch (err) {
      console.error("Failed to submit marker suggestion:", err);

      const message =
        err?.code === "permission-denied"
          ? "We couldn't save your suggestion due to a database permissions setting. Please try again shortly."
          : err?.message
            ? `Unable to submit your suggestion right now: ${err.message}`
            : "Unable to submit your suggestion right now. Please try again.";

      alert(message);
      renderSuggestionPopup(true);
    }

    return;
  }

  if (e.target.closest(".suggest-marker-cancel-btn")) {
    resetSuggestionForm();
  }
});

map.getContainer().addEventListener("change", (e) => {
  const typeSelect = e.target.closest(".suggest-marker-type-select");
  if (!typeSelect) return;

  suggestionMarkerType = typeSelect.value || "";
  renderSuggestionPopup(true);
});

map.getContainer().addEventListener("input", (e) => {
  const notesInput = e.target.closest(".suggest-marker-notes-input");
  if (!notesInput) return;

  suggestionNotes = notesInput.value || "";
});

function closeActiveCityLayer() {
  const m = window.__activeCityMarker;
  const cityKey = window.__pendingCityCloseKey || null;
  window.__pendingCityCloseKey = null;

  if (cityKey) {
    closeSpecificCityLayer(cityKey).catch(err => {
      console.error("Failed to close specific city layer:", err);
    });
  } else {
    clearActiveCityMode();
  }

  if (!m) {
    map.closePopup();
    return;
  }

  if (m.getPopup && m.getPopup()) {
    m.closePopup();
    return;
  }

  window.__activeCityMarker = null;
}

// map.getContainer().addEventListener("click", function (e) {
["touchstart", "click"].forEach(evt => {
  map.getContainer().addEventListener(evt, function (e) {
    const closeBtn = e.target.closest(".city-label-close");
    if (!closeBtn) return;

    window.__pendingCityCloseKey = (closeBtn.getAttribute("data-city-key") || "").trim().toLowerCase() || null;

    e.preventDefault();
    e.stopPropagation();

    // iOS Safari may suppress the synthetic click when touchstart is prevented,
    // so close immediately for touch and click.
    closeActiveCityLayer();


  }, { passive: false });
});

function activateCityFromPopup(city, routeid, focusLatLng) {
  const focus = focusLatLng || map.getCenter();

  // Invisible anchor marker ON the map so openPopup/popupclose behavior works
  const tempMarker = L.marker(focus, {
    interactive: false,
    opacity: 0,
    icon: L.divIcon({ className: "", html: "", iconSize: [0, 0] })
  }).addTo(map);

  // EXACT same label format as your single-city labels
  const cityTextIcon = L.divIcon({
    className: "city-text-label",
    iconSize: null,
    iconAnchor: [0, 0],
    html: `
      <div style="
        display:inline-flex;
        align-items:center;
        gap:6px;
        font-weight:700;
        font-size:14px;
        line-height:18px;
        color:#111;
        background: rgba(255, 255, 255, 0.3);
        border:1px solid #333;
        border-radius:4px;
        padding:4px 8px;
        white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,0.35);
      ">
        <span>${escapeHtml(city)}</span>
        <span
          class="city-label-close"
          data-city-key="${escapeHtml(city.toLowerCase())}"
          style="
            cursor:pointer;
            font-weight:900;
            padding-left:6px;
            border-left:1px solid #333;
          "
          title="Exit city"
        >
          ✕
        </span>
      </div>
    `
  });

  tempMarker.__cityLabel = L.marker(focus, {
    icon: cityTextIcon,
    interactive: true,
    keyboard: false,
    zIndexOffset: 10000
  });
  tempMarker.__cityLabel.__cityKey = String(city || "").trim().toLowerCase();

  // Close the shared resupply popup FIRST (so we don't close the new city popup)
  map.closePopup();

  // Trigger your existing city logic
  addMarkerClickHandler(tempMarker, city, routeid);
  tempMarker.fire("click");

  // Cleanup the invisible anchor marker when the city popup closes
  tempMarker.on("popupclose", function () {
    if (map.hasLayer(tempMarker)) map.removeLayer(tempMarker);
  });

  // IMPORTANT: do NOT call map.closePopup() down here
}



// ==================================================
// Event Wiring (Map / UI listeners)
// ==================================================

let lastMouseLatLng = null;
let mouseRaf = 0;

map.on("mousemove", (e) => {
  lastMouseLatLng = e.latlng;
  if (mouseRaf) return;

  mouseRaf = requestAnimationFrame(() => {
    mouseRaf = 0;
    if (!lastMouseLatLng) return;

    const lat = lastMouseLatLng.lat.toFixed(6);
    const lng = lastMouseLatLng.lng.toFixed(6);
    const el = document.getElementById("cursor-coordinates");
    if (el) el.innerText = `${lat},${lng}`;
  });
});

map.on('click', function(e) {
    var lat = e.latlng.lat.toFixed(6);
    var lng = e.latlng.lng.toFixed(6);
    document.getElementById('clicked-coordinates').innerText = `${lat}, ${lng}`;
});
map.on("popupopen", function (e) {
  const root = e.popup.getElement();
  if (!root) return;

// --- GAP: only show "See nearby roads" if nearest road is > 30 ft ---
const gapSlot = root.querySelector(".gap-nearby-road-slot");
if (gapSlot && !gapSlot.__gapBound) {
  gapSlot.__gapBound = true;

  const lat = parseFloat(gapSlot.getAttribute("data-gap-lat"));
  const lng = parseFloat(gapSlot.getAttribute("data-gap-lng"));

  const THRESHOLD_METERS = 30; // 30 ft

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearest = findClosestRoadCrossingTo(lat, lng);

    // Only render the button if we have a nearest crossing AND it's farther than 30 ft
    if (nearest && Number.isFinite(nearest.distanceMeters) && nearest.distanceMeters > THRESHOLD_METERS) {
      const latFixed = lat.toFixed(6);
      const lngFixed = lng.toFixed(6);

      gapSlot.innerHTML = `
        <button type="button"
          class="gap-nearby-road-btn"
          data-gap-lat="${latFixed}"
          data-gap-lng="${lngFixed}"
          style="padding:6px 10px; border:1px solid #999; border-radius:8px; background:#fff; cursor:pointer;">
          See nearby roads
        </button>
      `;
    } else {
      // <= 30 ft (or no road data): show nothing
      gapSlot.innerHTML = "";
    }
  }
}

  // Prevent stacking multiple listeners if popupopen fires again for same DOM
  if (root.__waterFeedbackBound) return;
  root.__waterFeedbackBound = true;

  root.addEventListener("click", async function (ev) {
    const link = ev.target.closest(".water-feedback-link");
	const gapNearbyBtn = ev.target.closest(".gap-nearby-road-btn");

    const ratingBtn = ev.target.closest(".water-rating-btn");
    const submitBtn = ev.target.closest(".water-feedback-submit");
    const cancelLink = ev.target.closest(".water-feedback-cancel");
  const resupplyLink = ev.target.closest(".resupply-rate-link");
  const zoomToCityLink = ev.target.closest(".zoom-to-city-link");
  const resupplyRatingBtn = ev.target.closest(".resupply-rating-btn");
  const resupplySubmitBtn = ev.target.closest(".resupply-feedback-submit");
  const resupplyCancelLink = ev.target.closest(".resupply-feedback-cancel");
  const placeRateLink     = ev.target.closest(".place-rate-link");
const placeRatingBtn    = ev.target.closest(".place-rating-btn");
const placeSubmitBtn    = ev.target.closest(".place-feedback-submit");
const placeCancelLink   = ev.target.closest(".place-feedback-cancel");

if (gapNearbyBtn) {
  ev.preventDefault();

  const lat = parseFloat(gapNearbyBtn.getAttribute("data-gap-lat"));
  const lng = parseFloat(gapNearbyBtn.getAttribute("data-gap-lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const nearest = findClosestRoadCrossingTo(lat, lng);

  if (!nearest || !nearest.marker) {
    e.popup.setContent(`
      <div style="min-width:220px;">
        <div style="font-weight:700; margin-bottom:6px;">Nearby roads</div>
        <div style="font-size:13px;">No road crossings loaded yet.</div>
      </div>
    `);
    return;
  }

  // Ensure crossings layer is visible (optional but helpful)
  const crossingCb = document.getElementById("crossing-checkbox");
  if (crossingCb && !crossingCb.checked) {
    crossingCb.checked = true;
    crossingCb.dispatchEvent(new Event("change"));
  }

  // Zoom to the nearest road crossing and open its popup
  const ll = nearest.marker.getLatLng();
  map.setView(ll, Math.max(map.getZoom(), 15));
  nearest.marker.openPopup();

  return;
}

    // 1) "Give feedback" link from the normal water popup
if (link) {
  ev.preventDefault();
  const key = link.getAttribute("data-water-key");
  const marker = waterMarkerIndex[key];
  if (!marker) return;

  const waterName = waterInfoIndex[key]?.name || "";
  openWaterFeedbackPopup(marker, key, waterName);
  return;
}


    // 2) Rating button 0–5 (allow re-picking)
    if (ratingBtn) {
      ev.preventDefault();

      const rating = parseInt(ratingBtn.getAttribute("data-rating"), 10);
      const container = ratingBtn.closest(".water-feedback");
      if (!container) return;

      // Only one selected at a time
      container.querySelectorAll(".water-rating-btn").forEach(btn => {
        btn.style.background = "#fff";
        btn.style.borderColor = "#999";
        btn.style.fontWeight = "400";
      });

      ratingBtn.style.background = "#e8f0ff";
      ratingBtn.style.borderColor = "#2b63ff";
      ratingBtn.style.fontWeight = "700";

      // Enable submit once a rating is chosen
      const submit = container.querySelector(".water-feedback-submit");
      if (submit) {
        submit.disabled = false;
        submit.style.cursor = "pointer";
        submit.style.opacity = "1";
      }

      if (pendingWaterFeedback) pendingWaterFeedback.rating = rating;
    // Collapse descriptions to only the selected rating
    const descContainer = container.querySelector(".water-rating-descriptions");
    if (descContainer) {
      descContainer.querySelectorAll("div[data-rating]").forEach(row => {
      row.style.display =
        parseInt(row.getAttribute("data-rating"), 10) === rating
        ? "block"
        : "none";
      });
    }

      return;
    }
if (zoomToCityLink) {
  ev.preventDefault();

  const zLat = parseFloat(zoomToCityLink.getAttribute("data-zoom-lat"));
  const zLng = parseFloat(zoomToCityLink.getAttribute("data-zoom-lng"));

  const city = zoomToCityLink.getAttribute("data-city");
  const routeid = parseFloat(zoomToCityLink.getAttribute("data-routeid"));

  // If it's a multi-city link, activate city mode + zoom
  if (city && Number.isFinite(routeid)) {
    const focus = (Number.isFinite(zLat) && Number.isFinite(zLng)) ? L.latLng(zLat, zLng) : null;

    if (focus) map.setView(focus, Math.max(map.getZoom(), 15));

    activateCityFromPopup(city, routeid, focus);
    return;
  }

  // Otherwise fallback to old behavior (single-city markers)
  const key = zoomToCityLink.getAttribute("data-resupply-key");
  const m = resupplyMarkerIndex[key];
  if (!m) return;

  const ll = m.__cityLabel ? m.__cityLabel.getLatLng() : m.getLatLng();
  map.setView(ll, Math.max(map.getZoom(), 15));

  // Optional: if you ALSO want single-city "Zoom to city" to activate city mode:
  // m.fire("click");

  return;
}


if (resupplyLink) {
  ev.preventDefault();

  const key = resupplyLink.getAttribute("data-resupply-key");
  const marker = resupplyMarkerIndex[key];
  if (!marker) return;

  const city = resupplyLink.getAttribute("data-resupply-city") || "";
  const routeidRaw = resupplyLink.getAttribute("data-resupply-routeid");
  const routeid = routeidRaw !== null ? parseFloat(routeidRaw) : NaN;

  openResupplyRatingPopup(marker, key, city, routeid);
  return;
}

  if (resupplyRatingBtn) {
    ev.preventDefault();

    const rating = parseInt(resupplyRatingBtn.getAttribute("data-rating"), 10);
    const container = resupplyRatingBtn.closest(".resupply-feedback");
    if (!container) return;

    container.querySelectorAll(".resupply-rating-btn").forEach(btn => {
    btn.style.background = "#fff";
    btn.style.borderColor = "#999";
    btn.style.fontWeight = "400";
    });

    resupplyRatingBtn.style.background = "#e8f0ff";
    resupplyRatingBtn.style.borderColor = "#2b63ff";
    resupplyRatingBtn.style.fontWeight = "700";

    const submit = container.querySelector(".resupply-feedback-submit");
    if (submit) {
    submit.disabled = false;
    submit.style.cursor = "pointer";
    submit.style.opacity = "1";
    }

    if (pendingResupplyRating) pendingResupplyRating.rating = rating;
    return;
  }
  if (resupplySubmitBtn) {
	  ev.preventDefault();
	  if (!pendingResupplyRating || pendingResupplyRating.rating === null) return;

	  const {
  key,
  rating,
  city: ratedCity,
  routeid: ratedRouteid
} = pendingResupplyRating;


	  const container = resupplySubmitBtn.closest(".resupply-feedback");
	  const notes = container
		? (container.querySelector(".resupply-feedback-text")?.value || "").trim()
		: "";

	  const [latStr, lngStr] = key.split(",");
	  const lat = parseFloat(latStr);
	  const lng = parseFloat(lngStr);

	  try {
const ratedCityDisplay = titleCase(ratedCity);

await saveFeedback({
  kind: "resupply",
  key,
  lat,
  lng,
  rating,
  notes,
  offlineMode: localStorage.getItem("offlineMode") === "true",

  // ✅ store display casing
  resupplyTown: ratedCityDisplay || "",
  placeName: ratedCityDisplay || "",
  placeCity: ratedCityDisplay || ""
});


		e.popup.setContent(`
		  <div style="min-width:220px;">
			<div style="font-weight:700; margin-bottom:6px;">Thanks!</div>
			<div style="font-size:13px;">Saved rating: <b>${rating}</b></div>
			${notes ? `<div style="margin-top:6px; font-size:12px; opacity:0.9;">Notes: ${escapeHtml(notes)}</div>` : ""}
			<div style="margin-top:8px; font-size:12px; opacity:0.8;">(${key})</div>
		  </div>
		`);
	  } catch (err) {
		console.error("Failed to save resupply feedback:", err);
		e.popup.setContent(`
		  <div style="min-width:220px;">
			<div style="font-weight:700; margin-bottom:6px;">Hmm…</div>
			<div style="font-size:13px;">Couldn’t save right now.</div>
			<div style="margin-top:6px; font-size:12px; opacity:0.85;">
			  ${escapeHtml(err?.message || "Unknown error")}
			</div>
		  </div>
		`);
	  }

  pendingResupplyRating = null;
  return;
}


  if (resupplyCancelLink) {
    ev.preventDefault();
    map.closePopup();
    pendingResupplyRating = null;
    return;
  }


if (placeRateLink) {
  ev.preventDefault();
  const key = placeRateLink.getAttribute("data-place-key");
  const marker = placeMarkerIndex[key];
  if (!marker) return;

  openPlaceRatingPopup(marker, key);
  return;
}
if (placeRatingBtn) {
  ev.preventDefault();

  const rating = parseInt(placeRatingBtn.getAttribute("data-rating"), 10);
  const container = placeRatingBtn.closest(".place-feedback");
  if (!container) return;

  container.querySelectorAll(".place-rating-btn").forEach(btn => {
    btn.style.background = "#fff";
    btn.style.borderColor = "#999";
    btn.style.fontWeight = "400";
  });

  placeRatingBtn.style.background = "#e8f0ff";
  placeRatingBtn.style.borderColor = "#2b63ff";
  placeRatingBtn.style.fontWeight = "700";

  const submit = container.querySelector(".place-feedback-submit");
  if (submit) {
    submit.disabled = false;
    submit.style.cursor = "pointer";
    submit.style.opacity = "1";
  }

  if (pendingPlaceRating) pendingPlaceRating.rating = rating;
  return;
}
if (placeSubmitBtn) {
  ev.preventDefault();
  // ev.preventDefault();
console.log("[UI] PLACE submit clicked", pendingPlaceRating);

  if (!pendingPlaceRating || pendingPlaceRating.rating === null) return;

  const { key, rating } = pendingPlaceRating;

  const container = placeSubmitBtn.closest(".place-feedback");
  const notes = container
    ? (container.querySelector(".place-feedback-text")?.value || "").trim()
    : "";

  // parse your key: "lat,lng|type|city|name"
  const [latlng, type, cityKey, cityDisplay, name] = key.split("|");

  const [latStr, lngStr] = latlng.split(",");
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  try {
    await saveFeedback({
      kind: "place",
      key,
      lat,
      lng,
      rating,
      notes,
      placeType: type || "",
      placeCity: (cityDisplay || "") || "",

      placeName: name || "",
      city: currentCityName || "Appalachian Trail",
      offlineMode: localStorage.getItem("offlineMode") === "true"
    });

    e.popup.setContent(`
      <div style="min-width:220px;">
        <div style="font-weight:700; margin-bottom:6px;">Thanks!</div>
        <div style="font-size:13px;">Saved rating: <b>${rating}</b></div>
        ${notes ? `<div style="margin-top:6px; font-size:12px; opacity:0.9;">Notes: ${escapeHtml(notes)}</div>` : ""}
        <div style="margin-top:8px; font-size:12px; opacity:0.8;">(${escapeHtml(key)})</div>
      </div>
    `);
  } catch (err) {
    console.error("Failed to save place feedback:", err);
    e.popup.setContent(`
      <div style="min-width:220px;">
        <div style="font-weight:700; margin-bottom:6px;">Couldn’t save</div>
        <div style="font-size:12px; opacity:0.85;">
          ${escapeHtml(err?.message || "Unknown error")}
        </div>
      </div>
    `);
  }

  pendingPlaceRating = null;
  return;
}
if (placeCancelLink) {
  ev.preventDefault();
  map.closePopup();
  pendingPlaceRating = null;
  return;
}


    // 3) Submit feedback
    if (submitBtn) {
	  ev.preventDefault();
	  // ev.preventDefault();
console.log("[UI] WATER submit clicked", pendingWaterFeedback);


	  if (!pendingWaterFeedback || pendingWaterFeedback.rating === null) return;

	  const { key, rating, waterName } = pendingWaterFeedback;


	  const container = submitBtn.closest(".water-feedback");
	  const notes = container
		? (container.querySelector(".water-feedback-text")?.value || "").trim()
		: "";

	  // parse lat/lng from key "lat,lng"
	  const [latStr, lngStr] = key.split(",");
	  const lat = parseFloat(latStr);
	  const lng = parseFloat(lngStr);

	  try {
		await saveFeedback({
  kind: "water",
  key,
  lat,
  lng,
  rating,
  notes,

  waterName: waterName || "",

  // ✅ so your account page shows a name (same field used by places)
  placeName: waterName || "",

  city: currentCityName || "Appalachian Trail",
  offlineMode: localStorage.getItem("offlineMode") === "true"
});


		e.popup.setContent(`
		  <div style="min-width:220px;">
			<div style="font-weight:700; margin-bottom:6px;">Thanks!</div>
			<div style="font-size:13px;">Saved rating: <b>${rating}</b></div>
			${notes ? `<div style="margin-top:6px; font-size:12px; opacity:0.9;">Notes: ${escapeHtml(notes)}</div>` : ""}
			<div style="margin-top:8px; font-size:12px; opacity:0.8;">(${escapeHtml(key)})</div>
		  </div>
		`);

	  } catch (err) {
		console.error("Failed to save water feedback:", err);

		e.popup.setContent(`
		  <div style="min-width:220px;">
			<div style="font-weight:700; margin-bottom:6px;">Couldn’t save</div>
			<div style="font-size:12px; opacity:0.85;">
			  ${escapeHtml(err?.message || "Unknown error")}
			</div>
		  </div>
		`);
	  }

	  pendingWaterFeedback = null;
	  return;
	}


    // 4) Cancel
    if (cancelLink) {
      ev.preventDefault();
      map.closePopup();
      pendingWaterFeedback = null;
      return;
    }
  });
});

function updateMapBasedOnMileMarkers() {
    var inputValue1 = parseInt(document.getElementById('number-input-1').value, 10);
    var inputValue2 = parseInt(document.getElementById('number-input-2').value, 10);

    if (!Number.isInteger(inputValue1)) return;

    var marker1 = mileMarkers.find(marker => marker.mile === inputValue1);
    var hasValidEndMile = Number.isInteger(inputValue2) && inputValue2 >= inputValue1;
    var marker2 = hasValidEndMile
        ? mileMarkers.find(marker => marker.mile === inputValue2)
        : null;

    if (marker1 && marker2) {
        var bounds = L.latLngBounds([marker1.lat, marker1.lng], [marker2.lat, marker2.lng]);
        mileMarkers.forEach(marker => {
            if (marker.mile > Math.min(inputValue1, inputValue2) && marker.mile < Math.max(inputValue1, inputValue2)) {
                bounds.extend([marker.lat, marker.lng]);
            }
        });
        map.fitBounds(bounds);
    } else if (marker1) {
        map.setView([marker1.lat, marker1.lng], 13);
    }
}

document.getElementById('mile-range-go-btn').addEventListener('click', updateMapBasedOnMileMarkers);

document.getElementById('shelter-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(shelterLayerGroup);
    } else {
        map.removeLayer(shelterLayerGroup);
    }
});
document.getElementById('parking-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(parkingLayerGroup);
    } else {
        map.removeLayer(parkingLayerGroup);
    }
});
document.getElementById('gap-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(gapLayerGroup);
    } else {
        map.removeLayer(gapLayerGroup);
    }
});
document.getElementById('peak-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(peakLayerGroup);
    } else {
        map.removeLayer(peakLayerGroup);
    }
});
//january updated
document.getElementById('water-checkbox').addEventListener('change', function () {
    var waterIsChecked = this.checked;

    // Toggle visibility of water layers based on the main checkbox
    if (waterIsChecked) {
        // Add the water cluster group
        map.addLayer(waterClusterGroup);

        // Remove individual markers (ensure clusters are displayed)
        for (var subtype in waterSubtypes) {
            map.removeLayer(waterSubtypes[subtype]);
        }
    } else {
        // Remove both clusters and individual markers
        map.removeLayer(waterClusterGroup);
        for (var subtype in waterSubtypes) {
            map.removeLayer(waterSubtypes[subtype]);
        }
    }

    // Automatically uncheck/check all sub-water type checkboxes
    Object.keys(waterSubtypes).forEach(subtype => {
        var subtypeCheckbox = document.getElementById('water-subtype-' + subtype);
        if (subtypeCheckbox) {
            subtypeCheckbox.checked = waterIsChecked;
        }
    });
});

// Subtype checkboxes behavior
Object.keys(waterSubtypes).forEach(subtype => {
    var subtypeCheckbox = document.getElementById('water-subtype-' + subtype);
    if (!subtypeCheckbox) return;

    subtypeCheckbox.addEventListener('change', function () {
        // Ensure clusters remain the primary display mechanism
        if (this.checked) {
            map.addLayer(waterClusterGroup);
            map.removeLayer(waterSubtypes[subtype]); // Hide individual markers for this subtype
        } else {
            // Remove individual markers for this subtype
            map.removeLayer(waterSubtypes[subtype]);
        }

        // If all subtypes are unchecked, uncheck the main checkbox
        if (!Object.keys(waterSubtypes).some(subtype => {
            var checkbox = document.getElementById('water-subtype-' + subtype);
            return checkbox && checkbox.checked;
        })) {
            document.getElementById('water-checkbox').checked = false;
            map.removeLayer(waterClusterGroup);
        }
    });
});

document.getElementById('resupply-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(resupplyLayerGroup);
    } else {
        map.removeLayer(resupplyLayerGroup);
        if (currentRoutingControl) {
            map.removeControl(currentRoutingControl);
            currentRoutingControl = null;
        }
    }
});
function areCoordinatesClose(coord1, coord2, tolerance = 0.0001) {
    return Math.abs(coord1[0] - coord2[0]) < tolerance && Math.abs(coord1[1] - coord2[1]) < tolerance;
}

const placeLayers = {};
const allPlaceMarkersByType = {};
const placeTypeEnabled = {};
const PLACE_VIEWPORT_PADDING = 0.2;

Object.keys(PLACE_TYPES).forEach(type => {
  placeLayers[type] = L.layerGroup();
  allPlaceMarkersByType[type] = [];
  placeTypeEnabled[type] = false;
});

function refreshVisiblePlaceMarkers() {
  const bounds = map.getBounds().pad(PLACE_VIEWPORT_PADDING);
  const cityFilter = Array.isArray(activeCityKeys) && activeCityKeys.length > 0
    ? new Set(activeCityKeys)
    : null;
  const activeCityCount = cityFilter ? cityFilter.size : 0;
  const shouldDedupeAcrossCities = !cityFilter || activeCityCount > 1;

  Object.keys(PLACE_TYPES).forEach(type => {
    const layer = placeLayers[type];
    layer.clearLayers();

    if (!placeTypeEnabled[type]) return;

    const markers = allPlaceMarkersByType[type] || [];
    const seenPlaceDedupeKeys = shouldDedupeAcrossCities ? new Set() : null;

    markers.forEach(marker => {
      if (cityFilter && !cityFilter.has(marker.__placeCity)) return;
      const ll = marker.getLatLng?.();
      if (!ll || !bounds.contains(ll)) return;

      if (seenPlaceDedupeKeys) {
        const dedupeKey = marker.__placeDedupeKey;
        if (dedupeKey && seenPlaceDedupeKeys.has(dedupeKey)) return;
        if (dedupeKey) seenPlaceDedupeKeys.add(dedupeKey);
      }

      layer.addLayer(marker);
    });
  });
}

let refreshVisiblePlaceMarkersTimer = null;
function scheduleVisiblePlaceMarkerRefresh() {
  clearTimeout(refreshVisiblePlaceMarkersTimer);
  refreshVisiblePlaceMarkersTimer = setTimeout(refreshVisiblePlaceMarkers, 60);
}
function makeCityLabelMarker(cityName, lat, lng, cityKey) {
  const resolvedCityKey = (cityKey || cityName || "").trim().toLowerCase();
  const cityTextIcon = L.divIcon({
    className: "city-text-label",
    iconSize: null,
    iconAnchor: [0, 0],
    html: `
      <div style="
        display:inline-flex;
        align-items:center;
        gap:6px;
        font-weight:700;
        font-size:14px;
        line-height:18px;
        color:#111;
        background: rgba(255, 255, 255, 0.3);
        border:1px solid #333;
        border-radius:4px;
        padding:4px 8px;
        white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,0.35);
      ">
        <span>${escapeHtml(cityName)}</span>
        <span
          class="city-label-close"
          data-city-key="${escapeHtml(resolvedCityKey)}"
          style="
            cursor:pointer;
            font-weight:900;
            padding-left:6px;
            border-left:1px solid #333;
          "
          title="Exit city"
        >✕</span>
      </div>
    `
  });

  const marker = L.marker([lat, lng], {
    icon: cityTextIcon,
    interactive: true,
    keyboard: false,
    zIndexOffset: 10000
  });

  marker.__cityKey = resolvedCityKey;
  return marker;
}

function buildGoogleMapsUrl(raw) {
  if (!raw) return null;

  const normalized = raw.trim();
  if (!normalized) return null;

  const extractPlaceId = value => {
    const placeIdMatch = value.match(/place_id:([^&\s]+)/i);
    if (placeIdMatch && placeIdMatch[1]) return placeIdMatch[1].trim();
    return null;
  };

  const placeIdFromRaw = extractPlaceId(normalized);
  if (placeIdFromRaw) {
    return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeIdFromRaw)}`;
  }

  if (normalized.startsWith("http")) {
    try {
      const parsed = new URL(normalized);
      const qValue = parsed.searchParams.get("q") || parsed.searchParams.get("query");
      const placeIdFromQuery = qValue ? extractPlaceId(qValue) : null;
      if (placeIdFromQuery) {
        return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeIdFromQuery)}`;
      }
    } catch (_) {
      // fall through to returning the original value
    }
    return normalized;
  }

  // if it looks like "place_id:XXXX"
  if (normalized.includes(":")) {
    const placeId = normalized.split(":")[1];
    return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return normalized;
}
function isHumanMarkerClick(e) {
  // Leaflet sets e.originalEvent for real DOM interactions (mouse/touch)
  // Programmatic marker.fire("click") will NOT have originalEvent.
  return !!(e && e.originalEvent && e.originalEvent.isTrusted !== false);
}


function loadPlacesAndCityGroups() {
  function normalizePlaceType(raw) {
    const t = (raw || "").trim().toLowerCase();
    const map = {
    "post office": "postoffice",
    "postoffice": "postoffice"
    };
    return map[t] || t;
  }

  return fetch("data/places.csv")
    .then(r => r.text())
    .then(csvText => {
      const lines = csvText.split("\n");

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 7) continue;

        const name = (cols[0] || "").trim();
        const lat = parseFloat(cols[1]);
        const lng = parseFloat(cols[2]);
    const type = normalizePlaceType(cols[3]);
        const cityDisplay = (cols[6] || "").trim();        // what humans see
const cityKey = cityDisplay.toLowerCase();         // what code uses

        const rawMaps = cols[8]; // you used column I earlier
        const mapsUrl = buildGoogleMapsUrl(rawMaps);

        if (!name || Number.isNaN(lat) || Number.isNaN(lng)) continue;
        if (!PLACE_TYPES[type]) continue; // ignore unknown types safely

        // ensure city group exists
        if (cityKey) {
  if (!cityLayerGroups[cityKey]) cityLayerGroups[cityKey] = L.layerGroup();
}


        // use the icon from config
        const icon = L.icon({
          iconUrl: PLACE_TYPES[type].icon,
          iconSize: [55, 55],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32],
        });

		const safeName = escapeHtml(name);
		const safeCity = escapeHtml(cityDisplay);

		const safeLabel = escapeHtml(PLACE_TYPES[type].label);

		const safeMapsUrl = mapsUrl ? encodeURI(mapsUrl) : null;

		// create a stable key for this place marker
const placeKey = `${lat.toFixed(6)},${lng.toFixed(6)}|${type}|${cityKey}|${cityDisplay}|${name}`;



		// escape key for attribute safety
		const safeKey = escapeHtml(placeKey);

		// USE EXISTING safeName / safeCity / safeLabel
		const popup =
		  `${safeName}<br>${safeCity}<br>${safeLabel}<br>` +
		  (safeMapsUrl ? `<a href="${safeMapsUrl}" target="_blank" rel="noopener noreferrer">View on Google Maps</a><br>` : "") +
		  `<a href="#" class="place-rate-link" data-place-key="${safeKey}">Rate this place</a>`;

		const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
        registerMarkerLabel(marker, name);
		// Remove Leaflet's default "click opens popup" (this is what simulated clicks trigger)
marker.off("click", marker._openPopup, marker);

// Only open popup on real user click/tap
marker.on("click", function (e) {
  if (!isHumanMarkerClick(e)) return;
  marker.openPopup();
});


		// index it so popup click handler can find the marker later
		placeMarkerIndex[placeKey] = marker;


		
		// Add ONLY places.csv markers to spiderfier
		if (placesOms) placesOms.addMarker(marker);

        // tag marker so we can toggle by type without iconUrl string checks
        marker.__placeType = type;
        marker.__placeCity = cityKey;
marker.__placeCityDisplay = cityDisplay;
        marker.__placeDedupeKey = `${name.toLowerCase()}|${lat.toFixed(6)},${lng.toFixed(6)}`;


        // store marker by type; viewport culling decides what to render
        allPlaceMarkersByType[type].push(marker);

        // add to city group
if (cityKey && cityLayerGroups[cityKey]) {
  cityLayerGroups[cityKey].addLayer(marker);
}

      }
      scheduleVisiblePlaceMarkerRefresh();
    })
    .catch(err => console.error("Error loading places.csv:", err));
}

// replace BOTH of your calls:
withAppLoading("Loading map data…", () => loadPlacesAndCityGroups());
// ===== Auto spiderfy settings =====
const AUTO_SPIDERFY_ZOOM   = 15;
const AUTO_SPIDERFY_PX     = 6;   // match nearbyDistance
const AUTO_SPIDERFY_METERS = 3;   // only spiderfy if basically same coords

let autoSpiderfyEnabled = true;



function autoSpiderfyVisibleOverlaps(reason = "unknown") {
  if (!placesOms || !autoSpiderfyEnabled) return;

  // zoom rule: below threshold -> always collapse
  if (map.getZoom() < AUTO_SPIDERFY_ZOOM) {
    placesOms.unspiderfy();
    return;
  }
   if (isPlacesSpiderfied) return;

  // KEY FIX:
  // If this was triggered by a PAN (moveend) and we're already spiderfied,
  // do nothing. Otherwise you'll "toggle" every pan.
  if (reason === "move" && isPlacesSpiderfied) {
    return;
  }

  const markers = placesOms.getMarkers();
  const b = map.getBounds();

  const inView = markers.filter(m => {
    const ll = m.getLatLng?.();
    return ll && b.contains(ll) && map.hasLayer(m);
  });

  // If already spiderfied and we're here because of zoom,
  // we want to recompute overlap based on ORIGINAL positions, not the spiderfied layout.
  // Easiest safe approach: temporarily unspiderfy before testing overlaps on zoomend.


  for (let i = 0; i < inView.length; i++) {
    const a = inView[i];
    const pa = map.latLngToLayerPoint(a.getLatLng());

    const overlap = [a];
    for (let j = i + 1; j < inView.length; j++) {
      const c = inView[j];
      const pc = map.latLngToLayerPoint(c.getLatLng());
	const dx = pa.x - pc.x;
	const dy = pa.y - pc.y;
	const pxDist = Math.sqrt(dx * dx + dy * dy);

	const meterDist = map.distance(a.getLatLng(), c.getLatLng()); // meters

	if (pxDist <= AUTO_SPIDERFY_PX && meterDist <= AUTO_SPIDERFY_METERS) {
	  overlap.push(c);
	}

    }

    if (overlap.length > 1) {
      placesOms.unspiderfy();

      setTimeout(() => {
        a.fire("click"); // spiders the overlapping group
      }, 0);

      return;
    }
  }

  // IMPORTANT CHANGE:
  // Do NOT auto-collapse just because you didn't find overlaps.
  // That was the "every other pan" bug.
  // Only collapse when zoom < threshold (handled above).
}

// debounce so it doesn’t thrash while zooming/panning
let autoSpiderfyTimer = null;
function scheduleAutoSpiderfy(reason) {
  clearTimeout(autoSpiderfyTimer);
  autoSpiderfyTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => autoSpiderfyVisibleOverlaps(reason));
    });
  }, 50);
}



map.on("zoomend", () => scheduleAutoSpiderfy("zoom"));
map.on("moveend", () => scheduleAutoSpiderfy("move"));
map.on("zoomend", scheduleVisiblePlaceMarkerRefresh);
map.on("moveend", scheduleVisiblePlaceMarkerRefresh);



function togglePlaceType(type, checked) {
  const layer = placeLayers[type];
  placeTypeEnabled[type] = !!checked;

  if (checked) map.addLayer(layer);
  else map.removeLayer(layer);

  scheduleVisiblePlaceMarkerRefresh();
}


function wirePlaceTypeCheckboxes() {
  Object.keys(PLACE_TYPES).forEach(type => {
    const id = PLACE_TYPES[type].checkboxId;
    const cb = document.getElementById(id);
    if (!cb) return;

    cb.addEventListener("change", function () {
      togglePlaceType(type, this.checked);
    });
  });

  // OPTIONAL: if you must keep shuttle1-checkbox, alias it:
  const shuttle1 = document.getElementById("shuttle1-checkbox");
  const shuttleMain = document.getElementById(PLACE_TYPES.shuttle.checkboxId);
  if (shuttle1 && shuttleMain) {
    shuttle1.addEventListener("change", function () {
      // keep both checkboxes in sync
      shuttleMain.checked = this.checked;
      shuttleMain.dispatchEvent(new Event("change"));
    });
  }
}

wirePlaceTypeCheckboxes();

// 11-29 update
document.getElementById('crossing-checkbox').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(roadcrossingClusterGroup);
    } else {
        map.removeLayer(roadcrossingClusterGroup);
    }
});


roadcrossingClusterGroup.on('clusterclick', function (e) {
    // Get all markers in the clicked cluster
    var markers = e.layer.getAllChildMarkers();

    // Check if the total marker count is less than 40
    if (markers.length < 40) {
        // Extract road names (second line of popup content) and remove duplicates
        var roadNames = markers.map(marker => {
            var popupContent = marker.getPopup().getContent();
            var lines = popupContent.split('<br>');
            return lines[1].trim(); // Name is on the second line
        });

        // Remove duplicate names
        var uniqueRoadNames = [...new Set(roadNames)];

        // Wait for the map to finish zooming before showing the popup
        map.once('zoomend', function () {
            // Display the names
            if (uniqueRoadNames.length > 0) {
                var nameList = uniqueRoadNames.join('<br>');
                L.popup()
                    .setLatLng(e.latlng) // Use the original cluster click position
                    .setContent(`<b>Roads in this cluster:</b><br>${nameList}`)
                    .openOn(map);
            }
        });

        // Trigger zoom to cluster bounds
        e.layer.zoomToBounds();
    }
});


console.log('Checking if serviceWorker is supported in this browser...');

if ('serviceWorker' in navigator) {
  console.log('Service Worker is supported! Attempting to register...');

  navigator.serviceWorker.register('service-worker.js')
    .then(registration => {
      console.log('Service Worker registered successfully with scope:', registration.scope);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
} else {
  console.error('Service Worker is NOT supported in this browser.');
}

console.log('Service Worker registration script has run.');
