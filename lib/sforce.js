//"use strict";
var querystring = require('querystring');
var http = require('http');
var https = require('https');
var util = require('util');
var url = require('url');
var xml2js = require('xml2js');

var settings=new Object();
exports.settings = settings;
exports.Session = Session;
exports.session = session;

var resourceRoot = '/services/data/v24.0/';
var authResource = '/services/Soap/u/24.0';
//var defaultProdEndpoint = 'https://login.salesforce.com/services/Soap/u/23.0';
//var defaultTestEndpoint =  'https://test.salesforce.com/services/Soap/u/23.0';

//settings.endpoint = defaultProdEndpoint;

var SForceSoapLogin = '';

var sessionCache = new Object();

function session(credentials,callback) {
	// This entry finds a session in the cache or creates one if needed

	if(!(credentials
		&& credentials.username
		&& credentials.password
		&& credentials.token)) 
	{
		callback(new Error('Request must contain Salesforce credentials with username, password, and token.'));
	}

	var sessionKey = credentials.username + credentials.password + credentials.token;
	var sess = sessionCache[sessionKey];
	if(!sess) {
		sess = new Session(credentials);
		sessionCache[sessionKey] = sess;
	}

	sess.credentials = credentials;

	callback(null,sess);
}

function Session(credentials_param,hostString) {
	// This entry always creates a new session
	this.activeRestRequests = 0;
	hostString = hostString || credentials_param.host || settings.endpoint;
	var urlString = 'https://' + hostString + authResource;
	this.parseUrl(urlString);
	this.credentials = credentials_param;
	this.afterLoginQueue = []; 
}

Session.prototype.parseUrl = function(urlString) {
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
}

Session.prototype.login = function(callback) {
	var theSession = this;
	var err;

	theSession.afterLoginQueue.push(callback);
	if(theSession.afterLoginQueue.length > 1) {
		return; // Only one login attempt can run at a time		
	}

	username = this.credentials.username;
	password = this.credentials.password;
	token = this.credentials.token;

	var xmlBody = 
		'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">' +
			'<soapenv:Body>' +
				'<urn:login>' +
					 '<urn:username>' + username + '</urn:username>' +
					 '<urn:password>' + password + token + '</urn:password>' +
				'</urn:login>' +
			'</soapenv:Body>' +
		'</soapenv:Envelope>';
	
	var headers = {
	    'Content-Type': 'text/xml;charset=UTF-8',
	    'Content-Length': Buffer.byteLength(xmlBody,'utf8'),
	    'SOAPAction': '""'
	};

	var options = {
	  host: this.host,
	  port: this.port,
	  path: this.path,
	  method: 'POST',
	  headers: headers
	};

	if(settings.verbose) {
	  console.log('OPTIONS: ' + util.inspect(options));
	}

	var startTime = new Date().getTime();

	var req = this.request(options,function(res) {
		
		if(settings.verbose) {
		  console.log('STATUS: ' + res.statusCode);
		  console.log('HEADERS: ' + JSON.stringify(res.headers));
		}

		var location = res.headers['location'];

		if (location && (location.indexOf("authfail") >= 0)) {
			err = new Object();
			err.message = 'Username/Password invalid - login failed.';
			callback(err);
			return;
		}

		res.setEncoding('utf8');

		var chunks = [];
		res.on('data', function(chunk) {
			//console.log('Chunk: '+chunk);
			chunks.push(chunk);
		});

		res.on('end', function() {
			if(settings.verbose) {
				var elapsedTime = new Date().getTime() - startTime;
				console.log('Saleforce login time = ' + elapsedTime);
			}
			var body = chunks.join('');
			if(settings.verbose) {
				console.log('Login Response:' + body);
			}

			var parser = new xml2js.Parser();
			parser.parseString(body, function (err, root) {
				if(root['soapenv:Body'] && root['soapenv:Body'].loginResponse) {
			        theSession.result = root['soapenv:Body'].loginResponse.result;
			        theSession.parseUrl(theSession.result.serverUrl);

			        if(theSession.result.passwordExpired == 'true') {
						var err = new Error('Salesforce password expired. Log in to Salesforce.com to update password.');
						err.errorCode = 'integration.login.fail.expired';
						theSession.result = null; // Do not pass along sessionId since it will fail downstream
						theSession.afterLogin(err,null);
			        } else {
		        		if(settings.verbose) console.log('LOGIN SUCCESS!');
		        		console.log('Using Salesforce host: ' + options.host);
						theSession.afterLogin(null,theSession);
					}
				} else {
					var err;
					if(root['soapenv:Body'] && root['soapenv:Body']['soapenv:Fault']) {
						var fault = root['soapenv:Body']['soapenv:Fault'];
						if(fault.faultstring) {
							err = new Error(fault.faultstring);
						} else if(fault.faultString) {
							err = new Error(fault.faultString);
						} else {
							err = new Error("Soap fault with no faultstring!");
						}
	        			if(settings.verbose) console.log(err);
					} else {
						err = new Error('Did not receive expected login response from Salesforce.')
						console.log('Login Response:' + body);
					}
					err.errorCode = 'integration.login.fail';
	        		console.log('LOGIN FAILURE');
					theSession.afterLogin(err,null);
				}
			});
		});

	    res.on('error', function(e) {
	        console.log('LOGIN ERROR.');
			theSession.afterLogin(err,null);
		});
 	});

	req.on('error', function(e) {
		var err = new Error('Error on Salesforce authentication request: ' + e.message)
		console.log(err);
		console.log('OPTIONS: ' + util.inspect(options));
	    console.log('LOGIN REQUEST ERROR.');
		theSession.afterLogin(err,null);
	});

	// write data to request body
	req.write(xmlBody);
	req.end();
}

Session.prototype.afterLogin = function(err,sess) {
    if(settings.verbose) console.log('Clearing ' + this.afterLoginQueue.length + ' from afterLoginQueue...');
	for (var i=0; i < this.afterLoginQueue.length; i++) {
		this.afterLoginQueue[i](err,sess);
	}
	this.afterLoginQueue = [];	
}

// function err(e) {
// 	console.log("Salesforce REST request terminated with an error:");
// 	console.log(e.message);
// }

Session.prototype.urlRequest = function(method,resource,query,callback) {
	//return this.restRequest(method,resource,query,callback,true);

	var theSession = this;
	if(!theSession.result) {
		theSession.login(function(err){
			if(err) {
				console.dir(err);
				callback(err);
			} else {
				theSession.urlRequest(method,resource,query,callback);
			}
		});
		return;	
	}

	var headers = {
	    'Connection': 'keep-alive',
	    'Authorization': 'OAuth ' + this.result.sessionId
	};

	var options = {
		host: this.host,
		port: this.port,
		path: resource,
		method: method,
		headers: headers
	};

	var req = this.request(options, function(res) {
		var chunks = [];
		//res.setEncoding('utf8');

		res.on('data', function(chunk) {
			chunks.push(chunk);
		});

		res.on('end', function() {
			if(res.statusCode === 401) {
				console.log('Response status 401');
				console.log('errorCode = '+body[0].errorCode);
				console.log('Attempting to log in again, then retry...');
				theSession.login(function(err){
					if(err) {
						console.dir(err);
						callback(err);
					} else {
						theSession.restRequest(method,resource,query,callback);
					}
				});				
			} else {
				var body = concatenateBuffers(chunks);

				console.log("Response length = " + body.length);

				callback(null,res.statusCode,body);											
			}
		});

    	res.on('error', function(err) {
    		callback(err);
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
	big = new Buffer(total);

	console.log("total length = " + total);

	var offset = 0;
	for (var i = 0; i < buffers.length; i++)
	{
		buffers[i].copy(big, offset);
		offset += buffers[i].length;
	}

	return big;
}

Session.prototype.restRequest = function(method,resource,query,callback,isUrlRequest) {
	var theSession = this;
	if(!theSession.result) {
		theSession.login(function(err){
			if(err) {
				console.dir(err);
				callback(err);
			} else {
				//theSession.result.sessionId += 'NOT!'
				//console.log("logging in before completing request...");
				theSession.restRequest(method,resource,query,callback,isUrlRequest);
			}
		});
		return;	
	}

	var requestBody = null;
	if(query) {
		requestBody = JSON.stringify(query);
	}

	if(settings.verbose) console.log(requestBody);

	var headers = {
	    'Connection': 'keep-alive',
	    'Content-Type': 'application/json',
	    'Authorization': 'OAuth ' + this.result.sessionId
	};

	if(method != 'GET' && requestBody) {
		headers['Content-Length'] = Buffer.byteLength(requestBody,'utf8');
	}

	var path = resource;
	if(path.charAt(0) != '/') {
		path = resourceRoot + path;
	}

	var options = {
		host: this.host,
		port: this.port,
		path: path,
		method: method,
		headers: headers
	};

	//console.log('Making Salesforce REST request with:')
	//console.log(util.inspect(options));

	var startTime = new Date().getTime();
	this.activeRestRequests += 1;

	var req = this.request(options, function(res) {
		if(settings.verbose) {
			console.log('STATUS: ' + res.statusCode);
		  	console.log('HEADERS: ' + JSON.stringify(res.headers));
		  	console.log('In response to:');
			console.dir(options);
			console.log('With body:');
			console.log(requestBody);
		}

		var chunks = [];
		res.setEncoding('utf8');

		res.on('data', function(chunk) {
			//console.log('Chunk: '+chunk);
			chunks.push(chunk);
		});

		res.on('end', function() {
			this.activeRestRequests -= 1;
			if(settings.verbose) {
				var elapsedTime = new Date().getTime() - startTime;
				console.log('Saleforce response time = ' + elapsedTime);
			}

			if(res.statusCode === 401) {
				console.log('Response status 401');
				console.log('errorCode = '+body[0].errorCode);
				console.log('Attempting to log in again, then retry...');
				theSession.login(function(err){
					if(err) {
						console.dir(err);
						callback(err);
					} else {
						theSession.restRequest(method,resource,query,callback);
					}
				});				
			} else if(res.statusCode === 400) {
				console.log('Response status from Salesforce is: 400, MALFORMED REQUEST');
				console.log('Internal error in Emotive Salesforce proxy.');
				console.log('Request resource was: ' + resource);
				console.log('Request body was: ' + requestBody);
				var err = new Error('400, MALFORMED REQUEST: ' + resource + ' ' +requestBody);
				callback(err,res.statusCode,null); // body is the error response
			} else {
				var body = chunks.join('');

				if(body.length > 0 && !isUrlRequest) {
				// Non-error response should be JSON
					try {
						body = JSON.parse(body);
					} catch(err) {
						// any response other than JSON is likely an internal server error, report it
						console.log('Response to REST call was not JSON.');
						console.log('Request was: ');
						console.log(query);
						console.log('Response was: ');
						console.log(body);
						var err = new Error(body);
						callback(err,res.statusCode,null); // body is the error response
						return;
					}
				}
				//if(settings.verbose) console.dir(body);
				callback(null,res.statusCode,body);											
			}
		});

    	res.on('error', function(err) {
    		callback(err);
    	});
	});

	if(requestBody) {
		req.write(requestBody);
	}

	req.end();
}

Session.prototype.getDeleted = function(objectType,startDate,endDate,callback) {
	var theSession = this;
	if(!theSession.result) {
		theSession.login(function(err){
			if(err) {
				console.dir(err);
				callback(err);
			} else {
				theSession.getDeleted(objectType,startDate,endDate,callback);
			}
		});
		return;	
	}

	var xmlBody = 
		'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">' +
    		'<soapenv:Header>' +
	      		'<urn:SessionHeader>' +
	         		'<urn:sessionId>' + this.result.sessionId + '</urn:sessionId>' +
	      		'</urn:SessionHeader>' +
    		'</soapenv:Header>' +
			'<soapenv:Body>' +
				'<urn:getDeleted>' +
         			'<urn:sObjectType>' + objectType + '</urn:sObjectType>' +
         			'<urn:startDate>' + startDate + '</urn:startDate>' +
         			'<urn:endDate>' + endDate + '</urn:endDate>' +
      			'</urn:getDeleted>' +
			'</soapenv:Body>' +
		'</soapenv:Envelope>';
	
	var headers = {
	    'Content-Type': 'text/xml;charset=UTF-8',
	    'Content-Length': Buffer.byteLength(xmlBody,'utf8'),
	    'SOAPAction': '""'
	};

	var options = {
	  host: this.host,
	  port: this.port,
	  path: this.path,
	  method: 'POST',
	  headers: headers
	};

	//console.log('Making Salesforce SOAP/getDeleted request with:')
	//console.log(xmlBody);
	//console.log(util.inspect(options));

	var startTime = new Date().getTime();

	var req = this.request(options, function(res) {
		if(settings.verbose) {
			console.log('STATUS: ' + res.statusCode);
		  	//console.log('HEADERS: ' + JSON.stringify(res.headers));
		  	//console.log('In response to:');
			//console.dir(options);
			//console.log('With body:');
			//console.log(requestBody);
		}

		var chunks = [];
		res.setEncoding('utf8');

		res.on('data', function(chunk) {
			//console.log('Chunk: '+chunk);
			chunks.push(chunk);
		});

		res.on('end', function() {
			if(settings.verbose) {
				var elapsedTime = new Date().getTime() - startTime;
				console.log('Saleforce response time = ' + elapsedTime);
			}

			if(res.statusCode === 401) {
				console.log('Response status 401');
				console.log('errorCode = '+body[0].errorCode);
				console.log('Attempting to log in again, then retry...');
				theSession.login(function(err){
					if(err) {
						console.dir(err);
						callback(err);
					} else {
						theSession.restRequest(method,resource,query,callback);
					}
				});				
			} else if(res.statusCode === 400) {
				console.log('Response status from Salesforce is: 400, MALFORMED REQUEST');
				console.log('Internal error in Emotive Salesforce proxy.');
				console.log('Request resource was: ' + resource);
				console.log('Request body was: ' + requestBody);
				var err = new Error('400, MALFORMED REQUEST: ' + resource + ' ' +requestBody);
				callback(err,res.statusCode,null); // body is the error response
			} else {
				var body = chunks.join('');

				if(body.length > 0) {
					// console.log(body);
					var parser = new xml2js.Parser();
					parser.parseString(body, function (err, root) {
						if(root['soapenv:Body'] && root['soapenv:Body'].getDeletedResponse) {
					        var result = root['soapenv:Body'].getDeletedResponse.result;
							callback(null,result);
						} else {
							var err;
							if(root['soapenv:Body'] && root['soapenv:Body']['soapenv:Fault']) {
								var fault = root['soapenv:Body']['soapenv:Fault'];
								if(fault.faultstring) {
									err = new Error(fault.faultstring);
								} else if(fault.faultString) {
									err = new Error(fault.faultString);
								} else {
									err = new Error("Soap fault with no faultstring!");
								}
								console.log("Error on getDeleted: " + fault.faultstring + " for " 
									+ objectType + " from " + startDate + " to " + endDate);
							} else {
								err = new Error('Did not receive expected response from Salesforce.')
							}
							callback(err,root);
						}
					});
				}
			}
		});

    	res.on('error', function(err) {
    		callback(err);
    	});
	});

	req.write(xmlBody);

	req.end();
}

Session.prototype.upsertDocument = function(params,callback) {
	var theSession = this;
	if(!theSession.result) {
		theSession.login(function(err){
			if(err) {
				callback(err);
			} else {
				theSession.upsertDocument(params,callback);
			}
		});
		return;	
	}

	var xmlBody = 
		'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com" xmlns:urn1="urn:sobject.partner.soap.sforce.com">' +
    		'<soapenv:Header>' +
	      		'<urn:SessionHeader>' +
	         		'<urn:sessionId>' + this.result.sessionId + '</urn:sessionId>' +
	      		'</urn:SessionHeader>' +
    		'</soapenv:Header>' +
			'<soapenv:Body>' +
      			'<urn:upsert>' +
         			'<urn:externalIDFieldName>Name</urn:externalIDFieldName>' +
      				'<urn:sObjects>' +
            			'<urn1:type>Document</urn1:type>' +
      					'<Body>' + params.content + '</Body>' +
      					'<ContentType>' + params.contentType + '</ContentType>' +
      					'<Name>' + params.name + '</Name>' +
      					'<DeveloperName>' + params.name + '</DeveloperName>' +
      					'<FolderId>' + params.folderId + '</FolderId>' +
         			'</urn:sObjects>' +
      			'</urn:upsert>' +
			'</soapenv:Body>' +
		'</soapenv:Envelope>';
	
	var headers = {
	    'Content-Type': 'text/xml;charset=UTF-8',
	    'Content-Length': Buffer.byteLength(xmlBody,'utf8'),
	    'SOAPAction': '""'
	};

	var options = {
	  host: this.host,
	  port: this.port,
	  path: this.path,
	  method: 'POST',
	  headers: headers
	};

	var startTime = new Date().getTime();

	var req = this.request(options, function(res) {
		if(settings.verbose) {
			console.log('STATUS: ' + res.statusCode);
		}

		var chunks = [];
		res.setEncoding('utf8');

		res.on('data', function(chunk) {
			//console.log('Chunk: '+chunk);
			chunks.push(chunk);
		});

		res.on('end', function() {
			if(settings.verbose) {
				var elapsedTime = new Date().getTime() - startTime;
				console.log('Saleforce response time = ' + elapsedTime);
			}

			if(res.statusCode === 401) {
				console.log('Response status 401');
				console.log('errorCode = '+body[0].errorCode);
				console.log('Attempting to log in again, then retry...');
				theSession.login(function(err){
					if(err) {
						callback(err);
					} else {
						theSession.upsertDocument(params,callback);
					}
				});				
			} else if(res.statusCode === 400) {
				console.log('Response status from Salesforce is: 400, MALFORMED REQUEST');
				console.log('Internal error in Emotive Salesforce proxy.');
				console.log('Request resource was: ' + resource);
				console.log('Request body was: ' + requestBody);
				var err = new Error('400, MALFORMED REQUEST: ' + resource + ' ' +requestBody);
				callback(err,res.statusCode,null); // body is the error response
			} else {
				var body = chunks.join('');

				if(body.length > 0) {
					// console.log(body);
					var parser = new xml2js.Parser();
					parser.parseString(body, function (err, root) {
						if(root['soapenv:Body'] && root['soapenv:Body'].upsertResponse) {
					        var result = root['soapenv:Body'].upsertResponse.result;
					        //console.log('Have upsertResponse ' + util.inspect(result,true,null));
					        if(result && result.errors) {
					        	callback(new Error("Error message returned from Salesforce.com: " + util.inspect(result.errors,true,null)));
					        } else {
								callback(null,res.statusCode,result);
							}
						} else {
							var err;
							if(root['soapenv:Body'] && root['soapenv:Body']['soapenv:Fault']) {
								var fault = root['soapenv:Body']['soapenv:Fault'];
								if(fault.faultstring) {
									err = new Error(fault.faultstring);
								} else if(fault.faultString) {
									err = new Error(fault.faultString);
								} else {
									err = new Error("Soap fault with no faultstring!");
								}
								console.log("Error on upsertDocument: " + fault.faultstring );
							} else {
								err = new Error('Did not receive expected response from Salesforce.')
							}
							callback(err,res.statusCode,root);
						}
					});
				}
			}
		});

    	res.on('error', function(err) {
    		callback(err);
    	});
	});

	req.write(xmlBody);
	//console.log(xmlBody);

	req.end();
}



