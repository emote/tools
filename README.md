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


