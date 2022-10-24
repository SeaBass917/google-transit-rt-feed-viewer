
'use strict';

// const https = require('https');
const express = require("express");
const bodyParser = require('body-parser');
const fs = require('fs');
const { spawn } = require('child_process');

const DATA_DIR = "./"

// const options = {
//     key: fs.readFileSync('key.pem'),
//     cert: fs.readFileSync('cert.pem')
// };

/*
 * Express Configurations
 */
var app = express();
app.use("/", express.static(__dirname, +"/www"));
app.use(bodyParser.json({
    limit: '5000mb' // Use this to extend bandwidth from the server
}))
app.use(bodyParser.urlencoded({ // NOTE order matters .json() -> .urlencoded()
    limit: '5000mb',  // Use this to extend bandwidth to the server
    extended: true,
}));


/*
 * Server Variables/Data
 */
var PORT = 8080;

// https.createServer(options, app).listen(PORT);

// Start listening
var server = app.listen(PORT, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at http://%s:%s", host, port);
});

/*
 * Helper Functions
 */

// Covert raw INI string to JSON
// NOTE: its just gunna store strings, no pre-processing
function parseINI(iniStr){
    let data = {}
    let lines = iniStr.split("\n")
    for(let line of lines){
        if (line != ""){
            let keyValPair = line.split("=")
            let key = keyValPair[0]
            let val = keyValPair[1]

            data[key] = val.trim()
        }
    }
    return data
}

function getCoverImageAddress(dir, vol=1){
    let files = fs.readdirSync(dir)
    let coverFileName = `cover_${vol}`
    let coverFileNameAlt = "cover"
    for(let file of files){
        if (file.includes(coverFileName) || file.includes(coverFileNameAlt)) return dir+file
    }
    return null
}

function updateMetaInfo(){
    spawn("python3", ["scripts/verifyMetaData.py"], {stdio: "inherit"})
}

function convertMKVsToMP4(){
    spawn("python3", ["scripts/convertMKVsToMP4.py"], {stdio: "inherit"})
}

/*
 * GET Requests
 */

app.get("/GetMangaSelections", function(req, res){
    console.log("Request made for manga selections.") 

    fs.readdir(DATA_DIR+"manga/", function(err, files){
        if(err) {
            console.log(err)
            res.status(500).send("\tError! Failed to read manga selections from storage.")
        }
        else {
            var data = []
            for(let title of files){
                let metaInfoAddr = `${DATA_DIR}/manga/${title}/info.meta`
                if( fs.existsSync(metaInfoAddr) ){
                    var iniData = parseINI( fs.readFileSync(metaInfoAddr, {encoding:'utf8', flag:'r'}) )
                    data.push(iniData)
                }else{
                    // If its a directory then we're missing a metafile
                    // Otherwise this is just somefile in the manga directory
                    if(fs.lstatSync(`${DATA_DIR}/manga/${title}`).isDirectory()){
                        updateMetaInfo()
                        data.push(null)
                    }
                }
            }
            res.status(200).send(data)
        }
    })
})

app.get("/GetVideoSelections", function(req, res){
    console.log("Request made for anime selections.") 

    fs.readdir(DATA_DIR+"videos/", function(err, files){
        if(err) {
            console.log(err)
            res.status(500).send("\tError! Failed to read video selections from storage.")
        }
        else {
            var data = []
            for(let title of files){
                let metaInfoAddr = `${DATA_DIR}/videos/${title}/info.meta`
                if( fs.existsSync(metaInfoAddr) ){
                    var iniData = parseINI( fs.readFileSync(metaInfoAddr, {encoding:'utf8', flag:'r'}) )
                    data.push(iniData)
                }
                else{
                    // If its a directory then we're missing a metafile
                    // Otherwise this is just somefile in the manga directory
                    if(fs.lstatSync(`${DATA_DIR}/videos/${title}`).isDirectory()){
                        updateMetaInfo()
                        data.push(null)
                    }
                }
            }
            res.status(200).send(data)
        }
    })
})

app.get("/GetMangaIndices", function(req, res){
    let title = req.query.title

    console.log(`Request made for "${title}" indices.`)

    // Build a datastructure that contains
    //   - [] chapters
    //   - {
    //       <title>_v01_c01: [pg1, pg2, ...],
    //       <title>_v01_c02: [pg1, pg2, ...],
    //     }
    var data = {}
    var chapters = []
    var mangaDir = `${DATA_DIR}/manga/${title}/`
    fs.readdir(mangaDir, function(err_ch, files_ch){
        if (err_ch){
            console.log(err_ch)
            res.status(500).send(err_ch)
        }
        else{
            // Loop through each of the chapters(dir) in the directory
            for(let file of files_ch){
                let addr = mangaDir+file
                if(fs.lstatSync(addr).isDirectory()){
                    chapters.push(file)
                    // Open the chapter and read in the filenames
                    try{
                        var files_pg = fs.readdirSync(mangaDir+file)
                        data[file] = files_pg
                    }
                    catch(err_pg){
                        console.log(err_pg)
                    }
                }
            }

            // Send the index data to the client
            data['chapters'] = chapters
            data['mangaDir'] = mangaDir

            res.status(200).send(data)
        }
    })
})

app.get("/GetVideoIndices", function(req, res){
    let title = req.query.title

    console.log(`Request made for "${title}" indices.`)

    // Get the list of videos in this folder
    var episodes = []
    var videoDir = `${DATA_DIR}/videos/${title}/`
    fs.readdir(videoDir, function(err, files){
        if (err){
            console.log(err)
            res.status(500).send(err)
        }
        else{
            // Loop through each of the chapters(dir) in the directory
            for(let file of files){
                if(file.endsWith(".mkv")){
                    episodes.push(file)
                }
            }

            // Send the index data to the client
            res.status(200).send({
                'episodes': episodes,
            })
        }
    })
})

function init(){
    updateMetaInfo()
    convertMKVsToMP4()
}

init()