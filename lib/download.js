var async = require('async');
var fs = require('fs');
var path = require('path');
var common = require('./common');
var AdmZip = require('adm-zip');
var emutils = require('emutils');

exports.getResourceAndWriteFiles = getResourceAndWriteFiles;

var resourceNameFuncs = {
    app: function(name) {
        return '/tasklets/'+name+'/';
    },
    sample: function(name) {
        return '/samples/'+name+'.zip';
    }
}

var nonResourceFuncs = {
    type: downloadType
}
function resourceQuery(filter,callback /*(err,result)*/) {
    var query = {
        op: 'SELECT',
        targetType: 'CdmResource',
        properties: ['id','name','description'],
        where: {name: {$regex:filter}},
        options: {limit:9000}
    };
    common.global.session.directive(query,callback);
}

function pad(s,l) {
    while(s.length < l) {
        s += ' ';
    }
    return s;
}

function getResourceAndWriteFiles(artifactType,name,callback) {
    var resourceNameFunc = resourceNameFuncs[artifactType];

    var nonResourceFunc;

    if(!resourceNameFunc) {
        nonResourceFunc = nonResourceFuncs[artifactType];
    }

    if (!resourceNameFunc && !nonResourceFunc) {
        console.log("Unsupported artifact type: " + artifactType);
        process.exit(1);
    }

    if(!common.global.projectHome) {
        common.exit('Must be in a project to use download.');
    }

    common.gotoProjectHome();

    if (nonResourceFunc) {
        return nonResourceFunc(name, callback);
    }

    if(artifactType === 'app') {
        if(!name) {
            common.exit("An app name is required for the download.");
        }
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
                        process.chdir(common.global.projectHome);
                        process.chdir(artifactType);
                        try {
                            fs.mkdirSync(name);
                        } catch(err) {
                            // A directory with name already exists.
                        }
                        process.chdir(name);

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
                callback(err);
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
        try {
            fs.writeFileSync(filename,body);
        } catch(err) {
            console.log('Error downloading file ' + filename);
            if(err.code == 'EACCES') {
                console.log('No permission to write file to current directory: ' + process.cwd());
            } else {
                console.log('Unexpected error: ' + err);
            }
            common.exit();
        }
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
            var savedFunc = console.warn;
            console.warn = function() { }
            var data = zipEntry.getData();
            console.warn = savedFunc;
            writeFileWithPath(zipEntry.entryName,data);
        }
    });
}

function downloadType(typeName, callback) {
    var typeQuery = {
        op: 'SELECT',
        targetType: 'CdmType',
        properties: ['name', 'storage', 'enumeration'],
        where: {name: null}
    };
    var propQuery = {
        op: 'SELECT',
        targetType: 'CdmProperty',
        properties: ['name', 'type', 'cardinality'],
        where: {containingType: null}
    };

    var completeType = {};

    var cdmTypesToProcess = [];

    processType(typeName, false, true, completeType, "type");
    async.forEachSeries(cdmTypesToProcess, processCdmType, typeIsComplete);

    function processType(typeName, isArray, topLevel, parent, propName) {

        switch(typeName) {
            case 'Boolean':
            case 'boolean':
                parent[propName] = isArray ? [true, false] : true;
                break;

            case 'Date':
                parent[propName] = isArray ? [Date.now(), Date.now() + 10] : Date.now();
                break;

            case 'DateString':
                var d1 = '2013-01-23';
                var d2 = '2011-11-03';
                parent[propName] = isArray ? [d1, d2] : d1;
                break;

            case 'Integer':
                parent[propName] = isArray ? [123, -456] : 123;
                break;

            case 'Percent':
                parent[propName] = isArray ? [12.4, 95,2] : 12.4;
                break;

            case 'Real':
                parent[propName] = isArray ? [11.992, -34.7] : 11.992;
                break;

            case 'String':
                parent[propName] = isArray ? ["foo", "bar"] : "foo";
                break;
        }
        if (!parent[propName]) {
            cdmTypesToProcess.push({typeName : typeName, isArray: isArray, topLevel : topLevel, parent : parent, propName : propName});
        }
    }

    function processCdmType(row, cb) {
        typeQuery.where.name = row.typeName;
        common.global.session.directive(typeQuery,function(err, result) {
            if (err) {
                return cb(err);
            }
            else if (result.results.length == 0) {
                if (row.topLevel) {
                    return cb(new Error("There is no type named '" + row.typeName + "'."));
                }
                else {
                    puntOnType(row.typeName, row.isArray, row.parent, row.propName);
                    return cb();
                }
            }
            var theType = result.results[0];
            if (theType.enumeration && theType.enumeration.length > 0) {
                processEnumeration(theType.enumeration, row.isArray, row.parent, row.propName);
                return cb();
            }
            else if (!row.topLevel && theType.storage != "embedded") {
                puntOnType(row.typeName, row.isArray, row.parent, row.propName);
                return cb();
            }

            propQuery.where.containingType = row.typeName;
            common.global.session.directive(propQuery,function(err, result) {
                if (err) {
                    return cb(err);
                }
                var newRow = {};
                if (row.isArray) {
                    row.parent[row.propName] = [newRow];
                }
                else {
                    row.parent[row.propName] = newRow;
                }
                result.results.forEach(function(prop) {
                    if (!emutils.isReservedPropertyName(prop.name, true)) {
                        processType(prop.type, prop.cardinality == "oneToMany", false, newRow, prop.name);
                    }
                });
                cb();
            });
        });
    };

    function typeIsComplete() {
        fs.writeFileSync("types/" + typeName + ".json", JSON.stringify(completeType.type, null, 4) + "\n");
        console.log('Finished downloading type ' + typeName);
        callback();
    }

    function puntOnType(typeName, isArray, parent, propName) {
        var o0 = "(instance of type '" + typeName + "')";
        var o1 = "(first instance of type '" + typeName + "')";
        var o2 = "(second instance of type '" + typeName + "')";
        parent[propName] = isArray ? [o1, o2] : o0;
    }

    function processEnumeration(enumeration, isArray, parent, propName) {
        var o1 = enumeration[0].value;
        var o2 = enumeration.length == 1 ? enumeration[0].value : enumeration[1].value;
        parent[propName] = isArray ? [o1, o2] : o1;
    }
}

