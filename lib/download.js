var async = require('async');
var fs = require('fs');
var path = require('path');
var common = require('./common');
var AdmZip = require('adm-zip');

exports.getResourceAndWriteFiles = getResourceAndWriteFiles;

var resourceNameFuncs = {
    app: function(name) {
        return '/tasklets/'+name+'/';
    },
    sample: function(name) {
        return '/samples/'+name+'.zip';
    } 
}

function pad(s,l) {
    while(s.length < l) {
        s += ' ';
    }
    return s;
}

function getResourceAndWriteFiles(artifactType,name,callback) {
    var resourceNameFunc = resourceNameFuncs[artifactType];

    if(!resourceNameFunc) {
        console.log("Unsupported artifact type: " + artifactType);
        process.exit(1);
    }

    common.gotoProjectHome();
 
    if(artifactType === 'app') {
        process.chdir(artifactType);
        try {
            fs.mkdirSync(name);
        } catch(err) {
            //console.log(err);
            console.log('A directory with name ' + name + ' already exists.');
            //process.exit(1);
        }
        process.chdir(name);
    }

    var filter = resourceNameFunc(name);

    resourceQuery(filter,function(err,result) {
        if(err) {
            common.exit('Error selecting resource ' + filter + " : " + err);
        }
        if(!result || !result.results) {            
            common.exit('No resource found with name=' + name);
        }
        if(result.results.length === 0) {
            common.exit('No resource found with name=' + name + ". Nothing to download.");            
        }
        if(artifactType != 'app' && result.results.length != 1) {
            console.dir(result);
            common.exit('Server error! Mulitiple resources found with name=' + name + ". Cannot determine which to download.");            
        }
        async.forEachSeries(result.results,
            function(row,cb) {
                var resourceName = row.name.substring(filter.length);
                var resourcePath = row.name;
                if(artifactType === 'app') resourcePath = resourcePath + '?raw=true';
                common.global.session.getResource(resourcePath,function(err,body) {
                    if(artifactType === 'app') {
                        writeFileWithPath(resourceName,body);
                        cb();
                    } else {
                        // body should be a buffer to unzip
                        if(!Buffer.isBuffer(body)) {
                            //console.dir(body);
                            common.exit('Server error! Resource with name=' + name + ' did not return a buffer.');
                        }
                        unzipBuffer(body);
                        cb(); 
                    }
                });
            },
            function(err) {
                console.log('Finished downloading ' + artifactType + ': ' + name);
                callback();
            }
        );
    });
}

function writeFileWithPath(filePath,body) {
    var filename = filePath;
    if (path.sep != '/') {
        filename = filename.replace(/\//g, path.sep);
    }
    if(common.insurePathExists(filename)) {
        fs.writeFileSync(filename,body);
    } else {
        common.exit('Incomplete download. Consider deleting the download from your project before trying again.');
    }    
}

function unzipBuffer(body) {
    var zip = new AdmZip(body);
    var zipEntries = zip.getEntries(); // an array of ZipEntry records
    zipEntries.forEach(function(zipEntry) {
        //console.log(zipEntry.toString());
        if(!zipEntry.isDirectory) {
            writeFileWithPath(zipEntry.entryName,zipEntry.getData());
        }
    });
}

