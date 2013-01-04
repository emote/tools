var create = require('./create');
var common = require('./common');
var download = require('./download');

var listMap = {
    app: function(cb) {

        common.global.session.directive({
          "op": "SELECT",
          "targetType": "CdmTasklet",
          "where": {
            "createdBy": {"$ne":"mms"}
          }
        },function(err,res) {
            if(err) common.exit(err.message);
            res.results.forEach(function(row) {
                var version = row.taskletMajorVersion + "." + row.taskletMinorVersion;
                console.log(row.taskletId + " \t" + version + " \t" + row.name + " \t" + row.description );
                // console.log(row);
            });
            cb();
        });
    },
    model: function(cb) {
    },
    proxy: function(cb) { 
    },
    resource: function(cb) {
    },
    sample: function(cb) {
        download.listSamples(cb);
    },
    template: function(cb) {
        create.listTemplates(cb); 
    }
};

exports.doit = doit;
function doit(artifactType,artifactName,callback) {
    var validTypes = common.objToArr(listMap).join(' ');
    if(!artifactType) {
        common.exit("Must specify a type for the 'list' command, one of: " + validTypes);
    }
    var listFunc = listMap[artifactType];
    if(!listFunc) {
        common.exit('Unsupported type for list command: ' + artifactType + ', must be one of: ' + validTypes);
    }
    return listFunc(callback);
}