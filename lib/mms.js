"use strict";
var pjson = require('../package.json');
var querystring = require('querystring');
//var http = require('http');
//var https = require('https');
var request = require('request');
var util = require('util');
var url = require('url');

var settings=new Object();
exports.settings = settings;
exports.Session = Session;

function Session(creds) {
    this.creds = creds;

    if(creds.proxy) {
        // Add defaults for proxy to request object
        request = request.defaults({proxy: creds.proxy});
    }

    var urlString = creds.server;
	if(urlString.lastIndexOf('/') != urlString.length - 1) {
		urlString += '/';
	}
	this.baseURLString = urlString;
}

Session.prototype.login = function login(callback) {

    if(!this.creds.username || !this.creds.password) {
        callback(new Error("Username and password are required to authenticate with MMS"));
        return;
    }

	var auth_data = querystring.stringify({
	  'j_username' : this.creds.username,
	  'j_password': this.creds.password
	});

	var headers = {
	    'Content-Type': 'application/x-www-form-urlencoded',
	    'Content-Length': auth_data.length
	};

    var loginURLstring = this.baseURLString + 'j_spring_security_check';

    //
    //  If the credentials included a realmId (and perhaps a token) then they must
    //  be incorporated into the login URL
    //
    if (this.creds.realmId)
    {
        if (this.creds.token)
        {
            loginURLstring += "?realm=" + this.creds.realmId + "&token=" + this.creds.token;
        }
        else
        {
            loginURLstring += "?realm=" + this.creds.realmId;
        }
    }

	var options = {
	  url: url.parse(loginURLstring),
      encoding: 'utf8',
      body: auth_data,
	  method: 'POST',
	  headers: headers
	};

	if(settings.verbose) {
	  console.log('OPTIONS: ' + util.inspect(options));
	}

    var theSession = this;

	var req = request(options,function(err,res,body) {

		if(err) {
            if(callback) {
                return callback(err);
            } else {
                console.log('Error on authentication request: ' + err.message);
                process.exit(1);
            }
        }

		if(settings.verbose) {
		  console.log('STATUS: ' + res.statusCode);
		  console.log('HEADERS: ' + JSON.stringify(res.headers));
		}

        //console.log('HTTP STATUS on login: ' + res.statusCode);

        if(res.statusCode != 302 && res.statusCode != 200) {
            var err = new Error('Unexpected status code from remote service - login failed.');
            err.statusCode = res.statusCode;
            if(callback) {
                return callback(err);
            } else {
                console.log("Error accessing the remote service: " + theSession.creds.server);
                console.log("Returned status: " + res.statusCode);
                process.exit(1);
            }
        }


        var location = res.headers['location'];

        if (location && (location.indexOf("authfail") >= 0))
        {
          var err = new Error('Username/Password invalid - login failed.');
          err.code = 'authfail';
          if(callback) {
            return callback(err);
          } else {
            console.log(err);
            process.exit(1);
          }
          return;
        }

        if(settings.verbose) console.log('Location='+ location);

        //res.setEncoding('utf8');

        // Ignore the body of the MMS login response, since all we need is the Session.cookie to proceed

        theSession.cookie = res.headers['set-cookie'];

        if(settings.verbose) console.log('Session.cookie='+ theSession.cookie);
        if(callback) callback();
	});
}

Session.prototype.directive = function directive(query,expectedErrorCode,callback) {
    // expectedErrorCode is an optional argument
    if (!callback || typeof callback != "function") {
        callback = expectedErrorCode;   // callback must be the second parameter
        expectedErrorCode = undefined;  // no option passed
    }

	this.activeDirectives += 1;

    if(!query.options) {
        query.options = {};
    }

    query.options.taskletId = pjson.name + '-' + pjson.version;

    if(!query || !query.op) {
        var err = new Error("MMS directive must have a query with an operation. Query=" + requestBody)
    }

    var asyncRequest = query.options.async;

    var requestBody = JSON.stringify(query);
	if(settings.verbose) console.log(requestBody);

	var headers = {
	    'Connection': 'keep-alive',
	    'Content-Type': 'application/json',
	    'Content-Length': Buffer.byteLength(requestBody,'utf8'),
	    'Cookie': this.cookie
	};

	var options = {
        url: url.parse(this.baseURLString + 'rest20/directive'),
        encoding: 'utf8',
        body: requestBody,
        method: 'POST',
        headers: headers
	};

    // console.log(util.inspect(options));
    var theSession = this;

    request(options, function(err,res,body) {
        if(err) {
            console.log('Error returned from HTTP request to MMS: ' + err);
            return callback(err);
        }

        if (res.statusCode != 200) {
            var err = new Error("Unexpected status from MMS request: " + res.statusCode);
            err.body = body;
            console.log(err);
            if(res.statusCode === 302) {
                console.log('\nSession is not logged into MMS\n');
            }
            process.exit(1);
            // return callback(err);
        } else {
            // Non-error response should be JSON
            try {
                body = JSON.parse(body);
                if(body.errors && body.errors.length > 0) {
                    if(body.errors[0].code != expectedErrorCode) {
                        console.log('\nError processing MMS request: \n' + util.inspect(query,false,null));
                        console.log('Errors in response: \n' + util.inspect(body,false,null));
                        console.log('Request was: ');
                        console.log(requestBody);
                    }
                }
            } catch(err) {
                // any response other than JSON is likely an internal server error, report it
                console.log('Response to REST call was not JSON.');
                console.dir(err);
                //console.log('Options: ' + util.inspect(options,false,null));
                console.log('Request was: ');
                console.log(requestBody);
                console.log('Response was: ');
                console.log(body);
            }
        }

        if (asyncRequest) {
            //console.log("Request pending...");
            process.stdout.write("Request pending.");
            setTimeout(waitForStatusComplete,5000,theSession,body.requestId,(new Date()).getTime(),callback);
        } else {
		    callback(null,body);
        }
    });
}

function waitForStatusComplete(theSession,requestId,startTime,callback)
{
    //
    //  Build a status request
    //
    var obj = new Object();
    obj.op = "INVOKE";
    obj.targetType = "CdmSession";
    obj.name = "requestStatus";
    obj.params = new Object();
    obj.params.requestId = requestId;

    //console.log('Testing request status...');

    theSession.directive(obj,function(err,restResponse) {
        if (restResponse.requestStatus == 'completed') {
            var now = (new Date()).getTime();
            var elapsed = Math.round((now-startTime)/1000);
            console.log('  RequestId ' + requestId + " completed after " + elapsed + " seconds");
            callback(err,restResponse.requestResponse);
        } else {
            //console.log('Request pending...');
            process.stdout.write(".");
            setTimeout(waitForStatusComplete,5000,theSession,requestId,startTime,callback);
        }
    });

}

function concatStuff() {
    var bufArray = [];
    for(var name in arguments) {
        var row = arguments[name];
        if(typeof row === 'string') {
            bufArray.push(new Buffer(row,'utf8'));
        } else {
            bufArray.push(row);
        }
    }
    return Buffer.concat(bufArray);
}

Session.prototype.console = function (action,parts,callback,useResourceController)
{
    var boundary = "=====PART=====";

    var  CR = "\r";
    var  LF = "\n";
    var  CRLF = CR+LF;
    var content1 = null;
    var content2 = null;
    var content3 = null;

    var buffer = CRLF + "aaa" + CRLF + CRLF;

    var contentType = 'application/zip';
    if(parts.contentType) {
    	contentType = parts.contentType;
    }

    for (var p in parts)
    {
        if (typeof parts[p] == "object")
        {
            var obj = parts[p];

            buffer +=   '--' + boundary + CRLF +
                        'Content-Disposition: form-data; name="' + p + '"; filename="' + obj.filename + '"' + CRLF +
                        'Content-Type: ' + contentType + CRLF +
                        CRLF;

            content1 = buffer;
            content2 = obj.contents;
            buffer = CRLF;
        }
        else
        {
            buffer += '--' + boundary + CRLF + 'Content-Disposition: form-data; name="' + p + '"' + CRLF + CRLF + parts[p] + CRLF;
        }
    }

    buffer += '--' + boundary + '--' + CRLF;

    content3 = buffer;

    var requestBody = concatStuff(content1,content2,content3);
    var contentLength = requestBody.length;

    var headers = {
        'MIME-Version': '1.0',
        'Connection': 'keep-alive',
        'Content-Type' : 'multipart/form-data; boundary=' + boundary,
        'Content-Length': contentLength,
        'Cookie': this.cookie

    };

    var consoleURLString;
    if(useResourceController) {
        consoleURLString = this.baseURLString +'resource';
    } else {
        consoleURLString = this.baseURLString + 'console/' + action;
    }

    var options = {
      url: url.parse(consoleURLString),
      encoding: 'utf8',
      body: requestBody,
      method: 'POST',
      headers: headers
    };

    if (settings.verbose) console.log("Sending Options=" + util.inspect(options));

    request(options, function(err,res,body) {
        if(err) {
            console.log('Error on upload request:');
            console.dir(err);
            process.exit(1);
        }

        if (settings.verbose) {
            console.log('STATUS: ' + res.statusCode);
            console.log('HEADERS: ' + JSON.stringify(res.headers));
        }

        if(res.statusCode === 302) {
            console.log('\nSession may not be logged into MMS\n');
        }

        if (body && (body.indexOf("login") >= 0)) {
            err = new Error('LOGIN UNEXPECTEDLY LOST!');
        }

        callback(err,body);
    });
};

Session.prototype.getResource = function getResource(resourcePath,callback) {
    var headers = {
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Content-Length': 0,
        'Cookie': this.cookie
    };

    var options = {
        url: url.parse(this.baseURLString + 'resource/' + resourcePath),
        encoding: null,
        method: 'GET',
        headers: headers
    };

    //console.dir(options);

    request(options, function(err,res,body) {

        var contentType = res.headers['content-type'];
        var contentHeader = contentType.split(';')
        var mimeType = contentHeader[0];

        var isText;
        switch(mimeType) {
            case 'text/html':
                isText = true;
                break;

            case 'text/javascript':
                isText = true;
                break;

            case 'text/css':
                isText = true;
                break;

            case 'text/cache-manifest':
                isText = true;
                break;

            case 'text/plain':
                isText = true;
                break;

            default:
                isText = false;
        }
        if(isText) {
            var charset;
            if(contentHeader.length > 1) {
                contentHeader.forEach(function(item) {
                    var offset = item.indexOf('charset=');
                    if(offset != -1) {
                        charset = item.substring(offset);
                    }
                });
            }
            if(charset.toLowerCase() === 'utf-8') {
                //console.log('utf8 text file')
                body = body.toString('utf8');
            } else {
                //console.log('assume ascii text file')
                body = body.toString('ascii');
            }
        } else {
            //console.log('binary file')
        }

        if (res.statusCode >= 400) {
            var err = new Error("Error status from MMS request: " + res.statusCode);
            err.body = body;
            console.log(err);
            callback(err);
            return;
        } else {
            //console.log(body.length + ' bytes of data of contentType ' + contentType);
            callback(err,body);
        }
    });
}
