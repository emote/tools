# Overview

The purpose of the emote tool is to create projects that contain Emotive applications and deploy them to the Emotive
cloud service. The emote project consists of the files that reside on your local file system. The Emotive cloud service
does not keep track of your project. When you deploy a project, the contents the the project, such as apps and
integration proxies, are uploaded to the Emotive cloud service.

## Installing emote

emote is implemented in node.js, which must be installed prior to installing emote. See [here](http://nodejs.org/download/)
for installation instructions. emote requires node.js v0.8.3 or higher.

IMPORTANT: before proceeding to install emote, run this simple test to verify your node.js and node package manager install:

    $ npm install request 

This installs the "request" package, and it insures that npm is configured correctly. Don't skip this step
unless you are already using node in your development system. [If the very first install using npm uses the '-g' option (see below) it triggers a bug in npm that will make later installs difficult.]

emote is then installed using npm, the node package manager. Install with the '-g' option so emote will be available
from the command line.

    $ npm install -g emote

## Example project

Here is an example of creating a project. The commands used are described in more detail below.

    $ emote create myproj
    emote 2.0.9
    Created empty project myproj
    $ cd myproj/
    $ ls
    app   model   profile.json  project.json  proxy
    $ 

emote creates a project directory that contain a project.json file and a subdirectory for app, model, and proxy code.

Project specific settings are stored in project.json. This file is also used to identify the root of a project. If you
are in a project subdirectory and issue an emote command it finds the root of the project by going up the directory
structure until project.json is found.

### Listing available a sample applications

There are a number of sample applications available from the emotive mms. Use the "list" command to see their names:

$ emote list samples
emote 2.0.9
Connecting to MMS as user mark@emotive.com at http://test.mms.emotive.com
sample-usgs                    USGS Earthquake Package
sample-whereami                Where Am I? Share your location
...
$ 

### Downloading a sample application into your project

Use the download command to bring a copy of a sample application into your project:

$ emote download sample sample-usgs
emote 2.0.9
Connecting to MMS as user paul at http://localhost:8080/mms
Finished downloading sample: sample-usgs
$ ls */usgs
app/usgs:
icon114.png   icon48.png    icon72.png    source.js
icon144.png   icon57.png    source.html   source.properties

model/usgs:
model.json

proxy/usgs:
README.md index.js  package.json
$ 

The download commands copies an app, model, and proxy for the USGS Earthquake Package into your project.

### Credentials and the profile.json file

After creating your project, additional emote commands, like list, often require communicating with the Emotive cloud service (MMS). This requires credentials, including the username and password you were provided when signing up to use the Emotive cloud service. The default profile.json created in your project causes emote to prompt for server, username, and password:

    $ cat profile.json 
    {
      "server": "<<Emotive server URL>>http://mms.emotive.com",
      "username": "<<Emotive username>>",
      "password": "<<Emotive password>>"
    }$ 

The << >> notation indicate that the system should prompt. Any value after the << >> is a default value. You can replace the values in this file with your credentials if you want to avoid typing them on each invocation of emote. E.g.

    $ cat profile.json 
    {
      "server": "http://test.mms.emotive.com",
      "username": "me@mydomain.net",
      "password": "<<Emotive password>>"
    }$ 

With this profile.json, it will only prompt for the password, which saves some typing. You could also put your cleartext password in the profile.json if you plan on keeping the file in a secure location.

### Deploying your project to the emotive MMS

The deploy command uploads your app, model, and proxy code to MMS.

$ emote deploy --profile ~/test.json
emote 2.0.9
Connecting to MMS as user mark@emotive.com at http://test.mms.emotive.com
npm http GET https://registry.npmjs.org/request
npm http GET https://registry.npmjs.org/emproxy
npm http 304 https://registry.npmjs.org/emproxy
npm http 304 https://registry.npmjs.org/request
npm http GET https://registry.npmjs.org/emutils
npm http GET https://registry.npmjs.org/portfinder/0.2.1
npm http 304 https://registry.npmjs.org/emutils
npm http 304 https://registry.npmjs.org/portfinder/0.2.1
npm http GET https://registry.npmjs.org/mkdirp
npm http 304 https://registry.npmjs.org/mkdirp
usgs@1.0.0 node_modules/usgs
├── request@2.9.203
└── emproxy@1.0.8 (emutils@1.0.6, portfinder@0.2.1)
Exec'ing query file: model.json
CREATED CdmExternalSystem: usgs
Inserted CdmTypeBinding: Feature
Completed binding of CDM type: Feature
Finished executing directives.
Deployed model usgs
Uploading resource: usgs of length 120377
Deployed proxy usgs
Uploading app: usgs of length 64973
App usgs added
Deployed app usgs
$ 

Note from the example output that deploy has several intermediate steps. First it does a "build" to make sure that the proxies have been installed using npm. The npm install will cause any dependencies to be pull into the staging area. After that, it deploys the model, the proxy, and the app for the USGS sample by uploading them to http://test.mms.emotive.com.

After running emote deploy, you will be able to run the app and view the USGS earthquake data on your mobile device (i.e. iPhone, Android tablet, etc.)

### Adding modules

The "add" command adds additional content to your project. "modules" are created under the app, model, and/or proxy directories. When a "template" is specified for the module being added, emote copies initial code into the module directory. For example, the following command adds a proxy to "myproj":

    $ emote add proxy myprox1 --template Salesforce
    emote 2.0.9
    Adding proxy from template Salesforce
    $ ls proxy
    myprox1
    $ ls proxy/myprox1/
    README.md index.js  package.json
    $ 

In this example, a new proxy, "myprox1" has been added the used the Salesforce template. A proxy that allows easy integration of your app with Salesforce has been included. The Saleforce proxy is a Node.js module. The package.json file contains the parameters needed to deploy this proxy using npm.

In an emote project, modules work to provide the functionality needed by your emotive application. The module name for a proxy and for a model correspond to the "externalSystem" name of your emotive application. In the next example, we add a "model" module to work with our proxy:

    $ emote add model myprox1 --template Salesforce
    emote 2.0.9
    Adding model from template Salesforce
    $ ls model/myprox1/
    salesforce.json
    $ 

The Salesforce template for the model creates a "salesforce.json" file that contains metadata that specifies what Salesforce object you would like to integrate into your appication, and how they correspond with the emotive CDM (common data model.)


# Commands

## create

    emote create <project_name> --template <template_name> --model <model_file.json>

Create a new Emotive project in the current directory. <project_name> is the name is the directory created. Subdirectories
for a model, apps, and proxies are created. If a template is provided, then an initial app is generated based on that
template. Otherwise the "default" template is used. Some templates, including the "default" template require a model
to be provided in JSON format.

Example:

    emote create myproject --template usgs

This uses the "usgs" template to generate an app based on the US Geological Survey earthquake database. A model, a proxy
that fetches data from the USGS feed, and an app to display the data are generated into a directory called "myproject".
 
Here is a second example:

    emote create myproject --model model.json

Where model.json contains:


    {
        "name":"transportation",
        "types": {
            "vehicle":{
                "cost":"Integer",
                "speed":"Integer",
                "name":"String"
                },
            "route":{
                "name":"String",
                "limit":"Integer",
                "surface":"String"
            }
        }
    }


This will use the "default" template to create a basic project with a model containing two CDM types: "vehicle" and "route".
A skeleton of a proxy is generated that produced objects of those types filled with dummy values. No apps are generated.

## deploy

    emote deploy <optional_parameters>

The "deploy" command works within any subdirectory of a project. With no parameters, "deploy" will deploy the model,
the proxies, and all the apps from the project directory. In order to limit the deployment, add a parameter of "model",
"proxy", or "app". "proxy" will deploy all the proxies, unless it is further limited by providing a proxy name.

Example:

    emote deploy proxy usgs

Will deploy the "usgs" proxy that was generated into your project.

Note that until a project has been deployed, the MMS cloud service (at mms.emotive.com) has no knowledge of the project.
By deploying the generated project, the app is made available to users.

## undeploy

This removes objects that have been deployed. E.g.

  emote undeploy app <app_id>

Removes the app identifies by <app_id>.

Undeploy is currently implemented only for app, model, and theme.

Undeploying a model, e.g.

  emote undeploy model

Removes the CdmExternalSystem definitions for the tenant and all bindings to those external systems. It does not remove any CdmType's that were part of the model, but those types will no longer be bound to an external system.

## add

The add command is like the create command, but it just pulls the specified part of a given template and adds it to your project.

Example:

    emote add branding theme default

This take the default "theme" from the "branding" template and adds it to your project.

## log

    emote log <start time> <end time> [--tail] [--local] [--csv]

This displays the log file for your proxy running on the MMS server. The "start time" indicates the stamp of the
earliest message to show. It can be specified in several formats.

* GMT specified as ISO 8601: `2012-09-13T17:30:00`
* Local time specified as ISO 8601 and including the offset to the timezone: `2012-09-13T10:30:00-07:00`
* Local time, assuming your current timezone (the quotes are required): `"2012-09-13 10:30:00"`
* Relative time (as in, "starting 5 minutes ago"): `5m`
* Relative time (as in, "starting 2 hours ago"): `2h`

If you specify just the "start time" you will get all the log entries that have been recorded since that time until the
current moment. If you specify an "end time" as well, you will only see those records between "start" and "end".

You can add the "--tail" option which will show all the records from the "start time" to the present, and then
periodically append new log records as they arrive. (If you specify "--tail" with no "start time" it will assume you wanted "5m".)

The output is normally shown with GMT timestamps, but if you add the "--local" option the timestamps will be converted
to your local time zone (and the times will have an "L" appended to remind you it's not GMT).

The output is normally designed to be human-readable, but you can specify the "--csv" option and the output will be
written in CSV format so it could be fed into another program.

Some common examples:

Show the log data for the previous 5 minutes then tail the log to show new output as it arrives:

    emote log --tail

Show the log data for the previous 2 minutes then tail the log to show new output as it arrives, converting the timestamps to local time:

    emote log 2m --tail --local

Show the log data for a certain date from 9 to 10 am in the local time zone, output in CSV format:

    emote log "2012-09-13 09:00:00" "2012-09-13 10:00:00" --csv


## download

This command will download a previously deployed artifact from the MMS cloud service and save as files in your project
directory. Currently thus is only implemented for apps. The form of the command is:

    emote download app <appId>

Example:

    emote download app usgs

Will download the app with ID "usgs" from you tentant and add it to your current project. Note that your current project
is based on your current directory.

## exec

This takes a parameter which is the name of a file containing JSON for an Array of MMS REST requests. It submits the
requests to MMS synchronously, as a series, and logs the REST responses to stdout.

Example:

    emote exec myfile.json

Where myfile.json contains:

    {"op":"SELECT", "targetType":"CdmExternalSystem"}

Will select a list of the External Systems for your tenant which are registered with MMS and print it to stdout.

## getWsdl

emote getWsdl subproject wsdlUrl service port [username password]

Specify service and port by their simple (unqualified) names. username and password are the credentials (if any)
needed to read the WSDL.  subproject is the name of the subproject you wish to create.

This is the first step in creating a SOAP-service-based subproject.  It will fetch the WSDL for a web service and create three
files in your project's <subproject>/model directory:

* wsdl.json contains a JSON version of the web service's definitions.
* wsdlOps.json contains a list of the web service's operations.
* proxyConfig.json allows you to configure the connection from the generated proxy to toe target SOAP service.

wsdlOps.json determined which web service operations will be part of the generated subproject.  Originally, all of the
operations are disabled (set to false.) Before generating, edit this file to set the desired operations to "true".

proxyConfig.json will optionally pass these connection properties to the generated proxy. (By default, all are set to null,
so the default behavior applies.)

* By default, the proxy will expect to find the SOAP service at the soapAddress given in the WSDL port.  If this is
  incorrect, set the soapAddress property in proxyConfig.json to the correct service endpoint URL.
* By default, no HTTP[S] authentication is used when talking to the SOAP service.  If basic authentication is required,
  set the user name and password in proxyConfig.json.

After editing these two files, use the generateFromWsdl command to generate your subproject.

## generateFromWsdl

emote generateFromWsdl subproject

This will generate a SOAP-service-based subproject.  Before running this, you must use the getWsdl command to load WSDL-based
definitions into your subproject.

## undeploy

emote undeploy theme [themeName]

This will undeploy the theme with the supplied name (defaults to "default" if themeName is omitted).

emote undeploy app taskletId

This will undeploy the application with the supplied taskletId (which is the unique identifier by which an application
known).

Example:

    emote undeploy app ec-HelloWorld


# Credentials

Here are the methods of supplying MMS credential to emote.

## .emote_profile

MMS credentials can be using a ".emote_profile" file, which can be located in the user directory. This is a JSON file. Example:

    {
        "username":"myuser",
        "password":"mypassword",
        "server":"https://mms.emotive.com"
    }

## profile.json in project

If the file "profile.json" is present in the root of a project, it is used for commands within that project. It has
the same format as .emote_profile

## Profile file supplied on command line

The profile file name can also be included as a command line argument:

    emote --profile alt_profile.json <command> ...

## Credentials on command line

A username and password (and optionally a server URL) can be supplied on the command line:

  --password, -p  Emotive password                               
  --username, -u  Emotive username                               
  --server, -s    Emotive server URL [default: "http://mms.emotive.com"]

## Precedence

Starting with the lowest precedence, each source of credential described above overrides the ones before it. So the precedence is:

1. Username and password as command line parameters
2. Profile file on command line
3. "profile.json" in project
4. .emote_profile




# Running standalone tests for a proxy

A project template may generate tests. These will be a in test directory under your project. If you modify proxy code,
it is helpful to run a standalone test of the proxy to make sure it works before deploying it. This is all done with
node.js from the command line, and you should feel free to read and modify the code for both the proxy and the test.

In order to run the test, you must first start your proxy in standalone mode. Example:

    $ pwd
    /Users/mwallace/myproject
    $ echo "{}" | node proxy/usgs/index.js
    port: 9000
    Server listening at URL http://localhost:9000
    Will exit after 300000ms idle time.


This starts the proxy in a terminal window. Note that "echo" is used to pass an initial configuration to the proxy,
which is a empty object in this case. This provides the configuration that the proxy will get from MMS when it
started within the MMS cloud service. The proxy will time out and automatically shut down after it has received no
requests for five minutes. You can restart or terminate the standalone proxy at any time.

Now in another terminal, run the test. You must include the URL at which the proxy is running as a parameter:

Example:

    $ node test/index.js http://localhost:9000
    893 results returned. Truncating to show the first two.
    test response is: { targetType: 'RestResult',
      status: 'SUCCESS',
      count: 893,
      results:
       [ { mag: 1,
           place: '21km N of Borrego Springs, California',
           time: 1344457079,
           tz: -420,
           url: '/earthquakes/eventpage/ci15189473',
           felt: null,
           cdi: null,
           mmi: null,
           alert: null,
           status: 'AUTOMATIC',
           tsunami: null,
           sig: '15',
           net: 'ci',
           code: '15189473',
           ids: ',ci15189473,',
           sources: ',ci,',
           types: ',general-link,general-link,geoserve,nearby-cities,origin,scitech-link,',
           id: 'ci15189473',
           longitude: -116.3642,
           latitude: 33.4518,
           depth: 8.6 },
         { mag: 1.1,
           place: '6km W of Cobb, California',
           time: 1344456943,
           tz: -420,
           url: '/earthquakes/eventpage/nc71828581',
           felt: null,
           cdi: null,
           mmi: null,
           alert: null,
           status: 'AUTOMATIC',
           tsunami: null,
           sig: '19',
           net: 'nc',
           code: '71828581',
           ids: ',nc71828581,',
           sources: ',nc,',
           types: ',general-link,general-link,geoserve,nearby-cities,origin,',
           id: 'nc71828581',
           longitude: -122.7953,
           latitude: 38.8262,
           depth: 3.3 } ] }
    Tests completed.
    $

This confirms that the example proxy is successfully fetching earthquake data from the USGS feed.

