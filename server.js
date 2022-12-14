/*
 * Dependencies
 */
const express = require("express");
const fs = require('fs');
const bodyParser = require('body-parser');
// const { spawn } = require('child_process');
const { parse } = require('csv-parse');
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const StaticCSV = require('./staticcsv');
const { clear } = require("console");

/*
 * Constants and server globals
 */
const DIR_DATA = "./data/";
var staticData = {};
var gtfsShapes = {};
var bounds = {};
var gtfsRoutes = [];
var gtfsStops = [];
const PATH_RT_FEED_DEFAULT = "./rt-feed";
var PATH_RT_FEED = PATH_RT_FEED_DEFAULT;
var mochStreamSampleSpeed = 2000;
var mochStreamCancelFlag = false;

// Keep track of how many times we get a request but don't respond yet
var reqCntNoRes = 0;

/*
 * Express Configurations
 */
var app = express();

/*
 * Server Variables/Data
 */
const PORT = 8080;
const HOST = "localhost";

// Start listening
var server = app.listen(PORT, HOST, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at http://%s:%s", HOST, port);
});

app.use("/dist", express.static('./dist/'));
app.use("/img", express.static('./img/'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/*
 * Helper Functions
 */

function haversine(coord1, coord2){
    const lat1 = coord1["lat"];
    const lon1 = coord1["lng"];
    const lat2 = coord2["lat"];
    const lon2 = coord2["lng"];
    
    const R = 6378137;
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in kmetres
}

/**
 * Utility code that was used to create the sample feed.
 * Not intended for use, but kept in case further samples are needed.
 */
async function _generateMochStream(){
    
    // Select a path from the shapes
    const shapeIds = Object.keys(gtfsShapes)
    if(shapeIds.length < 1) {
        console.log("No shapes on file to mimic.");
        return;
    }
    const shape = gtfsShapes[shapeIds[0]];

    let stops = [
        "7500", "10906", "11422", "4819", 
        "10419", "5585", "7503", "7504", 
        "7505", "7506", "7507", "7508", 
        "7509", "7510"
    ];

    // Pre-determine where the stops are along the path.
    let stopLookup = {};
    for(let stop of gtfsStops){
        let stopLoc = stop["loc"];
        let idx = 1;
        let idxBestFit = 0;
        let deltaMin = 9812738917491;
        for(let coord of shape){
            let delta = Math.abs(stopLoc["lat"] - coord["lat"]) + Math.abs(stopLoc["lng"] - coord["lng"]);
            if(delta < deltaMin){
                deltaMin = delta;
                idxBestFit = idx;
            }
            idx++;
        }

        if(idxBestFit){
            while(stopLookup.hasOwnProperty(idxBestFit)){
                // NOTE: this is a bit of a hack. 
                // If it collides until the end of the list, 
                // we basically just ignore that stop. 
                // This is fine since this is all fake data anyway.
                idxBestFit++;   
            }
            stopLookup[stop["id"]] = idxBestFit;
        }
        else{
            console.log("Could not find index for stop: " + stop);
        }
    }

    console.log(stopLookup);

    let messages = []
    let id = 0;
    let stopIdx = 0;
    let stopNext = stops[stopIdx];
    let odo = 0;
    let prevCoord;
    let hitFirstStop = false;
    let hitLastStop = false;
    for(let coord of shape){
        if(hitLastStop) break;
        id++;

        // We hit a stop, if its one we look for then increment to look at next stop
        let atAStop = false;
        if(stopLookup[stopNext] == id){
            hitFirstStop = true;
            atAStop = true;
            stopIdx++;
            if(stopIdx == stops.length) hitLastStop = true;
            stopNext = stops[stopIdx];
        }

        if(!hitFirstStop) continue;

        // Compute odo and speed
        let speed = 0;
        if(prevCoord){
            let dist = haversine(prevCoord, coord);
            odo += dist;
            speed = dist/5;
        }

        let timeNow = Math.floor(Date.now()/1000);
        let stopTimeUpdates = [];
        for(let i=stopIdx; i<stops.length; i++){

            // NOTE overwrite this even after pre-computed
            let arrivalTime = timeNow + 5*(stopLookup[stops[i]] - id)

            stopTimeUpdates.push({
                stopSequence : i+1,
                stopId: stops[i],
                arrival : {
                    delay : 0,
                    time: arrivalTime,
                },
                departure : {
                    delay : 0,
                    time: arrivalTime + 3,
                },
                scheduleRelationship : 0,
            });
        }

        messages.push({
            header: {
                gtfsRealtimeVersion: "2.0",
                incrementality : "FULL_DATASET",
                timestamp : 1667171917
            },
            entity : [
                {
                    id : `${id}`,
                    tripUpdate : {
                        trip : {
                            tripId : "sample_trip_1",
                        },
                        vehicle : {
                            id : "101",
                        },
                        stopTimeUpdate : stopTimeUpdates,
                        timestamp : timeNow,
                        delay: 0,
                    },
                    vehicle : {
                        trip : {
                            tripId : "sample_trip_1",
                        },
                        vehicle : {
                            id : "101",
                        },
                        position : {
                            latitude : coord["lat"],
                            longitude : coord["lng"],
                            odometer: Math.floor(odo),
                            speed : speed,
                        },
                        currentStopSequence : stopIdx+1,
                        stopId: stopNext,
                        currentStatus : (atAStop)? 1 : 2,
                        timestamp : timeNow,
                    }
                }
            ]
        });

        prevCoord = coord;
    }

    fs.writeFileSync("sample-rt-feed-0.json", JSON.stringify({data: messages}, null, 4), function (err) {
        if (err) {
            console.log(err);
        }
    });

    // Loop through all points along the first route.
    // Just report at whatever the next point is each cycle.
    // let id = 1;
    // for(let coord of shape){

    //     var gtfsRTF = new GtfsRealtimeBindings.transit_realtime.FeedMessage({
    //         header: {
    //             gtfsRealtimeVersion: "2.0",
    //             incrementality : "FULL_DATASET",
    //             timestamp : 1667171917
    //         },
    //         entity : {
    //             id : `${id}`,
    //             tripUpdate : {
    //                 trip : {
    //                     tripId : "sample_trip_1",
    //                 },
    //                 vehicle : {
    //                     id : "101",
    //                 },
    //                 stopTimeUpdate : {

    //                 }
    //             }
    //         }
    //     });

    //     const binData = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(gtfsRTF).finish();
    //     fs.writeFileSync("text-rt-feed", binData, "binary", function (err) {
    //         if (err) {
    //             console.log(err);
    //         }
    //     });
    // }

    let c = 0;
}

/**
 * Sends a moch train on a moch trip,
 * Based on the first route in the routes object.
 */
async function executeMochStream(){

    // Point to a testing location.
    PATH_RT_FEED = "./test-rt-feed";

    fs.readFile("sample-rt-feed-0.json", async function (err, data) {
        if (err) {
            console.log(err);
        }
        else{
            let testData = JSON.parse(data.toString())
            let messages = testData["data"];
            
            // Pre-table the expected id for each stop
            // NOTE this is very specific to this particular sample data
            let stopLookup = testData["stopLookup"];
            
            // NOTE we're gunna get the most out of this foax data.
            // Have 2 trips in parallel that are further up the route
            const numMsgs = messages.length;
            let i0 = 0;
            let i1 = Math.floor(numMsgs / 3);
            let i2 = Math.floor(numMsgs * 2 / 3);
            for(i0; i0 < numMsgs; i0++, i1++, i2++){

                let timeNow = Math.floor(Date.now()/1000);

                let messageFull = messages[i0];
                messageFull.header.timestamp = timeNow;

                // Loop through each "trip"
                let chars = ["a", "b", "c", "d", "e", "f", "g", "h"];
                let n = 0;
                for(let i of [i0, i1, i2]){
                    if(numMsgs <= i) break;
                    
                    let entity = JSON.parse(JSON.stringify(messages[i].entity[0]));

                    // NOTE if the flag is ever raises, end the stream
                    if(mochStreamCancelFlag) {
                        mochStreamCancelFlag = false;
                        writeRTFeed();
                        // Restore path to default.
                        PATH_RT_FEED = PATH_RT_FEED_DEFAULT;
                        return;
                    }

                    let id = entity.id;

                    // Adjust times to be current.
                    entity.tripUpdate.timestamp = timeNow;
                    for(let stu of entity.tripUpdate.stopTimeUpdate){
                        let arrivalTime = timeNow + 5*(stopLookup[stu.stopId] - id)
                        stu.arrival.time = arrivalTime;
                        stu.departure.time = arrivalTime + 3;
                    }
                    entity.vehicle.timestamp = timeNow;
                    
                    // Change the trip ID and train IDs
                    const char = chars[n];
                    entity.id += char;
                    entity.tripUpdate.trip.tripId += char;
                    entity.tripUpdate.vehicle.id += char;
                    entity.vehicle.trip.tripId += char;
                    entity.vehicle.vehicle.id += char;

                    if(i == i0){
                        messageFull.entity = [entity];
                    }
                    else{
                        messageFull.entity.push(entity);
                    }

                    n++;
                }
    
                const binData = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(messageFull).finish();
                writeRTFeed(binData);

                // Sleep 5 seconds
                await new Promise(r => setTimeout(r, mochStreamSampleSpeed));
            }

            // Restore path to default.
            PATH_RT_FEED = PATH_RT_FEED_DEFAULT;
        }
    });
}

/**
 * Load the static datafile into a single object.
 * Loads the following files: shapes, trips, stops, routes.
 * @returns Static data from the static dataset loaded as an object keyed by filename.
 */
async function loadStaticData(){
    return {
        shapes: await loadStaticDataFile("shapes"),
        trips: await loadStaticDataFile("trips"),
        routes: await loadStaticDataFile("routes"),
        stops: await loadStaticDataFile("stops"),
    };
}

/**
 * Load a static data file CSV into memory.
 * ```js
 * [
 *  {col1: col2: ...}
 *  ...
 * ]
 * ```
 * @param {string} filename 
 * @returns The static data file as a list of objects.
 */
async function loadStaticDataFile(filename){

    // Load in the shapes data
    return new Promise(resolve => {
        var static_data = [];
        const csvParser = parse({delimiter: ','});
        const filepath = `${DIR_DATA}/${filename}.txt`;

        fs.createReadStream(filepath)
        .on("error", () => {
            throw `${filepath} is missing.`;
        })
        .pipe(csvParser)
        .on("data", (data) => {
            static_data.push(data);
        })
        .on("end", () => {
            resolve(new StaticCSV(static_data));
        });
    });
}

/**
 * Get the API key from the text file
 * @returns API key as a string.
 */
async function loadAPIKey(){
    return new Promise(resolve => {
        fs.readFile("google-maps-api.key", 'utf-8', function(err, data){
            if(err){
                throw "Missing API key. google-maps-api.key";
            }
            resolve(data);
        })
    });
}


/**
 * Get the realtime feed data from the stream.
 * @returns realtime protobuf object.
 */
async function loadRTFeed(){
    return new Promise(resolve => {
        fs.readFile(PATH_RT_FEED, (err, data) =>{
            if (err) {
                reqCntNoRes++;
                if(reqCntNoRes < 5){ 
                    console.log("Request for data when no feed active.");
                }
                else if(reqCntNoRes == 5){
                    console.log("Request for data when no feed active. (Warning silenced)...");
                }
                resolve({});
            }
            else{
                try{
                    let dataDecoded = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(data);

                    if(reqCntNoRes){ 
                        reqCntNoRes = 0;
                        console.log("Feed is back online.");
                    }

                    resolve(dataDecoded);
                }
                catch(err){
                    // Data is invalid
                    console.log("Data bad >:c")
                    reqCntNoRes++;
                    resolve({});
                }
            }
        });
    });
}

/**
 * Write out binary data to the realtime feed;
 * @param {char[]} binData Binary data to write to the realtime feed.
 */
function writeRTFeed(binData){

    // No binary data provide, then create a default header.
    if(!binData){
        let emptyHeader = {
            header: {
                gtfsRealtimeVersion: "2.0",
                incrementality: 0,
                timestamp : Math.floor(Date.now()/1000),
            }
        };
        binData = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(emptyHeader).finish();
    }

    fs.writeFileSync(PATH_RT_FEED, binData, "binary", function (err) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * 
 * @returns Boundaries as a pair of coords South east and North West.
 */
function computeDefaultBounds(){
    return {
        sw: {lat:39.297218, lng:-76.782691},
        ne: {lat:39.408297, lng:-76.594140},
    };
}

/**
 * Merge a list of shape curves into a single curve.
 * Merge overlapping locations.
 * [oooooooooooooooooo]
 *              [xxxxxxxxxxxxxxxxxxxxxxxxx]
 * [ooooooooooooooooooxxxxxxxxxxxxxxxxxxxx]
 * 
 * NOTE in the case where we receive a shape that is not connected to the others
 * it will be connected wherever the closest end of the shape is.
 * 
 * e.g. The sequence would just append the "start" of 'x'-line to 'o'-line
 *      With no filler added.
 *                          x
 *                         x
 *                        x
 * ooooooooo ---          x
 *              \        x
 *               \       x
 *                ----> x   
 * 
 * @memo The above information means we need to make sure to handle those cases last
 *       Because that may just be the result of reading out of order.
 * @returns A single shape curve.
 */
function mergeShapes(shapes){
    return [
        { lat: 39.408297, lng: -76.782691},
        { lat: 39.407727, lng: -76.781105},
        { lat: 39.407514, lng: -76.780433},
        { lat: 39.407514, lng: -76.780433},
        { lat: 39.407161, lng: -76.779415},
        { lat: 39.407161, lng: -76.779415},
        { lat: 39.406107, lng: -76.775496},
        { lat: 39.406107, lng: -76.775496},
        { lat: 39.405747, lng: -76.773348},
        { lat: 39.405747, lng: -76.773348},
        { lat: 39.405747, lng: -76.773348},
        { lat: 39.40484, lng: -76.769625},
        { lat: 39.403204, lng: -76.766771},
        { lat: 39.400981, lng: -76.764713},
        { lat: 39.398378, lng: -76.763587},
        { lat: 39.395676, lng: -76.76328},
        { lat: 39.392935, lng: -76.763227},
        { lat: 39.389887, lng: -76.762137},
        { lat: 39.38828, lng: -76.760472},
        { lat: 39.386034, lng: -76.757847},
        { lat: 39.384076, lng: -76.755912},
        { lat: 39.381424, lng: -76.754198},
        { lat: 39.379002, lng: -76.753285},
        { lat: 39.376316, lng: -76.752046},
        { lat: 39.373881, lng: -76.74915},
        { lat: 39.372073, lng: -76.74559},
        { lat: 39.372073, lng: -76.74559},
        { lat: 39.372073, lng: -76.74559},
        { lat: 39.372073, lng: -76.74559},
        { lat: 39.371586, lng: -76.744827},
        { lat: 39.370919, lng: -76.7435},
        { lat: 39.369884, lng: -76.741163},
        { lat: 39.369401, lng: -76.738174},
        { lat: 39.369338, lng: -76.735271},
        { lat: 39.369243, lng: -76.731915},
        { lat: 39.368645, lng: -76.729193},
        { lat: 39.365627, lng: -76.7247},
        { lat: 39.363809, lng: -76.722401},
        { lat: 39.362284, lng: -76.721306},
        { lat: 39.36103, lng: -76.7209},
        { lat: 39.360675, lng: -76.720805},
        { lat: 39.360675, lng: -76.720805},
        { lat: 39.360239, lng: -76.720787},
        { lat: 39.360239, lng: -76.720787},
        { lat: 39.357917, lng: -76.720055},
        { lat: 39.355906, lng: -76.716985},
        { lat: 39.354491, lng: -76.712036},
        { lat: 39.354086, lng: -76.710723},
        { lat: 39.35345, lng: -76.708383},
        { lat: 39.353224, lng: -76.707822},
        { lat: 39.352781, lng: -76.706367},
        { lat: 39.352283, lng: -76.705383},
        { lat: 39.351563, lng: -76.704079},
        { lat: 39.351563, lng: -76.704079},
        { lat: 39.351378, lng: -76.703553},
        { lat: 39.351378, lng: -76.703553},
        { lat: 39.351218, lng: -76.703396},
        { lat: 39.351218, lng: -76.703396},
        { lat: 39.349848, lng: -76.701019},
        { lat: 39.348165, lng: -76.697997},
        { lat: 39.347107, lng: -76.695988},
        { lat: 39.347107, lng: -76.695988},
        { lat: 39.347107, lng: -76.695988},
        { lat: 39.346832, lng: -76.695395},
        { lat: 39.346473, lng: -76.694935},
        { lat: 39.346473, lng: -76.694935},
        { lat: 39.346287, lng: -76.694604},
        { lat: 39.346287, lng: -76.694604},
        { lat: 39.345884, lng: -76.693679},
        { lat: 39.345884, lng: -76.693679},
        { lat: 39.345671, lng: -76.693492},
        { lat: 39.344865, lng: -76.691836},
        { lat: 39.343726, lng: -76.689951},
        { lat: 39.342207, lng: -76.685746},
        { lat: 39.340524, lng: -76.680225},
        { lat: 39.33953, lng: -76.677246},
        { lat: 39.337086, lng: -76.673645},
        { lat: 39.336253, lng: -76.672408},
        { lat: 39.334749, lng: -76.669206},
        { lat: 39.334414, lng: -76.667966},
        { lat: 39.332749, lng: -76.666004},
        { lat: 39.330754, lng: -76.664983},
        { lat: 39.329133, lng: -76.664438},
        { lat: 39.328042, lng: -76.664124},
        { lat: 39.326021, lng: -76.663852},
        { lat: 39.32336, lng: -76.662982},
        { lat: 39.320005, lng: -76.658205},
        { lat: 39.318671, lng: -76.654152},
        { lat: 39.318323, lng: -76.653595},
        { lat: 39.31519, lng: -76.64867},
        { lat: 39.314241, lng: -76.647659},
        { lat: 39.311872, lng: -76.644563},
        { lat: 39.310412, lng: -76.642979},
        { lat: 39.307574, lng: -76.639557},
        { lat: 39.305349, lng: -76.63687},
        { lat: 39.304178, lng: -76.635478},
        { lat: 39.304035, lng: -76.633246},
        { lat: 39.303995, lng: -76.628549},
        { lat: 39.301997, lng: -76.623693},
        { lat: 39.30169, lng: -76.623314},
        { lat: 39.30169, lng: -76.623314},
        { lat: 39.301157, lng: -76.622734},
        { lat: 39.299004, lng: -76.621633},
        { lat: 39.297022, lng: -76.621449},
        { lat: 39.293214, lng: -76.621016},
        { lat: 39.291593, lng: -76.620996},
        { lat: 39.290317, lng: -76.620664},
        { lat: 39.289349, lng: -76.617272},
        { lat: 39.289391, lng: -76.615955},
        { lat: 39.289456, lng: -76.61476},
        { lat: 39.289456, lng: -76.61476},
        { lat: 39.289517, lng: -76.61311},
        { lat: 39.289617, lng: -76.610794},
        { lat: 39.289698, lng: -76.608806},
        { lat: 39.289808, lng: -76.60631},
        { lat: 39.289949, lng: -76.604692},
        { lat: 39.290057, lng: -76.603319},
        { lat: 39.29023, lng: -76.600982},
        { lat: 39.290333, lng: -76.599555},
        { lat: 39.290507, lng: -76.598273},
        { lat: 39.291706, lng: -76.594799},
        { lat: 39.293351, lng: -76.594137},
        { lat: 39.294935, lng: -76.594257},
        { lat: 39.294935, lng: -76.594257},
        { lat: 39.295933, lng: -76.594199},
        { lat: 39.295933, lng: -76.594199},
        { lat: 39.297218, lng: -76.594140},
        { lat: 39.297218, lng: -76.594140},
        { lat: 39.297218, lng: -76.594140},
    ];
}

/**
 * Use the static data to determine what routes the system takes
 * @returns Returns the routes detected in the static data.
 */
function determineRoutes(routesCSV, tripsCSV, gtfsShapes){

    // Parse the routes CSV into a more useful structure.
    // We need some basic info for each route, and then the 
    // path data for that route.
    var route_list = [];
    for(let route of routesCSV.rows){
        let route_id = route.route_id;

        // Get every shape associated with this route from the trip records
        let shape_ids = new Set();
        for(let trip of tripsCSV.rows){
            if(trip.route_id == route_id){
                shape_ids.add(trip.shape_id);
            }
        }

        // Merge all shapes into one large shape
        let shapes_path = mergeShapes(Array.from(shape_ids).map(id => gtfsShapes[id]));

        route_list.push({
            id: route_id, 
            color: "#"+route.route_color, 
            name: route.route_long_name,
            path: shapes_path,
        });
    }

    return route_list;
}

/**
 * Use the static data to determine what stops the system has.
 * @returns Returns the stops from the static data.
 */
function determineStops(stopsCSV){

    // This is a pretty linear mapping from rows to this list here,
    // Just keep in mind we don't want to send over anything but type 0's (actual stops)
    // Maybe in the future we could expand this, but not today.
    let stops = [];
    for(let stop of stopsCSV.rows){
        if(stop.location_type != "0") continue;
        stops.push({
            id: stop.stop_id, 
            name: stop.stop_name, 
            loc: {lat: parseFloat(stop.stop_lat), lng: parseFloat(stop.stop_lon)},
        });
    }

    return stops;
}

/**
 * Use the static data to determine what shapes the system has.
 * @returns Returns the shapes from the static data.
 */
function determineShapes(shapesCSV){

    // NOTE: In order to support out of order records,
    // We need to parse each shape into a map first, 
    // this map will key by "shape_pt_sequence" which is an index
    // We will also track min/max index for that shape
    // Then after all data is parsed we can unroll it in order for each shape

    let shapesMap = {};

    for(let {shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence} of shapesCSV.rows){
        let idx = parseInt(shape_pt_sequence);
        if(!shapesMap.hasOwnProperty(shape_id)){
            shapesMap[shape_id] = {path: {}, min: idx, max: idx};
        }

        shapesMap[shape_id]["path"][idx] = {lat: parseFloat(shape_pt_lat), lng: parseFloat(shape_pt_lon)};
        shapesMap[shape_id]["min"] = Math.min(shapesMap[shape_id]["min"], idx);
        shapesMap[shape_id]["max"] = Math.max(shapesMap[shape_id]["max"], idx);
    }
    
    let shapes = {};
    for(let shape_id in shapesMap){
        let {path, max, min} = shapesMap[shape_id];
        
        let pathList = [];
        for(let i = min; i <= max; i++){
            if(path.hasOwnProperty(i)){
                pathList.push(path[i]);
            }
        }

        shapes[shape_id] = pathList;
    }

    return shapes;
}

/*
 * GET Requests
 */

app.get('/', (req, res) => {
    res.sendFile('dist/index.html', { root: __dirname });
});

app.get('/GetAPIKey', (req, res) => {
    res.status(200).send(apiKey);
});

app.get('/GetRoutes', (req, res) => {
    res.status(200).send(gtfsRoutes);
});

app.get('/GetBounds', (req, res) => {
    res.status(200).send(bounds);
});

app.get('/GetStops', (req, res) => {
    res.status(200).send(gtfsStops);
});

app.get('/GetRTFeed', (req, res) => {
    loadRTFeed().then((value) => {
        res.status(200).send(value);
    },
    (_err) =>{
        res.status(503).send("No realtime data on server.");
    });
});

/*
 * POST Requests
 */

app.post('/PostRequestSampleData', (req, res) => {
    console.log("Sample messages requested.");
    mochStreamSampleSpeed = req.body.sampleSpeed * 1000;
    mochStreamCancelFlag = false;
    executeMochStream();
    res.status(200).send();
});

app.post('/PostCancelSampleData', (req, res) => {
    console.log("Cancellation requested.");
    mochStreamCancelFlag = true;
    res.status(200).send();
});

app.post('/PostSampleRateUpdate', (req, res) => {
    mochStreamSampleSpeed = req.body.sampleSpeed * 1000;
    console.log(`Sample speed updated to ${mochStreamSampleSpeed/1000} seconds.`);
    res.status(200).send();
});

async function main(){
    
    try{
        // Load the API key and place it in the html
        apiKey = await loadAPIKey();
        
        // Load up the shapes data
        staticData = await loadStaticData();

        // Determine what the default bounds are based on the data
        bounds = computeDefaultBounds();

        // Extract data from the gtfs static dataset into more easy to read formats
        gtfsStops = determineStops(staticData["stops"]);
        gtfsShapes = determineShapes(staticData["shapes"]);
        gtfsRoutes = determineRoutes(staticData["routes"], staticData["trips"], gtfsShapes);
    }
    catch (err){
        console.log(err);
        console.log("Exiting program...");
    }
}

main();