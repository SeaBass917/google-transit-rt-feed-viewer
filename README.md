# Google Transit Real Time Feed Viewer

## Setup
Get set up with the Google Maps API [https://developers.google.com/maps].

Using Google Maps in a web tool requires a license, which costs money.
I am just one dev with a desire to visualize data and share this tool with others.
For the time being I am going to set up this repo so that anyone can use this tool 
as long as they provide their own key.

(Anyone can set up an account and run a free trial for 3 months).

Once you have access to the API, generate a key and place it in this directory 
under a file named: `google-maps-api.key`.

## TODO
- Support for Alerts.
    - Be nice to have an Alert Queue that you can see the active alarms in.
- Support for newer versions of Google Transit.
    - I saw that this version in NPM doesn't have wheelchair accessibilty.
    - So at some point we should separate from npm and just use the latest protobuf version.