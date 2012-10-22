"use strict";
var util = require('util');
var request = require('request');
var emproxy = require('emproxy');

var hour = 60 * 60 * 1000; // ms in an hour
var day = 24 * hour;
var week = 7 * day;

emproxy.init(function afterInitCallback(initialConfig) {
    emproxy.start(processDirective);
});

// http://earthquake.usgs.gov/earthquakes/feed/geojson/1.0/hour
// http://earthquake.usgs.gov/earthquakes/feed/geojson/1.0/day
// http://earthquake.usgs.gov/earthquakes/feed/geojson/1.0/week
// http://earthquake.usgs.gov/earthquakes/feed/geojson/2.5/month

function processDirective(restRequest,callback) {
    if (restRequest.op == "INVOKE" && restRequest.name == "login") {
        // This will be called only if delegated authorization is enabled
        // We will accept all requests where the password is the same as the username converted to uppercase
        var ok = false;
        var creds = restRequest.options.credentials;
        if (creds && creds.username) {
            ok = creds.password == creds.username.toUpperCase();
        }
        if (ok) {
            return callback(null, { status:"SUCCESS" } );
        }
        else {
            return callback(new Error("Invalid credentials"));
        }
    }
    else if(restRequest.targetType != 'Feature') {
        console.log('USGS Proxy only returns Feature objects, unknown type requested: ' + restRequest.targetType)
    }

    var usgs_url = 'http://earthquake.usgs.gov/earthquakes/feed/geojson/1.0/';
    var period = 'week'; // default

    // where clause may contain an external timestamp (ms since epoch, 1970)
    if(restRequest.where){
        if(restRequest.where.externalTimestamp) {

            var now = (new Date()).getTime();
            var interval = now - restRequest.where.externalTimestamp;

            if(interval < hour) {
                period = 'hour';
            } else if(interval < day) {
                period = 'day';
            }
        }
    }

    var url = usgs_url + period;

    request(url, function (error, response, body) {
        //console.log("USGS returns: " + body);
        var err = null;
        var restResponse;
        if (error) {
            err = new Error('Unexpected error contacting USGS');
            err.url = url;
            err.cause = error;
        } else {
            if(response.statusCode == 200) {
                try {
                    restResponse = convertGeoJSON(JSON.parse(body));
                } catch(err2) {
                    console.log('USGS data was not in GeoJSON format: ' + err2);
                    err = new Error('USGS data was not in GeoJSON format.');
                    err.cause = err2;
                    err.url = url;
                    err.body = body;
                }
            } else {
                err = new Error('USGS returned unexpected HTTP status code: ' + response.statusCode);
                err.url = url;
            }
        }
        callback(err,restResponse);
    });
    
}

function convertGeoJSON(input) {
    var features = input.features;
    if(!util.isArray(features)) {
        console.log('Does not contain an array of Feature objects');
        throw new Error('Does not contain an array of Feature objects');
    }

    var restResult = {
        targetType : 'RestResult',
        status : 'SUCCESS',
        count : features.length,
        results : []
    };

    features.every(function(feature) {
        var row = feature.properties;
        row.id = feature.id;
        var coords = feature.geometry.coordinates;
        row.longitude = coords[0];
        row.latitude = coords[1];
        row.depth = coords[2];

        restResult.results.push(row);
        return true;
    });
    return restResult;
}
