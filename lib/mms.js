"use strict";
var querystring = require('querystring');
var http = require('http');
var https = require('https');
var util = require('util');
var url = require('url');

var settings=new Object();
exports.settings = settings;
exports.Session = Session;

function Session(urlString) {
	this.activeDirectives = 0;
    this.directivesDidCompleteQueue = [];

    //
    //  If the command line contained multiple "--server" parameters optimist will have turned
    //  the parameter into an array. If we find that situation just take the first value.
    //
    if (urlString.pop)
    {
        urlString = urlString[0];
    }

    //
    //  Implement the conventions used in the groovy scripts
    //
    switch (urlString)
    {
        case 'test':
            urlString = 'https://test.mms.emotive.com';
            break;

        case 'prod':
            urlString = 'https://mms.emotive.com';
            break;

        case 'dev':
            urlString = 'http://emotive-dev.elasticbeanstalk.com';
            break;

        case 'sandbox':
            urlString = 'https://sandbox.emotive.com';
            break;

        default:
            break;
    }

	if(urlString.lastIndexOf('/') != urlString.length - 1) {
		urlString += '/';
	}
	var serverURL = url.parse(urlString);
	if(serverURL.protocol === 'https:') {
		this.request = https.request;
		this.port = serverURL.port || 443;
	} else {
		this.request = http.request;
		this.port = serverURL.port || 80;
	}
	this.host = serverURL.hostname;
	this.path = serverURL.pathname;
	if(serverURL.auth) {
		var unpw = serverURL.auth.split(':');
		this.username = unpw[0];
		this.password = unpw[1];
	}
}

Session.prototype.login = function login(username,password,callback) {
    // Callback can be first parameter if username and password are not passed in
    if(typeof username === "function") {
        callback = username;
        username = undefined;
        password = undefined;
    }

	this.username = username || this.username;
	this.password = password || this.password;

    if(!this.username || !this. password) {
        callback(new Error("Username and password are required to authenticate with MMS"));
        return;
    }

    //
    //  If the command line contained multiple "--username" parameters optimist will have turned
    //  the parameter into an array. If we find that situation just take the first value.
    //
    if (this.username.pop)
    {
        this.username = this.username[0];
    }

    //
    //  If the command line contained multiple "--password" parameters optimist will have turned
    //  the parameter into an array. If we find that situation just take the first value.
    //
    if (this.password.pop)
    {
        this.password = this.password[0];
    }

	var auth_data = querystring.stringify({
	  'j_username' : this.username,
	  'j_password': this.password
	});

	var headers = {
	    'Content-Type': 'application/x-www-form-urlencoded',
	    'Content-Length': auth_data.length
	};

	var options = {
	  host: this.host,
	  port: this.port,
	  path: this.path+'j_spring_security_check',
	  method: 'POST',
	  headers: headers
	};

	if(settings.verbose) {
	  console.log('OPTIONS: ' + util.inspect(options));
	}

    var theSession = this;

	var req = this.request(options,function(res) {
		
		if(settings.verbose) {
		  console.log('STATUS: ' + res.statusCode);
		  console.log('HEADERS: ' + JSON.stringify(res.headers));
		}

	  var location = res.headers['location'];
	  
	  if (location && (location.indexOf("authfail") >= 0))
	  {
	      var err = new Error('Username/Password invalid - login failed.');
          console.log(err);
	      if(callback) {
            callback(err);
          } else {
            process.exit(1);
          }
          return; 
	  }
	  
	  if(settings.verbose) console.log('Location='+ location);
	  
	  res.setEncoding('utf8');
	  res.on('data', function (chunk) {
	  	// Ignore the body of the MMS login response, since all we need is the Session.cookie to proceed
	    //console.log('UNEXPECTED BODY IN AUTHENTICATION RESPONSE: ' + chunk);
	  });
	  theSession.cookie = res.headers['set-cookie'];
	  if(settings.verbose) console.log('Session.cookie='+ theSession.cookie);
	  if(callback) callback();
	});

	req.on('error', function(e) {
        console.log('Error on authentication request: ' + e.message);
        console.log('OPTIONS: ' + util.inspect(options));
        if(callback) {
            callback(e);
        } else {
            process.exit(1);
        }
	});

	// write data to request body
	req.write(auth_data);
	req.end();
}

Session.prototype.directive = function directive(query,expectedErrorCode,callback) {
    // expectedErrorCode is an optional argument
    if (!callback || typeof callback != "function") {
        callback = expectedErrorCode;   // callback must be the second parameter
        expectedErrorCode = undefined;  // no option passed
    }

	this.activeDirectives += 1;

    var requestBody = JSON.stringify(query);
    if(!query || !query.op) {
        var err = new Error("MMS directive must have a query with an operation. Query=" + requestBody)
    }
  
    var asyncRequest = (query.options && query.options.async);

	if(settings.verbose) console.log(requestBody);

	var headers = {
	    'Connection': 'keep-alive',
	    'Content-Type': 'application/json',
	    'Content-Length': Buffer.byteLength(requestBody,'utf8'),
	    'Cookie': this.cookie
	};

	var options = {
	  host: this.host,
	  port: this.port,
	  path: this.path + 'rest20/directive',
	  method: 'POST',
	  headers: headers
	};

    // console.log(util.inspect(options));
    var theSession = this;

    var req = this.request(options, function(res) {
//console.log('Options: ' + util.inspect(options,false,null));
//console.log('MMS status code returned: ' + res.statusCode);
        var chunks = [];
        res.setEncoding('utf8');

        res.on('socket', function(socket) {
            socket.setTimeout(0);
        });

        res.on('data', function(chunk) {
            //console.log('Chunk: '+chunk);
            chunks.push(chunk);
        });

        res.on('end', function() {
            var body = chunks.join('');
            if (res.statusCode != 200) {
                var err = new Error("Unexpected status from MMS request: " + res.statusCode);
                err.body = body;
                console.log(err);
                if(res.statusCode === 302) {
                    console.log('\nSession may not be logged into MMS\n');
                }
                callback(err);
                return;
            } else {
                // Non-error response should be JSON
                try {
                    body = JSON.parse(body);
                    if(body.errors && body.errors.length > 0) {
                        if(body.errors[0].errorCode != expectedErrorCode) {
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

            theSession.activeDirectives -= 1;

            if (asyncRequest) {
                //console.log("Request pending...");
                process.stdout.write("Request pending.");
                setTimeout(waitForStatusComplete,5000,theSession,body.requestId,(new Date()).getTime(),callback);
            } else {
			    callback(null,body);
            }

            if(theSession.activeDirectives === 0) {
                process.nextTick(function() {
                    for (var i=0; i < theSession.directivesDidCompleteQueue.length; i++) {
                        theSession.directivesDidCompleteQueue[i]();
                    }
                    theSession.directivesDidCompleteQueue = [];  
                });
            }

		});
		
        res.on('error', function(err) {
            console.log('Error returned from HTTP request to MMS: ' + err);
        });
    });

	req.write(requestBody);
	req.end();
}

Session.prototype.onDirectivesComplete = function onDirectivesComplete(callback) {
    this.directivesDidCompleteQueue.push(callback);
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
    
    var contentLength = content1.length + content2.length + content3.length;
    
    var headers = {
        'MIME-Version': '1.0',
        'Connection': 'keep-alive',
        'Content-Type' : 'multipart/form-data; boundary=' + boundary,
        'Content-Length': contentLength,
        'Cookie': this.cookie
        
    };

    var options = {
      host: this.host,
      port: this.port,
      path: this.path + 'console/' + action,
      method: 'POST',
      headers: headers
    };

    if(useResourceController) {
    	options.path = this.path +'resource';
    }

  if (settings.verbose) console.log("Sending Options=" + util.inspect(options));

  var req = this.request(options, function(res) {
        if (settings.verbose) {
            console.log('STATUS: ' + res.statusCode);
            console.log('HEADERS: ' + JSON.stringify(res.headers));
        }
        
        var chunks = [];
        res.setEncoding('utf8');

        res.on('data', function(chunk) {
            //console.log('onData');
            chunks.push(chunk);
        });

        res.on('end', function() {
            //console.log('onEnd');
            var body = chunks.join('');
            var err;

            if(res.statusCode === 302) {
                console.log('\nSession may not be logged into MMS\n');
            }

            if (body && (body.indexOf("login") >= 0)) {
                err = new Error('LOGIN UNEXPECTEDLY LOST!');
            }

            callback(err,body);
        });

        res.on('error', function(err) {
            console.log('Error returned from console request to MMS: ' + err);
            callback(err);
        });
  });

  req.write(content1);
  req.write(content2);
  req.write(content3);
  req.end();
};

Session.prototype.getResource = function getResource(resourcePath,callback) {
    var headers = {
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Content-Length': 0,
        'Cookie': this.cookie
    };

    var options = {
      host: this.host,
      port: this.port,
      path: this.path + 'resource/' + resourcePath,
      method: 'GET',
      headers: headers
    };

    //console.dir(options);

    var req = this.request(options, function(res) {
        var chunks = [];

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
                res.setEncoding('utf8');
                //console.log('utf8 text file')
            } else {
                res.setEncoding('ascii');               
                //console.log('assume ascii text file')
            }
        } else {
            //console.log('binary file')
        }

        //console.log('contentType is '+contentType);
 
        res.on('data', function(chunk) {
            //console.log('Chunk: '+chunk);
            chunks.push(chunk);
        });

        res.on('end', function() {
            var body;
            if(isText) {
                body = chunks.join('');
            } else {
                body = concatenateBuffers(chunks);
            }
            if (res.statusCode >= 400) {
                var err = new Error("Error status from MMS request: " + res.statusCode);
                err.body = body;
                console.log(err);
                callback(err);
                return;
            } else {
                //console.log(body.length + ' bytes of data of contentType ' + contentType);
                callback(null,body,isText);
            }
        });
        
        res.on('error', function(err) {
            console.log('Error returned from HTTP request to MMS: ' + err);
        });
    });

    req.end();
}

function concatenateBuffers(buffers) {
    // Handle simple cases simply
    if (buffers.length == 0)
    {
        return new Buffer(1);
    }
    else if (buffers.length == 1)
    {
        return buffers[0];
    }

    var total = 0;
    for (var i = 0; i < buffers.length; i++)
    {
       total += buffers[i].length;
    }
    var big = new Buffer(total);

    var offset = 0;
    for (var i = 0; i < buffers.length; i++)
    {
        buffers[i].copy(big, offset);
        offset += buffers[i].length;
    }
    return big;
}
