// Toggle sidebar
const menuToggle = document.getElementById("menu-toggle");
const sidebar = document.getElementById("sidebar");

menuToggle.addEventListener("click", function () {
  // Toggle the 'open' class on #sidebar
  sidebar.classList.toggle("open");
});



// This code assumes the DOM is already loaded since the button is in the HTML.
document.getElementById('feedback-button').addEventListener('click', function() {
  window.open("https://trailmagic.co/pages/contact", "_blank");
});




var map = L.map('map', {
    closePopupOnClick: false
}).setView([39.725324, -76.904297], 5);
var currentCityLayer = null; // Variable to store the current city layer group
var currentCityName = 'Appalachian Trail'; // Initialize to 'Appalachian Trail'
var geojsonLayer;
var cityLayer;




L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
}).addTo(map);

var trailCoordinates = [];
var mileMarkers = [];
var userLocationMarker;
var simulatedLocationMarker;
var currentGeoJsonLayer = null; // Variable to store the currently displayed GeoJSON layer
var currentRoutingControl = null;

var shelterLayerGroup = L.layerGroup().addTo(map); 
var waterLayerGroup = L.layerGroup().addTo(map); 
var waterSubtypes = {};
var resupplyLayerGroup = L.layerGroup().addTo(map); 
var intersectionsLayerGroup = L.layerGroup().addTo(map);
var cityLayerGroups = {}; 




var redIcon = L.icon({
    iconUrl: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var tentIcon = L.icon({
    iconUrl: 'icons/tent.png', 
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var crossingIcon = L.icon({
    iconUrl: 'icons/crossing.png', 
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var waterIcon = L.icon({
    iconUrl: 'icons/water.png', 
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var postofficeIcon = L.icon({
    iconUrl: 'icons/post office.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});
var groceryIcon = L.icon({
	iconUrl: 'icons/grocery.png', 
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var hostelIcon = L.icon({
	iconUrl: 'icons/hostel.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var pharmacyIcon = L.icon({
	iconUrl: 'icons/pharmacy.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var hospitalIcon = L.icon({
	iconUrl: 'icons/hospital.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var outfitterIcon = L.icon({
	iconUrl: 'icons/outfitter.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var shuttleIcon = L.icon({
	iconUrl: 'icons/shuttle.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var busIcon = L.icon({
	iconUrl: 'icons/bus.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});
var taxiIcon = L.icon({
	iconUrl: 'icons/taxi.png',
	iconSize: [32, 32],
	iconAnchor: [16, 32],
	popupAnchor: [0, -32]
});


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
            iconSize: [32, 32]
        });
    }
});







var roadcrossingClusterGroup = L.markerClusterGroup();



let mainTrailLayer = null; // store reference to the main trail

// Load the GeoJSON file and add it to the map
fetch('data/at.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            style: { color: 'red' }
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
		
		if (layer === mainTrailLayer) return;     
		if (roadcrossingClusterGroup.hasLayer(layer)) return;
		if (waterClusterGroup.hasLayer(layer)) return;		
		var isWaterSubtype = Object.values(waterSubtypes).some(function(subtypeGroup) {
            return subtypeGroup.hasLayer(layer);
        });

		if (isWaterSubtype) return; // Skip clearing water subtypes


        // Remove markers that are not part of specific groups or special markers
        if (layer instanceof L.Marker &&
            !shelterLayerGroup.hasLayer(layer) &&
			!waterLayerGroup.hasLayer(layer) &&
			!isWaterSubtype&&
            !resupplyLayerGroup.hasLayer(layer) &&
            !groceryStoresLayer.hasLayer(layer) &&
            !hostelLayer.hasLayer(layer) &&
            !pharmacyLayer.hasLayer(layer) &&
            !postofficeLayer.hasLayer(layer) &&
            !hospitalLayer.hasLayer(layer) &&
			!outfitterLayer.hasLayer(layer) &&
			!shuttleLayer.hasLayer(layer) &&
			!busLayer.hasLayer(layer) &&
			!taxiLayer.hasLayer(layer) &&
            !Object.values(cityLayerGroups).some(group => group.hasLayer(layer)) &&
            layer !== userLocationMarker &&
            layer !== simulatedLocationMarker) {
            map.removeLayer(layer);
        }
    });

    // Add markers dynamically based on the current zoom level
    addTextMarkers();

    // Ensure roadcrossingClusterGroup is still added to the map
/*     if (!map.hasLayer(roadcrossingClusterGroup)) {
        map.addLayer(roadcrossingClusterGroup);
    } */

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
function loadResupplyRoute() {
    fetch('data/resupply.csv')
        .then(response => response.text())
        .then(csvText => {
            var lines = csvText.split('\n');
            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line && line.length > 0) {
                    var values = line.split(',');
                    if (values.length >= 6) {
                        var latA = parseFloat(values[1]);
                        var lngA = parseFloat(values[2]);
                        var latB = parseFloat(values[3]);
                        var lngB = parseFloat(values[4]);

                        // Create route from point A to point B with custom color
                        L.Routing.control({
                            waypoints: [
                                L.latLng(latA, lngA),
                                L.latLng(latB, lngB)
                            ],
                            routeWhileDragging: false,
                            createMarker: function() { return null; }, // Do not create markers for the route waypoints
                            lineOptions: {
                                styles: [{ color: 'blue', opacity: 1, weight: 2 }]
                            }
                        }).addTo(map);
                    }
                }
            }
        });
}
function loadCityLayerGroups() {
    var postOfficeLayerGroup = L.layerGroup(); 
    var restaurantLayerGroup = L.layerGroup(); 
    var groceryLayerGroup = L.layerGroup(); 
	var hospitalLayerGroup = L.layerGroup(); 
	var pharmacyLayerGroup = L.layerGroup(); 
	var outfitterLayerGroup = L.layerGroup(); 
	var shuttleLayerGroup = L.layerGroup(); 
	var busLayerGroup = L.layerGroup(); 
	var taxiLayerGroup = L.layerGroup(); 

    fetch('data/places.csv')
        .then(response => response.text())
        .then(csvText => {
            var lines = csvText.split('\n');
            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].split(',');
                if (line.length >= 7) {
                    var name = line[0].trim();
                    var lat = parseFloat(line[1]);
                    var lng = parseFloat(line[2]);
                    var type = line[3].trim().toLowerCase();
                    var city = line[6].trim().toLowerCase();

                    // Create city layer groups
                    if (city) {
                        if (!cityLayerGroups[city]) {
                            cityLayerGroups[city] = L.layerGroup();
                        }

                        var icon = L.icon({
                            iconUrl: `icons/${type}.png`, 
                            iconSize: [33, 33],
                            iconAnchor: [16, 32],
                            popupAnchor: [0, -32]
                        });

                        var googleMapsSearchUrl = line[8]; // Use link directly from CSV column I
                        var capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
						

                        // Create the marker
                        var marker = L.marker([lat, lng], { icon: icon })
                            .bindPopup(`${name}<br>${capitalizedType}<br><a href="${googleMapsSearchUrl}" target="_blank">${"View on Google Maps"}</a>`);

                        // Add the marker to the city layer
                        cityLayerGroups[city].addLayer(marker);

                        // Also add the marker to the appropriate type layer group
                        if (type === "grocery") {
                            groceryLayerGroup.addLayer(marker);
                        } else if (type === "restaurant") {
                            restaurantLayerGroup.addLayer(marker);
                        } else if (type === "post office") {
                            postOfficeLayerGroup.addLayer(marker);					
                        } else if (type === "hospital") {
                            hospitalLayerGroup.addLayer(marker);					
                        } else if (type === "pharmacy") {
                            pharmacyLayerGroup.addLayer(marker);					
                        } else if (type === "outfitter") {
                            outfitterLayerGroup.addLayer(marker);					
                        } else if (type === "shuttle") {
                            shuttleLayerGroup.addLayer(marker);					
                        } else if (type === "bus") {
                            busLayerGroup.addLayer(marker);					
                        }else if (type === "taxi") {
                            taxiLayerGroup.addLayer(marker);					
                        }		
						
						
                    }
                }
            }


        });
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
            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].split(',');
                if (line.length >= 3) {
                    var name = line[0];
                    var lat = parseFloat(line[1]);
                    var lng = parseFloat(line[2]);
					var crstype = line[3];
					var disttowat = line[4];
					var markertyperouteid
					markertype = (line[6]);
					markertype = String(markertype);
					markertype = markertype.replace(/\.csv$/, "");
					markertype = markertype.charAt(0).toUpperCase() + markertype.slice(1);

					if (markertype === "Crossing") {
					var googleMapsLink = `<a href="https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}" target="_blank">${name}</a>`;
					var crossingMarker = L.marker([lat, lng], { icon: crossingIcon })
						.bindPopup(`${markertype}<br> ${googleMapsLink}<br> ${lat.toFixed(6)},${lng.toFixed(6)}<br>${crstype}`);
					roadcrossingClusterGroup.addLayer(crossingMarker);
				}
 

	 				
					
/* 					if (markertype === "Water") {
					  // `crstype` is in line[3]. For clarity, you stored it into `crstype` variable above.
					  let subtype = crstype.trim(); // e.g. "Spring", "Stream", "Creek", etc.

					  // Create a new layerGroup for this subtype if not already existing
					  if (!waterSubtypes[subtype]) {
						waterSubtypes[subtype] = L.layerGroup();
					  }

					  // Create the marker
					  var waterMarker = L.marker([lat, lng], { icon: waterIcon }).bindPopup(
						`${markertype}<br>${name}<br>${lat.toFixed(6)},${lng.toFixed(6)}<br>${crstype}<br>${disttowat}`
					  );

					  // Add it to the appropriate subtype layer
					  waterSubtypes[subtype].addLayer(waterMarker);
					} */
					
					
					
					if (markertype === "Water") {
						let subtype = crstype.trim(); // e.g., "Spring", "Stream"
						if (!waterSubtypes[subtype]) {
							waterSubtypes[subtype] = L.layerGroup();
						}

						var waterMarker = L.marker([lat, lng], { icon: waterIcon })
							.bindPopup(
								`${markertype}<br>${name}<br>${lat.toFixed(6)},${lng.toFixed(6)}<br>${crstype}<br>${disttowat}`
							);

						// Add to both subtype layer and the cluster group
						waterSubtypes[subtype].addLayer(waterMarker);
						waterClusterGroup.addLayer(waterMarker);
					}
										
					
					if (markertype === "Shelter"){
                    L.marker([lat, lng], { icon: tentIcon })
                        .addTo(shelterLayerGroup)
                        .bindPopup(`${markertype}<br> ${name}<br> ${lat.toFixed(6)},${lng.toFixed(6)}`);
					}
					if (markertype === "Resupply"){
						
						var milestotown = line[10];
						var locationinfo = !isNaN(milestotown) ? (Math.round(milestotown * 10) / 10).toFixed(1) + " miles" : milestotown;
						if (locationinfo === "0.0 miles") {
							locationinfo = "On Trail";
						}
						
						var marker = L.marker([lat, lng], { icon: redIcon }) 
							.addTo(resupplyLayerGroup)
							.bindPopup(`${markertype}<br> ${name}<br> ${lat.toFixed(6)},${lng.toFixed(6)}<br>${locationinfo}`, { autoClose: false });
							//.bindPopup(`${markertype}<br> ${name}<br> ${lat.toFixed(6)},${lng.toFixed(6)}<br>${locationinfo}`);
							routeid= parseFloat(line[11]);
							addMarkerClickHandler(marker, name, routeid);
					}					
                }
            }
			createWaterSubmenuCheckboxes();
			document.getElementById('water-checkbox').dispatchEvent(new Event('change'));

        });
}
loadAll()
loadCityLayerGroups();
function addMarkerClickHandler(marker, city, routeid) {
    marker.on('click', function() {
        console.log('Marker clicked for city:', city, 'with routeid:', routeid);

        // Update city name display and set currentCityName
        currentCityName = city.charAt(0).toUpperCase() + city.slice(1);
        document.getElementById('city-name-display').innerText = currentCityName;

        // Remove global layers if they are on the map
        [groceryStoresLayer, hostelLayer, postofficeLayer, pharmacyLayer, hospitalLayer, outfitterLayer, shuttleLayer, busLayer, taxiLayer].forEach(layer => {
            if (map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });

        // Remove the current GeoJSON layer if it exists
        if (currentGeoJsonLayer) {
            map.removeLayer(currentGeoJsonLayer);
            currentGeoJsonLayer = null;
        }

        // Programmatically check the checkboxes and dispatch the 'change' event
        ['grocery-stores', 'hostel', 'postoffice', 'pharmacy', 'hospital', 'outfitter'].forEach(id => {
            const checkbox = document.getElementById(`${id}-checkbox`);
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
        });

        // Fetch and display the city's GeoJSON route
        fetch('data/' + routeid + '.geojson')
            .then(response => response.json())
            .then(data => {
                console.log('Successfully fetched GeoJSON data for routeid:', routeid);
                currentGeoJsonLayer = L.geoJSON(data, {
                    style: { color: 'purple', weight: 3 }
                }).addTo(map);
                map.fitBounds(currentGeoJsonLayer.getBounds());
            })
            .catch(error => {
                console.error('Error fetching and parsing the GeoJSON file:', error);
                map.setView(marker.getLatLng(), 15);
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
        } else {
            currentCityLayer = null;
        }

        // Open the popup for the clicked marker
        marker.openPopup();
    });

    // Add an event listener for when the popup is closed
    marker.on('popupclose', function() {
        console.log('Popup closed for city:', city);

        // Programmatically uncheck the checkboxes and dispatch the 'change' event
        ['grocery-stores', 'hostel', 'postoffice', 'pharmacy', 'hospital','outfitter'].forEach(id => {
            const checkbox = document.getElementById(`${id}-checkbox`);
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
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
// Main "Water" Checkbox Event Listener
/* document.getElementById('water-checkbox').addEventListener('change', function() {
  var waterIsChecked = this.checked;
  for (var subtype in waterSubtypes) {
    var subtypeCheckbox = document.getElementById('water-subtype-' + subtype);
    if (!subtypeCheckbox) continue; 

    if (waterIsChecked) {
      subtypeCheckbox.checked = true;
      map.addLayer(waterSubtypes[subtype]);
    } else {

      subtypeCheckbox.checked = false;
      map.removeLayer(waterSubtypes[subtype]);
    }
  }
}); */

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

// Synchronize zoom level behavior for clusters and markers
/* map.on('zoomend', function () {
    var zoomLevel = map.getZoom();
    var waterIsChecked = document.getElementById('water-checkbox').checked;

    if (waterIsChecked) {
        if (zoomLevel >= 12) {
            // Remove the cluster group and show individual markers for checked subtypes
            map.removeLayer(waterClusterGroup);
            Object.keys(waterSubtypes).forEach(subtype => {
                if (document.getElementById('water-subtype-' + subtype).checked) {
                    map.addLayer(waterSubtypes[subtype]);
                } else {
                    map.removeLayer(waterSubtypes[subtype]);
                }
            });
        } else {
            // Add the cluster group and hide individual markers
            map.addLayer(waterClusterGroup);
            Object.keys(waterSubtypes).forEach(subtype => {
                map.removeLayer(waterSubtypes[subtype]);
            });
        }
    } else {
        // Ensure all water markers and clusters remain hidden
        map.removeLayer(waterClusterGroup);
        Object.keys(waterSubtypes).forEach(subtype => {
            map.removeLayer(waterSubtypes[subtype]);
        });
    }
}); */





document.getElementById('crossing-checkbox').addEventListener('change', function() {
    if (this.checked) {
        map.addLayer(roadcrossingLayerGroup);
    } else {
        map.removeLayer(roadcrossingLayerGroup);
    }
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
var groceryStoresLayer = L.layerGroup();
var hostelLayer = L.layerGroup();
var postofficeLayer = L.layerGroup();
var hospitalLayer = L.layerGroup();
var pharmacyLayer = L.layerGroup();
var outfitterLayer = L.layerGroup();
var shuttleLayer = L.layerGroup();
var busLayer = L.layerGroup();
var taxiLayer = L.layerGroup();
function loadGroceryStoresLayer() {
    fetch('data/places.csv')
        .then(response => response.text())
        .then(csvText => {
            var lines = csvText.split('\n');
            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].split(',');
                if (line.length >= 4) {
                    var type = line[3].trim().toLowerCase();
					var googleMapsSearchUrl = line[8];
                    if (type === "grocery") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);
						


                        var marker = L.marker([lat, lng], { icon: groceryIcon })
                            .bindPopup(`${name}<br>Grocery Store<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        groceryStoresLayer.addLayer(marker);
                    }
					
                     if (type === "hostel") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     
                        var marker = L.marker([lat, lng], { icon: hostelIcon })
                            .bindPopup(`${name}<br>Hostel<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        hostelLayer.addLayer(marker);
                    }					
					
                     if (type === "post office") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);


                        var marker = L.marker([lat, lng], { icon: postofficeIcon })
                            .bindPopup(`${name}<br>Post Office<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        postofficeLayer.addLayer(marker);
                    }					
					
                     if (type === "pharmacy") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     


                        var marker = L.marker([lat, lng], { icon: pharmacyIcon })
                            .bindPopup(`${name}<br>Pharmacy<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        pharmacyLayer.addLayer(marker);
                    }						


                     if (type === "hospital") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     

                        var marker = L.marker([lat, lng], { icon: hospitalIcon })
                            .bindPopup(`${name}<br>Hopsital<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        hospitalLayer.addLayer(marker);

						
                    }						
                     if (type === "outfitter") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     

                        var marker = L.marker([lat, lng], { icon: outfitterIcon })
                            .bindPopup(`${name}<br>Outfitter<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                        outfitterLayer.addLayer(marker);

						
                    }	

                     if (type === "shuttle") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     

                        var marker = L.marker([lat, lng], { icon: shuttleIcon })
                            .bindPopup(`${name}<br>shuttle<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                       shuttleLayer.addLayer(marker);

						
                    }
					
                     if (type === "bus") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     

                        var marker = L.marker([lat, lng], { icon: busIcon })
                            .bindPopup(`${name}<br>Bus<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                       busLayer.addLayer(marker);

						
                    }	


                     if (type === "taxi") {
                        var name = line[0].trim();
                        var lat = parseFloat(line[1]);
                        var lng = parseFloat(line[2]);

     

                        var marker = L.marker([lat, lng], { icon: taxiIcon })
                            .bindPopup(`${name}<br>Taxi<br><a href="${googleMapsSearchUrl}" target="_blank">View on Google Maps</a>`);

                       taxiLayer.addLayer(marker);

						
                    }						

					
                }
            }
        })
        .catch(error => console.error('Error loading grocery stores:', error));
}
loadGroceryStoresLayer();
document.getElementById('grocery-stores-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        // No city selected; toggle global grocery stores layer
        if (this.checked) {
            map.addLayer(groceryStoresLayer);
        } else {
            map.removeLayer(groceryStoresLayer);
        }
    } else {
        // City is selected; toggle grocery stores within the current city
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/grocery.png') {
                    if (document.getElementById('grocery-stores-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});
document.getElementById('hostel-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(hostelLayer);
        } else {
            map.removeLayer(hostelLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/hostel.png') {
                    if (document.getElementById('hostel-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});
document.getElementById('postoffice-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(postofficeLayer);
        } else {
            map.removeLayer(postofficeLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/post office.png') {
                    if (document.getElementById('postoffice-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});
document.getElementById('pharmacy-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(pharmacyLayer);
        } else {
            map.removeLayer(pharmacyLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/pharmacy.png') {
                    if (document.getElementById('pharmacy-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});
document.getElementById('hospital-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(hospitalLayer);
        } else {
            map.removeLayer(hospitalLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/hospital.png') {
                    if (document.getElementById('hospital-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});


document.getElementById('outfitter-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(outfitterLayer);
        } else {
            map.removeLayer(outfitterLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/outfitter.png') {
                    if (document.getElementById('outfitter-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});


document.getElementById('shuttle-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(shuttleLayer);
        } else {
            map.removeLayer(shuttleLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/shuttle.png') {
                    if (document.getElementById('shuttle-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});


document.getElementById('bus-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(busLayer);
        } else {
            map.removeLayer(busLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/bus.png') {
                    if (document.getElementById('bus-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});



document.getElementById('taxi-checkbox').addEventListener('change', function() {
    if (currentCityName === 'Appalachian Trail') {
        if (this.checked) {
            map.addLayer(taxiLayer);
        } else {
            map.removeLayer(taxiLayer);
        }
    } else {
        var cityKey = currentCityName.toLowerCase();
        if (cityLayerGroups[cityKey]) {
            cityLayerGroups[cityKey].eachLayer(function(marker) {
                if (marker.options.icon.options.iconUrl === 'icons/taxi.png') {
                    if (document.getElementById('taxi-checkbox').checked) {
                        map.addLayer(marker);
                    } else {
                        map.removeLayer(marker);
                    }
                }
            });
        }
    }
});


// 11-29 update
document.getElementById('crossing-checkbox').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(roadcrossingClusterGroup);
    } else {
        map.removeLayer(roadcrossingClusterGroup);
    }
});

document.getElementById('shuttle1-checkbox').addEventListener('change', function () {
    if (this.checked) {
        map.addLayer(shuttleLayer);
    } else {
        map.removeLayer(shuttleLayer);
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

  navigator.serviceWorker.register('/service-worker.js')
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


