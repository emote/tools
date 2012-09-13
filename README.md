# Overview

The purpose of the emote tool is to create projects that contain Emotive applications and deploy them to the Emotive cloud service. The emote project consists of the files that reside on your local file system. The Emotive cloud service does not keep track of your project. When you deploy a project, the contents the the project, such as apps and integration proxies, are uploaded to the Emotive cloud service.

## Installing emote

emote is implemented in node.js, which must be installed prior to installing emote. See http://nodejs.org/download/ for installation instructions. emote requires node.js v0.8.0 or higher.

IMPORTANT: before proceding to install emote, run thus simple test to verify your node.js and node package manager install:

$ npm install request

This succeeds installing the "request" package, and it insures that npm is configured correctly. Don't skip this step unless you are already using node of your development system.

emote is then installed using npm, the node package manager. Install with the '-g' option so emote will be available from the command line. Here are some examples.

### Installing from github

You can install a tagged version:

$ npm install -g https://github.com/emote/tools/tarball/v1.0.9

Or just install the latest:

$ npm install -g https://github.com/emote/tools/tarball/master

Note that you may have to use "sudo" to install with '-g':

$ sudo npm install -g https://github.com/emote/tools/tarball/master

### Installing from a local tar file:

$ npm install -g emote.tgz

## Projects

To illustrate a project, here is an example of creating a project. The commands used are described in more detail below.

$ emote create myproj
...
$ cd myproj
$ ls
model   project.json  proxy   app
$ 

emote creates a project directory than contain subdirectories for model, proxy, and app code. 

Project specific settings are stored in project.json. This file is also used to identify the root of a project. If you are in a project subdirectory, and issue an emote command, if fins the root of the project by goping up the directory structure until project.json is found. 

## Templates

When creating a project, you can provide the name of a template that creates a project that contains apps and proxies. This could be an simple example project, or code that you would like to use as a starting point for writing you own Emotive application. The following example uses the 'usgs' template to create an app that will show recent earthqueke in the vicinity of the mobile device:

$ emote create myproj --template usgs
...
$ cd myproj
$ emote deploy

## Development lifecycle example

First set up credentials (see below.)

Then create a project:

$ emote create project myproj

To use other emote commands on the project, your current directory must be within the project or one of its subdirectories.

$ cd myproj

Now you can modify the porject files, such as app or proxy source code, using your choice of editor or IDE. To deploy the project, use:

$ emote deploy

This deploys all models, proxies, apps, and operations to the MMS server. You can also deploy individual parts of the project:

$ emote deploy app

See the commands section below for more detail.

# Credentials

Here are the methods of supplying MMS credential to emote.

## .emote_profile

MMS credentials can be using a ".emote_profile" file, which can be located in the user directory. This is a JSON file. Example:
`
$ cat ~/.emote_profile 
{ "username":"myuser", "password":"mypassword", "server":"https://mms.emotive.com"}
`
## profile.json in project

If the file "profile.json" is present in the root of a project, it is used for commands within that project. It has the same format as .emote_profile 

## Profile file supplied on command line

The profile file name can also be included as a command line argument:

emote --profile alt_profile.json <command> ...

## Credentials on command line

A username and password (and optionally a server URL) can be supplied on the command line:

  --password, -p  Emotive password                               
  --username, -u  Emotive username                               
  --server, -s    Emotive server URL [default: "http://mms.emotive.com"]

## Precendence

Starting with the lowest precendence, each source of credential decribed above overrides the ones before it. So the precedence is:

1. Username and password as command line parameters
2. Profile file on command line
3. "profile.json" in project
4. .emote_profile

# Commands

## create

emote create <project_name> --template <template_name> --model <model_file.json>

Create a new Emotive project in the current directory. <project_name> is the name is the directory created. Subdirectories for a model, apps, and proxies are created. If a template is provided, then an initial app is generated based on that template. Otherwise the "default" template is used. Some templates, including the "default" template require a model ot be provided in JSON format.

Example:

emote create myproject --template usgs

This uses the "usgs" template to generate an app based on the US Geological Survey earthquake database. A model, a proxy that fetch data from the USGS feed, and an app to display the data are generated into a directory called "myproject".
 
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

This will use the "default" template to create a basic project with a model conatining two CDM types: "vehicle" and "route". A skeleton of a proxy is generated that produced objects of those types filled with dummy values. No apps are generated.

## deploy

emote deploy <optional_parameters>

The "deploy" command works within any subdirectory of a project. With no parameters, deploy will deploy the model, annd the proxies, and all the apps from the project directory. In order to limit the deployment, add a parameter of "model", "proxy", or "app". "proxy" will deploy all the proxies, unless it is further limited by providing a proxy name.

Example:

emote deploy proxy usgs

Will deploy the "usgs" proxy that was generated into your project.

Note the until a project has been deployed, the MMS cloud service (at mms.emotive.com) has no knowledge of the project. By deploying the generated project, the app is made available to users.

## add

The add command is like the create command, but it just pulls the specified part of a given template and adds it to you project.

Example:

emote add theme default --template branding

This take the default "theme" from the "branding" template and adds it to your project.

## log

emote log <begin time> 

This tails the log file for your proxy running on the MMS server. The begin time says the earliest time of message to show. It can be an absolute time, e.g. 

emote log 2012-09-13T14:34:28Z

or relative time in minutes:

emote log 5m

The relative time starts the specified number of minute before the present. For example, if you are testing something and it fails, you can show the most recent 5 minutes from the log this way.

## cleanAll

emote cleanAll

This removes all models, proxies and apps from your emotive tenant.

You can run this after using "deploy" to set your account make to it initial state, with no deployed apps.

## download

This command will download a previously deployed artifact from the MMS cloud service and save as files in your project directory. Currently thus is only implemented for apps. The form of the command is:

emote download app <appId>

Example:

emote download app usgs

Will download the app with ID "usgs" from you tentant and add it to your current project. Note that you current project is based on your current directory.

## exec

This take a parameter which is the name of a file containing JSON for an Array of MMS REST requests. It submits the requests to MMS synchronously, as a series, and logs the REST responses to stdout.

Example:

emote exec myfile.json

Where myfile.json contains:

{"op":"SELECT", "targetType":"CdmExternalSystem"}

Will select a list of the External Systems for you tenant which are registered with MMS and print it to stdout.

# Running standalone tests for a proxy

A project template may generate tests. These will be a in test directory under your project. If you modify proxy code, it is helpful to run a standalone test of the proxy to make sure it works before deploying it. This is all done with node.js from the command line, and you should feel free to read and modify the code for both the proxy and the test.

In order to run the test, you must first start your proxy in standalone mode. Example:

$ pwd
/Users/mwallace/myproject
$ echo "{}" | node proxy/usgs/index.js 
port: 9000
Server listening at URL http://localhost:9000
Will exit after 300000ms idle time.

This starts the proxy in a terminal window. Note that "echo" is used to pass an initial configuration to the proxy, which is a empty object in this case. This provide the configuration that the proxy will get from MMS when it it started within the MMS cloud service. The proxy will time out and automatically shut down after it has recieved no requests for five minutes. You can restart or terminate the standalone proxy at any time.

Now in another terminal, run the test. You must include the URL at wihich the proxy is running as a parameter: Example:

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

# Using the Saleforce template

The Salesforce template creates an example Saleforce app. You can use the generated project as a starting point to create apps that access your Salesforce data.

To generate the example Saleforce project:

$ emote create myproject --template salesforceLead

## Stub code for the proxy

There is a built-in proxy for integrating with Salesforce. When using the Saleforce proxy, you will not need to write or modify your own proxy code. You will need to supply a special model for your Saleforce project. This model will create a configuration for your project that will instruct the Salesforce proxy to retrieve data for the objects and fields you need for your app.

In the generated project, there is a proxy called Salesforce. It contains stub code that pulls in the prebuilt Saleforce integration. The code in index.js contain just one line:

require('sfproxy').start();

That starts the Saleforce proxy. In package.json, there is a dependency on sfproxy:

"sfproxy" : "http://download.emotive.com/toolkit/tip/sfproxy.tgz"

That causes the prebuilt Saleforce proxy to be included in the "node_modules" directory.

## The Saleforce model

In the model/Salesforce directory there are two files, creds.json and salesforce.json.

### Credentials

creds.json contains your Saleforce credentials:

{
  "host":"login.salesforce.com",
  "username":"me@mydomain.com",
  "password":"Pa$$w0rd",
  "token":"6dmaI8_salesforce_API_token_Yy0vQR"
}

In your Salesforce account, you will need to enable API access for your username, and obtain an API token.

### Saleforce Objects

The saleforce.json file contains a list of just the Objects and the field from those object that you plan on using in your app. E.g.

{
  "Lead": {
    "target": "Lead",
    "properties": {
      "Name": true,
      "Email": true,
      "Phone": true,
      "Company": true,
      "Description": true
    }

  },
  "Document": {
    "target": "Document",
    "properties": {
      "Name": true,
      "Body": true,
      "ContentType": true
    }
  }
}

The causes CDM types to be created to hold a subset of the field from the Lead and Document objects in Salesforce. The proxy will be automatically configured to retrieve those objects from Salesforce when you query the CDM from your app.




