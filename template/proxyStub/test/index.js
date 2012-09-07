var request = require('request');
var util = require('util');

var proxyURL = process.argv[2];

function testRequest(req,cb) {
    request({
        uri: proxyURL,
        method: "POST",
        json: req
    },function(error,response,body) {
        if(error) {
            console.log(util.inspect(error,false,null));
        } else if(response.statusCode != 200) {
            console.log("unexpected status code: " + response.statusCode != 200);
        } else {
            if(body.results && body.results.length > 2) {
                console.log(body.results.length + ' results returned. Truncating to show the first two. ');
                body.results = body.results.slice(0,2);
            }
            console.log('test response is: ' + util.inspect(body,false,null));
            cb();
        }
    });    
}
/*block:A loop types */
function substitute0/*'test'+count*/(err,responseBody) {
    testRequest(
        {op: "SELECT", targetType: "/*insert: index */"},
        substitute0/*(!isLast ? 'test'+(count+1) : 'complete')*/);
}
/*block:A end */
function complete() {
    console.log("Tests completed.");
}

test0();
