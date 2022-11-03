///////////////////////////////////////////////////////////////////////////////////////////////////
// Authors:         Sebastian Thiem
// 
// Project Name:    Google Transit Realtime Feed Viewer
// File Name:		index.js
// Create Date:     29 Oct 2022
//
// Description:     Periodically queries the server for realtime updates,
//                  and displays the information to the webpage.
//                  Utilizing Google maps API for display.
//
///////////////////////////////////////////////////////////////////////////////////////////////////

/***********
 * Globals *
 ***********/

var map;

// Half a second.
const POLLING_INTERVAL = 500; //ms
var   READY_TO_POLL    = false;

const GET_API_KEY = "/GetAPIKey";
const GET_RT_FEED = "/GetRTFeed";
const GET_ROUTES  = "/GetRoutes";
const GET_BOUNDS  = "/GetBounds";
const GET_STOPS   = "/GetStops";
const POST_REQ_SAMPLE = "/PostRequestSampleData";
const POST_REQ_SAMPLE_CANCEL = "/PostCancelSampleData";
const POST_SAMPLERATE_UPDATE = "/PostSampleRateUpdate";

const stopsColor = "#6a3d9a";
const colorTable = [
    "#66c2a5","#fc8d62","#8da0cb","#e78ac3",
    "#a6d854","#ffd92f","#e5c494","#b3b3b3"
];
var colorIndex = 0;

var drawnRouteLines = [];

var stopPopups = {};
var trainPopups = {};

var trainMarkers = {};

var stopsData = {};

/*********************
 * Polling Functions *
 *********************/

/**
 * Begin polling the server for udpates.
 */
function beginPolling() {
    setTimeout(poll, POLLING_INTERVAL);
}

/**
 * Query the server for updated realtime data.
 */
function poll(){
    getRealtimeData();
    setTimeout(poll, POLLING_INTERVAL)
}

/**********************
 * REST GET Functions *
 **********************/

/**
 * Retrieve the routes data from the server.
 * And use it to draw the routes on google maps.
 */
async function getAPIKey(){
    return new Promise(resolve => {
        $.get(GET_API_KEY, function(data, status){
            resolve(data);
        });
    });
}

/**
 * Retrieve the routes data from the server.
 * And use it to draw the routes on google maps.
 */
async function getRouteData(){
    $.get(GET_ROUTES, function(data, status){
        drawRoutes(data);
    });
}

/**
 * Get the stop information from the server, then draw the stops on the map.
 */
async function getStopsData(){
    $.get(GET_STOPS, function(data, status){
        
        // Store down known stop names
        // Don't clear it each time, just write down what we learn.
        for(let stop of data){
            stopsData[stop["id"]] = stop["name"];
        }

        drawStops(data);
    });
}

/**
 * Retrieve the boundaries data from the server.
 * And use it to set the bounds for the google maps widget.
 */
async function getBounds(){
    $.get(GET_BOUNDS, function(data, status){
        setBounds(data);
    });
}

/**
 * Retrieve the latest realtime data from the server.
 * Use it to update the UI.
 */
async function getRealtimeData(){
    $.get(GET_RT_FEED, function(data, status){
        update(data);
    });
}

/**********************
 * REST POST Functions *
 **********************/

/**
 * Send a request to the server to get 
 * Simulated realtime data.
 * @param {Number} sampleSpeed Speed that the samples should be upated.
 */
async function requestSimulatedFeed(sampleSpeed){
    $.post(POST_REQ_SAMPLE, {sampleSpeed: sampleSpeed}, function(data, status){
        if(status !== 'success'){
            console.log("Failed to request sim feed.")
        }
    });
}

/**
 * Send a request to the server to request
 * to switch back to the real feed.
 */
async function requestSimulatedFeedCancel(){
    $.post(POST_REQ_SAMPLE_CANCEL, {}, function(data, status){
        if(status === 'success'){
            
            // CLear out all the active train markers.
            for(let tid of Object.keys(trainMarkers)){
                trainMarkers[tid].setMap(null);
                delete trainMarkers[tid];
            }
        }
        else{
            console.log("Failed to request sim feed cancellation.")
        }
    });
}

/**
 * Update the rate of the sample speed; server-side.
 * @param {Number} sampleSpeed Speed that the samples should be upated.
 */
async function postUpdateSampleSpeed(sampleSpeed){
    $.post(POST_SAMPLERATE_UPDATE, {sampleSpeed: sampleSpeed}, function(data, status){
        if(status !== 'success'){
            console.log("Failed to update sample speed.")
        }
    });
}

/*************
 * Callbacks *
 *************/

/**
 * Runs before we initialize the map, sets AAPI key and callback for google Maps.
 * @param {String} apiKey The API key for this intance of google Maps.
 */
function preinitMap(apiKey){
    
    // Set up the API connection.
    var script = document.createElement("script");
    script.setAttribute("src",`https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`);
    document.getElementsByTagName("head")[0].appendChild(script);

    // Configure the callback.
    window.initMap = initMap;
}

/**
 * Callback for initializing the Google Maps embedded map.
 */
async function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 2,
        center: { lat: 0, lng: 0 },
        // Dark theme
        // styles: [
        //     { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        //     { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        //     { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        //     {
        //     featureType: "administrative.locality",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#d59563" }],
        //     },
        //     {
        //     featureType: "poi",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#d59563" }],
        //     },
        //     {
        //     featureType: "poi.park",
        //     elementType: "geometry",
        //     stylers: [{ color: "#263c3f" }],
        //     },
        //     {
        //     featureType: "poi.park",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#6b9a76" }],
        //     },
        //     {
        //     featureType: "road",
        //     elementType: "geometry",
        //     stylers: [{ color: "#38414e" }],
        //     },
        //     {
        //     featureType: "road",
        //     elementType: "geometry.stroke",
        //     stylers: [{ color: "#212a37" }],
        //     },
        //     {
        //     featureType: "road",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#9ca5b3" }],
        //     },
        //     {
        //     featureType: "road.highway",
        //     elementType: "geometry",
        //     stylers: [{ color: "#746855" }],
        //     },
        //     {
        //     featureType: "road.highway",
        //     elementType: "geometry.stroke",
        //     stylers: [{ color: "#1f2835" }],
        //     },
        //     {
        //     featureType: "road.highway",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#f3d19c" }],
        //     },
        //     {
        //     featureType: "transit",
        //     elementType: "geometry",
        //     stylers: [{ color: "#2f3948" }],
        //     },
        //     {
        //     featureType: "transit.station",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#d59563" }],
        //     },
        //     {
        //     featureType: "water",
        //     elementType: "geometry",
        //     stylers: [{ color: "#17263c" }],
        //     },
        //     {
        //     featureType: "water",
        //     elementType: "labels.text.fill",
        //     stylers: [{ color: "#515c6d" }],
        //     },
        //     {
        //     featureType: "water",
        //     elementType: "labels.text.stroke",
        //     stylers: [{ color: "#17263c" }],
        //     },
        // ],
    });
    
    // Aquire routes data
    await getRouteData();

    // Set the appropriate window bounds
    await getBounds();
    
    getStopsData();
}

/**
 * Draw the routes provided from the server on the google maps widget.
 * @param {Array} routes 
 */
function drawRoutes(routes){

    // Clear out old lines
    for(let route of drawnRouteLines){
        route.setMap(null);
    }
    drawnRouteLines = [];

    // Draw the new ones
    for(let route of routes){
        const color = (route.hasOwnProperty("color"))? route["color"] : colorTable[colorIndex++ % colorTable.length];
        var line = new google.maps.Polyline({
            path: route["path"],
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 5,
        });

        line.setMap(map);

        drawnRouteLines.push(line);
    }
}

/**
 * Compute the bounds of the stop marker based on the zoom factor of the map.
 * @param {{lat : number, lng : number}} loc 
 * @returns {{north : string, south : string, east : string, west : string}} Bounds.
 */
function computeStopBounds(loc){

    // Set the scale based on a *seemingly* good scaling function.
    const zoom = map.getZoom();
    const factor_lat = 0.001 * 130 / (zoom ** 2.2);
    const factor_lng = 0.001 * 160 / (zoom ** 2.2);

    return {
        north: loc["lat"]+factor_lat,
        south: loc["lat"]-factor_lat,
        east: loc["lng"]+factor_lng,
        west: loc["lng"]-factor_lng,
    }
}

/**
 * Draw the stops on the map as 
 * @param {Stop[]} stops List of stops.
 */
function drawStops(stops){

    class StopLabel extends google.maps.OverlayView {
        position;
        containerDiv;

        constructor(position, content) {
            super();
            this.position = position;

            content.classList.add("popup-bubble");

            // This zero-height div is positioned at the bottom of the bubble.
            const bubbleAnchor = document.createElement("div");

            bubbleAnchor.classList.add("popup-bubble-anchor");
            bubbleAnchor.appendChild(content);

            // This zero-height div is positioned at the bottom of the tip.
            this.containerDiv = document.createElement("div");
            this.containerDiv.classList.add("popup-container");
            this.containerDiv.appendChild(bubbleAnchor);

            // Optionally stop clicks, etc., from bubbling up to the map.
            StopLabel.preventMapHitsAndGesturesFrom(this.containerDiv);
        }

        /** Called when the popup is added to the map. */
        onAdd() {
            let pane = this.getPanes();
            if(pane){
                pane.floatPane.appendChild(this.containerDiv);
            }
        }

        /** Called when the popup is removed from the map. */
        onRemove() {
            if (this.containerDiv.parentElement) {
                this.containerDiv.parentElement.removeChild(this.containerDiv);
            }
        }

        /** Called each frame when the popup needs to draw itself. */
        draw() {
            const divPosition = this.getProjection().fromLatLngToDivPixel(
                this.position
            );

            // Hide the popup when it is far out of view.
            const display =
            Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000
                ? "block"
                : "none";

            if (display === "block") {
            this.containerDiv.style.left = divPosition.x + "px";
            this.containerDiv.style.top = divPosition.y + "px";
            }

            if (this.containerDiv.style.display !== display) {
            this.containerDiv.style.display = display;
            }
        }
    }
    
    // For each stop draw an icon at that location
    for(let stop of stops){
        const stop_id = `stop_${stop["id"]}`;

        var popup = document.createElement("div");
        popup.setAttribute("id", stop_id);
        popup.textContent = stop["name"]

        popup = new StopLabel(
            stop["loc"],
            popup
        );
        stopPopups[stop_id] = popup;
    }

    // Draw markers on each station
    // These markers will on-hover, reveal the station name.
    
    // For each stop draw an icon at that location
    for(let stop of stops){
        const stop_id = `stop_${stop["id"]}`;
        const loc = stop["loc"];
        const stpBounds = computeStopBounds(loc);
        var rectangle = new google.maps.Rectangle({
            strokeColor: stopsColor,
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: stopsColor,
            fillOpacity: 0.5,
            map,
            bounds: {
                north: stpBounds["north"],
                south: stpBounds["south"],
                east: stpBounds["east"],
                west: stpBounds["west"],
            },
        });

        rectangle.addListener("mouseover", (evt) => {
            stopPopups[stop_id].setMap(map);
        });
        rectangle.addListener("mouseout", (evt) => {
            stopPopups[stop_id].setMap(null);
        });
        
        stop["rect"] = rectangle;
    }

    map.addListener("zoom_changed", () => {
        for(let stop of stops){
            if(stop.hasOwnProperty("rect")){
                stop["rect"].setOptions({
                    bounds: computeStopBounds(stop["loc"]),
                });
            }
        }
    });
}

/**
 * Set the boundaries of the Google Maps widget.
 * @param {Object} bounds SW and NE bounds for the widget.
 */
function setBounds(bounds){
    const googleBounds = new google.maps.LatLngBounds(
        bounds["sw"],
        bounds["ne"]
    );
    map.fitBounds(googleBounds);
}

/**
 * Update the tracking markers for each vehicle in the update.
 * @param {FeedMessage} realtimeData Google Transit FeedMessage
 */
function updateVehicleMarkers(realtimeData){

    class TrainLabel extends google.maps.OverlayView {
        position;
        containerDiv;

        constructor(position, content) {
            super();
            this.position = position;

            content.classList.add("popup-bubble");

            // This zero-height div is positioned at the bottom of the bubble.
            const bubbleAnchor = document.createElement("div");

            bubbleAnchor.classList.add("popup-bubble-anchor");
            bubbleAnchor.appendChild(content);

            // This zero-height div is positioned at the bottom of the tip.
            this.containerDiv = document.createElement("div");
            this.containerDiv.classList.add("popup-container");
            this.containerDiv.appendChild(bubbleAnchor);

            // Optionally stop clicks, etc., from bubbling up to the map.
            TrainLabel.preventMapHitsAndGesturesFrom(this.containerDiv);
        }

        /** Called when the popup is added to the map. */
        onAdd() {
            let pane = this.getPanes();
            if(pane){
                pane.floatPane.appendChild(this.containerDiv);
            }
        }

        /** Called when the popup is removed from the map. */
        onRemove() {
            if (this.containerDiv.parentElement) {
                this.containerDiv.parentElement.removeChild(this.containerDiv);
            }
        }

        /** Called each frame when the popup needs to draw itself. */
        draw() {
            const divPosition = this.getProjection().fromLatLngToDivPixel(
                this.position
            );

            // Hide the popup when it is far out of view.
            const display =
            Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000
                ? "block"
                : "none";

            if (display === "block") {
            this.containerDiv.style.left = divPosition.x + "px";
            this.containerDiv.style.top = divPosition.y + "px";
            }

            if (this.containerDiv.style.display !== display) {
            this.containerDiv.style.display = display;
            }
        }
    }

    const entities = realtimeData.entity? realtimeData.entity : [];

    // Keep a list of active tids so we can remove trains that are no longer active at the end
    let tidsActive = new Set();
    for(let entity of entities){
        let pos = entity.vehicle.position;
        let tid = entity.vehicle.vehicle.id;

        tidsActive.add(tid);

        // If the train was already active before
        // Determine it's direction and see if it has moved.
        let dirLeft = false;
        if(trainMarkers.hasOwnProperty(tid)){
            let locPrev = trainMarkers[tid].getPosition()
            dirLeft = pos.longitude < locPrev.lng();
            
            // If train hasn't moved don't redraw anything
            if(locPrev.lat() == pos.latitude && locPrev.lng() == pos.longitude){
                continue;
            }

            // Otherwise Clear the previous marker
            trainMarkers[tid].setMap(null);
        }

        // Create a new marker
        let icon = dirLeft ? "img/toy-train-60-left.png" : "img/toy-train-60-right.png";
        marker = new google.maps.Marker({
            position: { lat: pos.latitude, lng: pos.longitude },
            map,
            icon: icon,
        });

        trainMarkers[tid] = marker;

        /// NOTE: Issues with scaling factor and making sure the popup 
        ///       stays on top of the train marker.
        // Also create the popup
        // var popup = document.createElement("div");
        // popup.setAttribute("id", `trn_${i}`);
        // popup.textContent = entity.vehicle.vehicle.id;
        // popup = new TrainLabel(
        //     {
        //         // NOTE we want it slightly above
        //         lat: pos.latitude + 0.001 * 130 / (map.getZoom() ** 2.2), 
        //         lng: pos.longitude
        //     }, 
        //     popup
        // );
        // trainPopups[i] = popup;

        // // Configure the on-hover event
        // marker.addListener("mouseover", (evt) => {
        //     trainPopups[i].setMap(map);
        // });
        // marker.addListener("mouseout", (evt) => {
        //     trainPopups[i].setMap(null);
        // });
    }

    // Clear inactive train markers
    for(let tid of Object.keys(trainMarkers)){
        if(!tidsActive.has(tid)){
            trainMarkers[tid].setMap(null);
            delete trainMarkers[tid];
        }
    }
}


/**
 * Update the trips table to reflect the latest data.
 * @param {FeedMessage} realtimeData Google Transit FeedMessage
 */
function updateTripsTable(realtimeData){
    // console.log(realtimeData);
    
    const entities = realtimeData.entity? realtimeData.entity : [];

    for(let entity of entities){
        let id = entity.tripUpdate.trip.tripId;
    }

    let tripStats = $("#tripStats");

    // For each new trip create a table.
    // Acquire a list of active trips, so we can delete ones that we previously active
    // The order of operations here is:
    //   - Scan the new info
    //   - Modify the trip table if it already exists
    //   - delete the table if it not active anymore
    let tripsActive = new Set();
    let i = 0;
    for(let entity of entities){
        let tripUpdate = entity.tripUpdate;
        let id = tripUpdate.trip.tripId;
        let tid = tripUpdate.vehicle.id;
        let stopTimeUpdates = tripUpdate.stopTimeUpdate;
        let divId = "tripTable-" + id;

        if(!stopTimeUpdates) continue;
        
        tripsActive.add(divId);

        // Find the existing tab if it is present.
        let existingTab = null;
        for(let div of tripStats.children("div")){
            if (divId == div.id){
                existingTab = $(div);
                break;
            }
        }

        // If there was no existing tab, then create a new one
        if(existingTab == null){
            let checked = (i == 0)? " checked" : "";
            let input = $(`<input type="radio" id="input-${id}" name="tripTabs"${checked} class="tab-switch"></input>`);
            let label = $(`<label id="label-${id}" for="input-${id}" class="tab-label">${id}</label>`);
            let div = $(`<div id="${divId}" class="tab"></div>`);
            tripStats.append(input);
            tripStats.append(label);
            tripStats.append(div);
            existingTab = $(div);
        }

        // Build the table string from the stop time update data
        let header = $(`<h4>Train ${tid}</h4>`);
        let tableStr = '<table class="fixed_header">';
        tableStr += "<thead>";
        tableStr += "<tr>";
        tableStr += "<th>Leg</th>";
        tableStr += "<th>Stop</th>";
        tableStr += "<th>Arrival</th>";
        tableStr += "<th>Departure</th>";
        tableStr += "</tr>";
        tableStr += "</thead>";
        tableStr += "<tbody>";

        for(let stopTimeUpdate of stopTimeUpdates){
            let stopName = stopsData.hasOwnProperty(stopTimeUpdate.stopId) ? 
                                stopsData[stopTimeUpdate.stopId] : 
                                `<UNK Stop ID ${stopTimeUpdate.stopId}>`;

            tableStr += "<tr>";
            tableStr += `<td>${stopTimeUpdate.stopSequence}</td>`;
            tableStr += `<td>${stopName}</td>`;
            tableStr += `<td>${posixToStr(stopTimeUpdate.arrival.time)}</td>`;
            tableStr += `<td>${posixToStr(stopTimeUpdate.departure.time)}</td>`;
        }

        tableStr += "</tbody>";
        tableStr += "</table>";

        // Populate the div with the table
        existingTab.empty();
        existingTab.append(header);
        existingTab.append(tableStr);

        i++;
    }

    // Clear out the no longer active tabs
    for(let div of tripStats.children("div")){
        if(!tripsActive.has(div.id)){
            let id = div.id.split("-")[1];

            let input = tripStats.children(`#input-${id}`)[0];
            let thisOneWasChecked = $(input).is(":checked");
            input.remove();
            tripStats.children(`#label-${id}`).remove();
            tripStats.children(`#tripTable-${id}`).remove();
            if(thisOneWasChecked){
                let inputs = tripStats.children("input");
                if(inputs){
                    inputs[0].checked = true;
                }
            }
        }
    }
}

/**
 * Update the following based on the latest realtime data:
 *      - Vehicle markers
 *      - Active Trips
 * @param {Object} realtimeData Realtime feed data from server.
 */
function update(realtimeData){

    if(!map){
        console.log("Nothing to do yet.");
        return;
    }

    updateVehicleMarkers(realtimeData);

    updateTripsTable(realtimeData);
}

function posixToStr(posixNum){
    
    let date = new Date(posixNum * 1000);
    let hours = date.getHours();
    let minutes = "0" + date.getMinutes();
    let seconds = "0" + date.getSeconds();

    // Will display time in 10:30:23 format
    return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
}

// Main
$(document).ready(async function(){

    // Register checks for invalid input to
    // Sample speed box
    $('#sampleSpeeds').change(function() {
        let thisObj = $('#sampleSpeeds');
        let sampleSpeed = thisObj.val();
        if(sampleSpeed < 0.5 || 10 < sampleSpeed){
            alert("Sample speed must be between 0.5 and 10");
            thisObj.val("2.0");
            sampleSpeed = 2;
        }
        postUpdateSampleSpeed(sampleSpeed);
    });
    
    // Register sim check box
    $('#toggleSim').change(function() {
        if(this.checked){
            sampleSpeed = $("#sampleSpeeds").val();
            requestSimulatedFeed(sampleSpeed);
        }
        else{
            requestSimulatedFeedCancel();
        }
    });

    // This method will prepare the map API.
    // And set up the callback to initMap();
    preinitMap(await getAPIKey());

    // Begin polling for realtime feed data
    beginPolling();
});
  