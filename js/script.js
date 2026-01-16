import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =======================
// Firebase Init + saveFeedback
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs",
  authDomain: "at-map-tmc.firebaseapp.com",
  projectId: "at-map-tmc",
  storageBucket: "at-map-tmc.firebasestorage.app",
  messagingSenderId: "862190385314",
  appId: "1:862190385314:web:f7fbf6a9eed1061231fffb",
  measurementId: "G-90GYNPFF82"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

// Ensure signed-in user has a profile doc w/ username (REQUIRED)
async function ensureUserProfile() {

  // if (!auth.currentUser) {
  if (!auth.currentUser) {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google sign-in failed:", err);
      alert(`Google sign-in failed: ${err?.code || ""}\n${err?.message || err}`);
      throw err;
    }
  }


  const u = auth.currentUser;
  const userRef = doc(db, "users", u.uid);
  // const snap = await getDoc(userRef);
let snap;
try {
  snap = await getDoc(userRef);
} catch (err) {
  console.error("FAILED getDoc(users/{uid})", err);
  throw err;
}


  // If username doesn't exist yet, force them to create it
  if (!snap.exists() || !snap.data()?.username) {
    let username = "";

    while (true) {
      username = (window.prompt("Create a username (required to submit feedback):") || "").trim();

      // cancel/blank = not allowed
      if (!username) {
        await signOut(auth);
        throw new Error("Username required. Please sign in again and create a username.");
      }

      if (username.length < 3) continue;
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) continue;

      break;
    }

try {
  await setDoc(userRef, {
    uid: u.uid,
    username,
    email: u.email || "",
    displayName: u.displayName || "",
    photoURL: u.photoURL || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
} catch (err) {
  console.error("FAILED setDoc(users/{uid})", err);
  throw err;
}


    return { uid: u.uid, username, email: u.email || "" };
  }

  // Existing user: reuse
  return {
    uid: u.uid,
    username: snap.data().username,
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
document.getElementById("account-btn")?.addEventListener("click", async () => {
  // OPTIONAL: force sign-in before going to account page
  try {
    await ensureUserProfile();
    window.location.href = "account.html";
  } catch (e) {
    console.error(e);
  }
});




// =======================
// UI: Sidebar & Mode Toggle
// =======================
// Toggle sidebar
const menuToggle = document.getElementById("menu-toggle");
const sidebar = document.getElementById("sidebar");

menuToggle.addEventListener("click", function () {

  sidebar.classList.toggle("open");
});

// Get reference to the toggle button
const toggleButton = document.getElementById('toggle-leaflet');

// Function to update button text based on mode
function updateToggleButtonText() {
  const offlineMode = localStorage.getItem('offlineMode') === 'true';
  toggleButton.innerText = offlineMode ? 'Switch to Online Mode' : 'Switch to Offline Mode';
}

// Update text on initial load
updateToggleButtonText();

// Add event listener to toggle mode and update the display
toggleButton.addEventListener('click', function(){
  const offlineMode = localStorage.getItem('offlineMode') === 'true';
  localStorage.setItem('offlineMode', (!offlineMode).toString());
  // Reload page to reinitialize with new library references
  location.reload();
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
var trailCoordinates = [];
var mileMarkers = [];
var userLocationMarker;
var simulatedLocationMarker;
var currentGeoJsonLayer = null; // Variable to store the currently displayed GeoJSON layer
var currentRoutingControl = null;
var shelterLayerGroup = L.layerGroup();
var waterLayerGroup = L.layerGroup();
var waterSubtypes = {};
var resupplyLayerGroup = L.layerGroup().addTo(map);
var intersectionsLayerGroup = L.layerGroup().addTo(map);
var cityLayerGroups = {};

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
var shelterIcon = L.icon({
    iconUrl: 'icons/shelter.png',
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
    iconSize: [62, 62],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});


// =======================
// Cluster Groups
// =======================
var waterClusterGroup = L.markerClusterGroup({
    iconCreateFunction: function(cluster) {

        return L.divIcon({
            html: `<div style="position: relative; width: 32px; height: 32px;">
                        <img src="icons/water.png" style="width: 32px; height: 32px; position: absolute; top: 0; left: 0;" />
                        <div style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; display: flex; justify-content: center; align-items: center; color: black; font-weight: bold; font-size: 12px;">
                            ${cluster.getChildCount()}
                        </div>
                   </div>`,
            className: 'custom-water-cluster',
            iconSize: [100, 100]
        });
    }
});


var roadcrossingClusterGroup = L.markerClusterGroup();


let mainTrailLayer = null; // store reference to the main trail

// Load the GeoJSON file and add it to the map
// =======================
// Data Loading: Trail GeoJSON
// =======================
fetch('data/at.geojson')
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
fetch('data/mile_markers.csv')
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
            var zoomLevel = map.getZoom();
            mileMarkers.forEach(marker => {
                var textMarker = L.divIcon({
                    className: 'mile-marker',
                    html: `<div style="font-size: ${zoomLevel * 2}px; color: blue;">${marker.mile}</div>`
                });

                if ((zoomLevel >= 19) ||
                    (zoomLevel >= 13 && marker.mile % 1 === 0) ||
                    (zoomLevel >= 10 && marker.mile % 5 === 0) ||
                    (zoomLevel >= 8 && marker.mile % 25 === 0) ||
                    (zoomLevel >= 7 && marker.mile % 50 === 0) ||
                    (zoomLevel >= 6 && marker.mile % 100 === 0) ||
                    (zoomLevel >= 5 && marker.mile % 250 === 0)) {
                    L.marker([marker.lat, marker.lng], { icon: textMarker }).addTo(map);
                }
            });

            // Re-add user and simulated location markers if they exist
            if (userLocationMarker) userLocationMarker.addTo(map);
            if (simulatedLocationMarker) simulatedLocationMarker.addTo(map);
        }

        map.on('zoomend', function () {
    // Clear existing markers except for specific groups and markers
    map.eachLayer(function (layer) {

    // if (layer === mainTrailLayer) return;
    if (roadcrossingClusterGroup.hasLayer(layer)) return;
    if (waterClusterGroup.hasLayer(layer)) return;
    var isWaterSubtype = Object.values(waterSubtypes).some(function(subtypeGroup) {
            return subtypeGroup.hasLayer(layer);
        });

    if (isWaterSubtype) return; // Skip clearing water subtypes


        // Remove markers that are not part of specific groups or special markers
    function isPlaceLayerMarker(layer) {
      // placeLayers is your new system (LayerGroups keyed by type)
      return Object.values(placeLayers).some(g => g && g.hasLayer(layer));
    }


    // Remove markers that are not part of specific groups or special markers
    if (layer instanceof L.Marker) {
      const keep =
      shelterLayerGroup.hasLayer(layer) ||
      waterLayerGroup.hasLayer(layer) ||
      isWaterSubtype ||
      resupplyLayerGroup.hasLayer(layer) ||
      isPlaceLayerMarker(layer) ||
      Object.values(cityLayerGroups).some(group => group.hasLayer(layer)) ||
      layer === userLocationMarker ||
      layer === simulatedLocationMarker;

      if (!keep) {
      map.removeLayer(layer);
      }
    }

    });

    // Add markers dynamically based on the current zoom level
    addTextMarkers();


    // Adjust map layout
    map.invalidateSize();
});

 });

function locateUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            var userLat = position.coords.latitude;
            var userLng = position.coords.longitude;

            // Add a marker to the user's location
            userLocationMarker = L.marker([userLat, userLng]).addTo(map)
                .bindPopup('You are here').openPopup();

            // Center the map on the user's location
            map.setView([userLat, userLng], 13);

            console.log("User's location: ", [userLat, userLng]);
        }, function(error) {
            console.error("Error getting location: " + error.message);
        });
    } else {
        console.error("Geolocation is not supported by this browser.");
    }
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
			  `${safeDist}` +
			  `<br><a href="#" class="water-feedback-link" data-water-key="${safeKey}">Give feedback</a>`;


            var waterMarker = L.marker([lat, lng], { icon: waterIcon }).bindPopup(waterPopup);

            // index it so the popup click handler can find the marker later
            waterMarkerIndex[key] = waterMarker;


            // Add to both subtype layer and the cluster group
            waterSubtypes[subtype].addLayer(waterMarker);
            waterClusterGroup.addLayer(waterMarker);
          }


          if (markertype === "Shelter"){
			const safeMarkerType = escapeHtml(markertype);
			const safeName = escapeHtml(name);

			L.marker([lat, lng], { icon: shelterIcon })
			  .addTo(shelterLayerGroup)
			  .bindPopup(`${safeMarkerType}<br>${safeName}<br>${lat.toFixed(6)},${lng.toFixed(6)}`);

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
  data-city="${escapeHtml(e.name)}">
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

		  resupplyMarkerIndex[resKey] = marker;

		  // ✅ make the shared marker behave like a city marker (pick the first city's route)
		  const routeid = entries[0].routeid;
		  addMarkerClickHandler(marker, entries[0].name, routeid);
		});


      createWaterSubmenuCheckboxes();
      document.getElementById('water-checkbox').dispatchEvent(new Event('change'));

        });
}
loadAll()
/*loadCityLayerGroups();*/

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


function addMarkerClickHandler(marker, city, routeid) {
    marker.on('click', function() {
        console.log('Marker clicked for city:', city, 'with routeid:', routeid);

        // Update city name display and set currentCityName
        currentCityName = city.charAt(0).toUpperCase() + city.slice(1);
        document.getElementById('city-name-display').innerText = currentCityName;

        // Remove global layers if they are on the map
    Object.keys(PLACE_TYPES).forEach(type => {
      const layer = placeLayers[type];
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });


        // Remove the current GeoJSON layer if it exists
        if (currentGeoJsonLayer) {
            map.removeLayer(currentGeoJsonLayer);
            currentGeoJsonLayer = null;
        }

        // Programmatically check the checkboxes and dispatch the 'change' event
    CITY_AUTO_TYPES.forEach(type => {
      const cb = document.getElementById(PLACE_TYPES[type].checkboxId);
      if (!cb) return;
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    });
	scheduleAutoSpiderfy(); // <-- ADD THIS HERE TOO


        // Fetch and display the city's GeoJSON route
        fetch('data/' + routeid + '.geojson')
            .then(response => response.json())
            .then(data => {
                console.log('Successfully fetched GeoJSON data for routeid:', routeid);
                currentGeoJsonLayer = L.geoJSON(data, {
                    style: { color: 'purple', weight: 3 }
                }).addTo(map);
                map.fitBounds(currentGeoJsonLayer.getBounds());
				map.once("moveend", scheduleAutoSpiderfy);
				map.once("zoomend", scheduleAutoSpiderfy);
            })
            .catch(error => {
                console.error('Error fetching and parsing the GeoJSON file:', error);
                map.setView(marker.getLatLng(), 18);
            });

        // Normalize city name to lowercase
        var cityKey = city.toLowerCase();

        // Remove previous city layers if any
        if (currentCityLayer && map.hasLayer(currentCityLayer)) {
            map.removeLayer(currentCityLayer);
        }

        // Add the city's layer group to the map
        if (cityLayerGroups[cityKey]) {
            currentCityLayer = cityLayerGroups[cityKey];
            map.addLayer(currentCityLayer);

            // Remove the city's grocery stores if checkbox is unchecked
            if (!document.getElementById('grocery-stores-checkbox').checked) {
                currentCityLayer.eachLayer(function(marker) {
                    if (marker.options.icon.options.iconUrl === 'icons/grocery.png') {
                        map.removeLayer(marker);
                    }
                });
            }
		scheduleAutoSpiderfy();

        } else {
            currentCityLayer = null;
        }

        // Open the popup for the clicked marker
		if (marker.__cityLabel && !resupplyLayerGroup.hasLayer(marker.__cityLabel)) resupplyLayerGroup.addLayer(marker.__cityLabel);
		marker.openPopup(); window.__activeCityMarker = marker;



    });

    // Add an event listener for when the popup is closed
    marker.on('popupclose', function() {
        console.log('Popup closed for city:', city); if (window.__activeCityMarker === marker) window.__activeCityMarker = null;
		 // console.log('Popup closed for city:', city);
		if (marker.__cityLabel && resupplyLayerGroup.hasLayer(marker.__cityLabel)) resupplyLayerGroup.removeLayer(marker.__cityLabel);


		

        // Programmatically uncheck the checkboxes and dispatch the 'change' event
    CITY_AUTO_TYPES.forEach(type => {
      const cb = document.getElementById(PLACE_TYPES[type].checkboxId);
      if (!cb) return;
      cb.checked = false;
      cb.dispatchEvent(new Event("change"));
    });


        // Remove the current city layer from the map
        if (currentCityLayer && map.hasLayer(currentCityLayer)) {
            map.removeLayer(currentCityLayer);
            currentCityLayer = null;
        }

        // Remove the current GeoJSON layer from the map
        if (currentGeoJsonLayer && map.hasLayer(currentGeoJsonLayer)) {
            map.removeLayer(currentGeoJsonLayer);
            currentGeoJsonLayer = null;
        }

        // Reset the city name display and currentCityName
        currentCityName = 'Appalachian Trail';
        document.getElementById('city-name-display').innerText = currentCityName;
    });
}
document.getElementById('locate-btn').addEventListener('click', locateUser);

// map.getContainer().addEventListener("click", function (e) {
["mousedown","touchstart","click"].forEach(evt => {
  map.getContainer().addEventListener(evt, function (e) {
    const closeBtn = e.target.closest(".city-label-close");
    if (!closeBtn) return;

    e.preventDefault();
    e.stopPropagation();

    // only actually close on click (not on press)
    // only actually close on click (not on press)
if (evt === "click") {
  const m = window.__activeCityMarker;

  if (!m) {
    map.closePopup();
    return;
  }

  // If a popup exists, close it (will trigger popupclose cleanup)
  if (m.getPopup && m.getPopup()) {
    m.closePopup();
    return;
  }

  // No popup bound (like your tempMarker path) — run the SAME cleanup manually
  m.fire("popupclose");

  // Optional: if you ever set window.__activeCityMarker elsewhere, clear it
  window.__activeCityMarker = null;
}


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

map.on('mousemove', function(e) {
    var lat = e.latlng.lat.toFixed(6);
    var lng = e.latlng.lng.toFixed(6);
    document.getElementById('cursor-coordinates').innerText = `${lat},${lng}`;
});
map.on('click', function(e) {
    var lat = e.latlng.lat.toFixed(6);
    var lng = e.latlng.lng.toFixed(6);
    document.getElementById('clicked-coordinates').innerText = `${lat}, ${lng}`;
});
map.on("popupopen", function (e) {
  const root = e.popup.getElement();
  if (!root) return;

  // Prevent stacking multiple listeners if popupopen fires again for same DOM
  if (root.__waterFeedbackBound) return;
  root.__waterFeedbackBound = true;

  root.addEventListener("click", async function (ev) {
    const link = ev.target.closest(".water-feedback-link");
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
    var inputValue1 = parseInt(document.getElementById('number-input-1').value);
    var inputValue2 = parseInt(document.getElementById('number-input-2').value);

    if (inputValue1 > inputValue2) return;

    var marker1 = mileMarkers.find(marker => marker.mile === inputValue1);
    var marker2 = mileMarkers.find(marker => marker.mile === inputValue2);

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
document.getElementById('number-input-1').addEventListener('input', updateMapBasedOnMileMarkers);
document.getElementById('number-input-2').addEventListener('input', updateMapBasedOnMileMarkers);

document.getElementById('shelter-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(shelterLayerGroup);
    } else {
        map.removeLayer(shelterLayerGroup);
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
Object.keys(PLACE_TYPES).forEach(type => {
  placeLayers[type] = L.layerGroup();
});
function buildGoogleMapsUrl(raw) {
  // your CSV seems to have placeId sometimes
  // if it's already a URL, just use it
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;

  // if it looks like "place_id:XXXX"
  if (raw.includes(":")) {
    const placeId = raw.split(":")[1];
    return `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}`;
  }
  return raw;
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


        // add to global type layer
        placeLayers[type].addLayer(marker);

        // add to city group
if (cityKey && cityLayerGroups[cityKey]) {
  cityLayerGroups[cityKey].addLayer(marker);
}

      }
    })
    .catch(err => console.error("Error loading places.csv:", err));
}

// replace BOTH of your calls:
loadPlacesAndCityGroups();
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



function togglePlaceType(type, checked) {
  const layer = placeLayers[type];

  if (currentCityName === "Appalachian Trail") {
    // global view: toggle the global LayerGroup
    if (checked) map.addLayer(layer);
    else map.removeLayer(layer);
    return;
  }

  // city selected: toggle markers inside the current city's group only
  const cityKey = currentCityName.toLowerCase();
  const cityGroup = cityLayerGroups[cityKey];
  if (!cityGroup) return;

  cityGroup.eachLayer(m => {
    if (m.__placeType === type) {
      if (checked) map.addLayer(m);
      else map.removeLayer(m);
    }
  });
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
