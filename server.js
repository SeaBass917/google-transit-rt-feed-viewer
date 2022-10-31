/*
 * Dependencies
 */
const express = require("express");
const fs = require('fs');
// const { spawn } = require('child_process');
const { parse } = require('csv-parse');
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const StaticCSV = require('./staticcsv');

/*
 * Constants
 */
const DIR_DATA = "./data/";
var staticData = {};
var gtfsShapes = {};
var bounds = {};
var gtfsRoutes = [];
var gtfsStops = [];

/*
 * Express Configurations
 */
var app = express();

/*
 * Server Variables/Data
 */
var PORT = 8080;

// Start listening
var server = app.listen(PORT, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at http://%s:%s", host, port);
});

app.use("/dist", express.static('./dist/'));

/*
 * Helper Functions
 */

function haversine(coord1, coord2){
    const lat1 = coord1["lat"];
    const lon1 = coord1["lng"];
    const lat2 = coord2["lat"];
    const lon2 = coord2["lng"];
    
    var R = 6378137;
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
async function generateMochStream(){
    
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

            let timeNow = Math.floor(Date.now()/1000);
            
            for(let message of messages){
                let id = message.entity[0].id;

                // Adjust times to be current.
                message.header.timestamp = timeNow;
                message.entity[0].tripUpdate.timestamp = timeNow;
                for(let stu of message.entity[0].tripUpdate.stopTimeUpdate){
                    let arrivalTime = timeNow + 5*(stopLookup[stu.stopId] - id)
                    stu.arrival = arrivalTime;
                    stu.departure = arrivalTime + 3;
                }
                message.entity[0].vehicle.timestamp = timeNow;
    
                const binData = GtfsRealtimeBindings.transit_realtime.FeedMessage.encode(message).finish();
                fs.writeFileSync("test-rt-feed", binData, "binary", function (err) {
                    if (err) {
                        console.log(err);
                    }
                });

                // Sleep 5 seconds
                await new Promise(r => setTimeout(r, 5000));
            }
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
        resolve({});
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
 * Use the static data to determine what routes the system takes
 * @returns Returns the routes detected in the static data.
 */
function determineRoutes(){
    return [
        {
            id: "11682", 
            color: "#008000", 
            name: "METRO SUBWAYLINK",
            path: [
                {lat: 39.408297, lng: -76.782691},
                {lat: 39.407727, lng: -76.781105},
                {lat: 39.407514, lng: -76.780433},
                {lat: 39.407514, lng: -76.780433},
                {lat: 39.407161, lng: -76.779415},
                {lat: 39.407161, lng: -76.779415},
                {lat: 39.406107, lng: -76.775496},
                {lat: 39.406107, lng: -76.775496},
                {lat: 39.405747, lng: -76.773348},
                {lat: 39.405747, lng: -76.773348},
                {lat: 39.405747, lng: -76.773348},
                {lat: 39.40484, lng: -76.769625},
                {lat: 39.403204, lng: -76.766771},
                {lat: 39.400981, lng: -76.764713},
                {lat: 39.398378, lng: -76.763587},
                {lat: 39.395676, lng: -76.76328},
                {lat: 39.392935, lng: -76.763227},
                {lat: 39.389887, lng: -76.762137},
                {lat: 39.38828, lng: -76.760472},
                {lat: 39.386034, lng: -76.757847},
                {lat: 39.384076, lng: -76.755912},
                {lat: 39.381424, lng: -76.754198},
                {lat: 39.379002, lng: -76.753285},
                {lat: 39.376316, lng: -76.752046},
                {lat: 39.373881, lng: -76.74915},
                {lat: 39.372073, lng: -76.74559},
                {lat: 39.372073, lng: -76.74559},
                {lat: 39.372073, lng: -76.74559},
                {lat: 39.372073, lng: -76.74559},
                {lat: 39.371586, lng: -76.744827},
                {lat: 39.370919, lng: -76.7435},
                {lat: 39.369884, lng: -76.741163},
                {lat: 39.369401, lng: -76.738174},
                {lat: 39.369338, lng: -76.735271},
                {lat: 39.369243, lng: -76.731915},
                {lat: 39.368645, lng: -76.729193},
                {lat: 39.365627, lng: -76.7247},
                {lat: 39.363809, lng: -76.722401},
                {lat: 39.362284, lng: -76.721306},
                {lat: 39.36103, lng: -76.7209},
                {lat: 39.360675, lng: -76.720805},
                {lat: 39.360675, lng: -76.720805},
                {lat: 39.360239, lng: -76.720787},
                {lat: 39.360239, lng: -76.720787},
                {lat: 39.357917, lng: -76.720055},
                {lat: 39.355906, lng: -76.716985},
                {lat: 39.354491, lng: -76.712036},
                {lat: 39.354086, lng: -76.710723},
                {lat: 39.35345, lng: -76.708383},
                {lat: 39.353224, lng: -76.707822},
                {lat: 39.352781, lng: -76.706367},
                {lat: 39.352283, lng: -76.705383},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.351378, lng: -76.703553},
                {lat: 39.351378, lng: -76.703553},
                {lat: 39.351218, lng: -76.703396},
                {lat: 39.351218, lng: -76.703396},
                {lat: 39.349848, lng: -76.701019},
                {lat: 39.348165, lng: -76.697997},
                {lat: 39.347107, lng: -76.695988},
                {lat: 39.347107, lng: -76.695988},
                {lat: 39.347107, lng: -76.695988},
                {lat: 39.346832, lng: -76.695395},
                {lat: 39.346473, lng: -76.694935},
                {lat: 39.346473, lng: -76.694935},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.345884, lng: -76.693679},
                {lat: 39.345884, lng: -76.693679},
                {lat: 39.345671, lng: -76.693492},
                {lat: 39.344865, lng: -76.691836},
                {lat: 39.343726, lng: -76.689951},
                {lat: 39.342207, lng: -76.685746},
                {lat: 39.340524, lng: -76.680225},
                {lat: 39.33953, lng: -76.677246},
                {lat: 39.337086, lng: -76.673645},
                {lat: 39.336253, lng: -76.672408},
                {lat: 39.334749, lng: -76.669206},
                {lat: 39.334414, lng: -76.667966},
                {lat: 39.332749, lng: -76.666004},
                {lat: 39.330754, lng: -76.664983},
                {lat: 39.329133, lng: -76.664438},
                {lat: 39.328042, lng: -76.664124},
                {lat: 39.326021, lng: -76.663852},
                {lat: 39.32336, lng: -76.662982},
                {lat: 39.320005, lng: -76.658205},
                {lat: 39.318671, lng: -76.654152},
                {lat: 39.318323, lng: -76.653595},
                {lat: 39.31519, lng: -76.64867},
                {lat: 39.314241, lng: -76.647659},
                {lat: 39.311872, lng: -76.644563},
                {lat: 39.310412, lng: -76.642979},
                {lat: 39.307574, lng: -76.639557},
                {lat: 39.305349, lng: -76.63687},
                {lat: 39.304178, lng: -76.635478},
                {lat: 39.304035, lng: -76.633246},
                {lat: 39.303995, lng: -76.628549},
                {lat: 39.301997, lng: -76.623693},
                {lat: 39.30169, lng: -76.623314},
                {lat: 39.30169, lng: -76.623314},
                {lat: 39.301157, lng: -76.622734},
                {lat: 39.299004, lng: -76.621633},
                {lat: 39.297022, lng: -76.621449},
                {lat: 39.293214, lng: -76.621016},
                {lat: 39.291593, lng: -76.620996},
                {lat: 39.290317, lng: -76.620664},
                {lat: 39.289349, lng: -76.617272},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289456, lng: -76.61476},
                {lat: 39.289456, lng: -76.61476},
                {lat: 39.289517, lng: -76.61311},
                {lat: 39.289617, lng: -76.610794},
                {lat: 39.289698, lng: -76.608806},
                {lat: 39.289808, lng: -76.60631},
                {lat: 39.289949, lng: -76.604692},
                {lat: 39.290057, lng: -76.603319},
                {lat: 39.29023, lng: -76.600982},
                {lat: 39.290333, lng: -76.599555},
                {lat: 39.290507, lng: -76.598273},
                {lat: 39.291706, lng: -76.594799},
                {lat: 39.293351, lng: -76.594137},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.295933, lng: -76.594199},
                {lat: 39.295933, lng: -76.594199},
                {lat: 39.297218, lng: -76.594140},
                {lat: 39.297218, lng: -76.594140},
                {lat: 39.297218, lng: -76.594140},
                {lat: 39.297206, lng: -76.594228},
                {lat: 39.297206, lng: -76.594228},
                {lat: 39.297206, lng: -76.594228},
                {lat: 39.295933, lng: -76.594199},
                {lat: 39.295933, lng: -76.594199},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.294935, lng: -76.594257},
                {lat: 39.291864, lng: -76.594764},
                {lat: 39.290507, lng: -76.598273},
                {lat: 39.290374, lng: -76.600512},
                {lat: 39.290211, lng: -76.602335},
                {lat: 39.289949, lng: -76.604692},
                {lat: 39.289819, lng: -76.607739},
                {lat: 39.2897, lng: -76.610431},
                {lat: 39.289678, lng: -76.611138},
                {lat: 39.289467, lng: -76.614216},
                {lat: 39.289456, lng: -76.61476},
                {lat: 39.289456, lng: -76.61476},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289456, lng: -76.61476},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.289391, lng: -76.615955},
                {lat: 39.290138, lng: -76.620239},
                {lat: 39.29096, lng: -76.621},
                {lat: 39.292228, lng: -76.621099},
                {lat: 39.295128, lng: -76.621274},
                {lat: 39.296266, lng: -76.621278},
                {lat: 39.300188, lng: -76.621732},
                {lat: 39.30169, lng: -76.623314},
                {lat: 39.301997, lng: -76.623693},
                {lat: 39.301997, lng: -76.623693},
                {lat: 39.301997, lng: -76.623693},
                {lat: 39.303764, lng: -76.626823},
                {lat: 39.304114, lng: -76.630114},
                {lat: 39.304025, lng: -76.634832},
                {lat: 39.304754, lng: -76.636118},
                {lat: 39.307315, lng: -76.639165},
                {lat: 39.309885, lng: -76.642289},
                {lat: 39.310792, lng: -76.643398},
                {lat: 39.313358, lng: -76.646372},
                {lat: 39.314902, lng: -76.64836},
                {lat: 39.317653, lng: -76.652212},
                {lat: 39.318323, lng: -76.653595},
                {lat: 39.319709, lng: -76.657267},
                {lat: 39.321512, lng: -76.661876},
                {lat: 39.325405, lng: -76.663892},
                {lat: 39.328042, lng: -76.664124},
                {lat: 39.328042, lng: -76.664124},
                {lat: 39.328042, lng: -76.664124},
                {lat: 39.328042, lng: -76.664124},
                {lat: 39.329133, lng: -76.664438},
                {lat: 39.328301, lng: -76.664199},
                {lat: 39.329133, lng: -76.664438},
                {lat: 39.329133, lng: -76.664438},
                {lat: 39.329133, lng: -76.664438},
                {lat: 39.330322, lng: -76.664793},
                {lat: 39.333067, lng: -76.666159},
                {lat: 39.334414, lng: -76.667966},
                {lat: 39.335857, lng: -76.671788},
                {lat: 39.336675, lng: -76.673012},
                {lat: 39.338698, lng: -76.675751},
                {lat: 39.340173, lng: -76.678975},
                {lat: 39.341509, lng: -76.68346},
                {lat: 39.342918, lng: -76.687871},
                {lat: 39.344449, lng: -76.69125},
                {lat: 39.345171, lng: -76.692547},
                {lat: 39.345884, lng: -76.693679},
                {lat: 39.345884, lng: -76.693679},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.346287, lng: -76.694604},
                {lat: 39.346832, lng: -76.695395},
                {lat: 39.347107, lng: -76.695988},
                {lat: 39.347107, lng: -76.695988},
                {lat: 39.348553, lng: -76.698508},
                {lat: 39.350471, lng: -76.701961},
                {lat: 39.351218, lng: -76.703396},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.351563, lng: -76.704079},
                {lat: 39.352283, lng: -76.705383},
                {lat: 39.353224, lng: -76.707822},
                {lat: 39.353346, lng: -76.708077},
                {lat: 39.35345, lng: -76.708383},
                {lat: 39.35345, lng: -76.708383},
                {lat: 39.35345, lng: -76.708383},
                {lat: 39.35345, lng: -76.708383},
                {lat: 39.354086, lng: -76.710723},
                {lat: 39.354491, lng: -76.712036},
                {lat: 39.35526, lng: -76.714685},
                {lat: 39.356785, lng: -76.719151},
                {lat: 39.359023, lng: -76.720493},
                {lat: 39.360239, lng: -76.720787},
                {lat: 39.360675, lng: -76.720805},
                {lat: 39.36103, lng: -76.7209},
                {lat: 39.36103, lng: -76.7209},
                {lat: 39.36103, lng: -76.7209},
                {lat: 39.362284, lng: -76.721306},
                {lat: 39.365076, lng: -76.72392},
                {lat: 39.367615, lng: -76.727135},
                {lat: 39.368645, lng: -76.729193},
                {lat: 39.369243, lng: -76.731915},
                {lat: 39.369342, lng: -76.734561},
                {lat: 39.369401, lng: -76.738174},
                {lat: 39.369884, lng: -76.741163},
                {lat: 39.370919, lng: -76.7435},
                {lat: 39.372073, lng: -76.74559},
                {lat: 39.372673, lng: -76.746733},
                {lat: 39.372673, lng: -76.746733},
                {lat: 39.372673, lng: -76.746733},
                {lat: 39.374883, lng: -76.750609},
                {lat: 39.376316, lng: -76.752046},
                {lat: 39.378743, lng: -76.753183},
                {lat: 39.381424, lng: -76.754198},
                {lat: 39.384076, lng: -76.755912},
                {lat: 39.386034, lng: -76.757847},
                {lat: 39.38828, lng: -76.760472},
                {lat: 39.389887, lng: -76.762137},
                {lat: 39.392935, lng: -76.763227},
                {lat: 39.395676, lng: -76.76328},
                {lat: 39.398378, lng: -76.763587},
                {lat: 39.400981, lng: -76.764713},
                {lat: 39.403204, lng: -76.766771},
                {lat: 39.405249, lng: -76.770847},
                {lat: 39.405747, lng: -76.773348},
                {lat: 39.405934, lng: -76.774426},
                {lat: 39.405934, lng: -76.774426},
                {lat: 39.406107, lng: -76.775496},
                {lat: 39.406107, lng: -76.775496},
                {lat: 39.407161, lng: -76.779415},
                {lat: 39.407514, lng: -76.780433},
                {lat: 39.407514, lng: -76.780433},
                {lat: 39.407514, lng: -76.780433},
                {lat: 39.407727, lng: -76.781105},
                {lat: 39.407727, lng: -76.781105},
                {lat: 39.407727, lng: -76.781105},
                {lat: 39.407727, lng: -76.781105},
            ]
        }
    ];
}


/**
 * Use the static data to determine what stops the system has.
 * @returns Returns the stops from the static data.
 */
function determineStops(){
    return [
        { id: "7500", name: "OWINGS MILLS STATION (METRO)", loc: {lat: 39.40737188, lng: -76.77988509}},
        { id: "7522", name: "OLD COURT STATION (METRO) nb", loc: {lat: 39.371586, lng: -76.744827}},
        { id: "10906", name: "OLD COURT STATION (METRO) sb", loc: {lat: 39.370976, lng: -76.743454}},
        { id: "7520", name: "MILFORD MILL STATION (METRO) nb", loc: {lat: 39.360239, lng: -76.720787}},
        { id: "11422", name: "MILFORD MILL STATION (METRO) sb", loc: {lat: 39.359036, lng: -76.720413}},
        { id: "7519", name: "REISTERSTOWN PLAZA STATION (METRO) nb", loc: {lat: 39.352283, lng: -76.705383}},
        { id: "4819", name: "REISTERSTOWN PLAZA STATION (METRO) sb", loc: {lat: 39.351609, lng: -76.704034}},
        { id: "10420", name: "ROGERS AVE STATION (METRO) nb", loc: {lat: 39.345171, lng: -76.692547}},
        { id: "10419", name: "ROGERS AVE STATION (METRO) sb", loc: {lat: 39.344504, lng: -76.691204}},
        { id: "5584", name: "WEST COLD SPRING STATION (METRO)", loc: {lat: 39.336675, lng: -76.673012}},
        { id: "5585", name: "WEST COLD SPRING STATION (METRO)", loc: {lat: 39.335899, lng: -76.671734}},
        { id: "7517", name: "MONDAWMIN STATION (METRO) nb", loc: {lat: 39.318323, lng: -76.653595}},
        { id: "7503", name: "MONDAWMIN STATION (METRO) sb", loc: {lat: 39.318333, lng: -76.653735}},
        { id: "7516", name: "PENN NORTH STATION (METRO) nb", loc: {lat: 39.310792, lng: -76.643398}},
        { id: "7504", name: "PENN NORTH STATION (METRO) sb", loc: {lat: 39.309921, lng: -76.642229}},
        { id: "7515", name: "UPTON STATION (METRO) nb", loc: {lat: 39.304754, lng: -76.636118}},
        { id: "7505", name: "UPTON STATION (METRO) sb", loc: {lat: 39.304106, lng: -76.634812}},
        { id: "7514", name: "STATE CENTER (METRO) nb", loc: {lat: 39.301157, lng: -76.622734}},
        { id: "7506", name: "STATE CENTER (METRO) sb", loc: {lat: 39.300234, lng: -76.621616}},
        { id: "7513", name: "LEXINGTON MARKET (METRO) nb", loc: {lat: 39.292228, lng: -76.621099}},
        { id: "7507", name: "LEXINGTON MARKET (METRO) sb", loc: {lat: 39.290968, lng: -76.620923}},
        { id: "7512", name: "CHARLES CENTER (METRO) nb", loc: {lat: 39.289456, lng: -76.61476}},
        { id: "7508", name: "CHARLES CENTER (METRO) sb", loc: {lat: 39.289603, lng: -76.613089}},
        { id: "7509", name: "SHOT TOWER STATION (METRO) sb", loc: {lat: 39.290029, lng: -76.604697}},
        { id: "7511", name: "SHOT TOWER STATION (METRO) nb", loc: {lat: 39.289808, lng: -76.60631}},
        { id: "7510", name: "JOHNS HOPKINS STATION (METRO)", loc: {lat: 39.296583, lng: -76.594166}},
    ];
}

/**
 * Use the static data to determine what shapes the system has.
 * @returns Returns the shapes from the static data.
 */
function determineShapes(){
    return {
        omjh : [
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
        ],
    };
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

app.get('/PostRequestSampleData', (req, res) => {
    executeMochStream();
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
        gtfsRoutes = determineRoutes();
        gtfsStops = determineStops();
        gtfsShapes = determineShapes();

        executeMochStream()
    }
    catch (err){
        console.log(err);
        console.log("Exiting program...");
    }
}

main();