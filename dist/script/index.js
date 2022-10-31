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

const POLLING_INTERVAL = 5000; //ms
var   READY_TO_POLL    = false;

const GET_API_KEY = "/GetAPIKey";
const GET_RT_FEED = "/GetRTFeed";
const GET_ROUTES  = "/GetRoutes";
const GET_BOUNDS  = "/GetBounds";
const GET_STOPS   = "/GetStops";

const stopsColor = "#6a3d9a";
const colorTable = [
    "#66c2a5","#fc8d62","#8da0cb","#e78ac3",
    "#a6d854","#ffd92f","#e5c494","#b3b3b3"
];
var colorIndex = 0;

var drawnRouteLines = [];

var stopPopups = {};

var trainMarkers = [];

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
 * Update the following based on the latest realtime data:
 *      - Vehicle markers
 *      - Active Trips
 * @param {Object} realtimeData Realtime feed data from server.
 */
function update(realtimeData){
    if(!map){
        console.log("Nothing to do yet.");
    }
    
    console.log(realtimeData)

    let pos = realtimeData.entity[0].vehicle.position
    
    beachMarker = new google.maps.Marker({
        position: { lat: pos.latitude, lng: pos.longitude },
        map,
        // icon: "img/toy-train.png",
    });
}

// Main
$(document).ready(async function(){

    // This method will prepare the map API.
    // And set up the callback to initMap();
    preinitMap(await getAPIKey());

    // Begin polling for realtime feed data
    beginPolling();
});
  