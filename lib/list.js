var create = require('./create');
var common = require('./common');
var download = require('./download');
var util = require('util');

var attributes;

var listMap = {
    app: function(name,cb) {

        common.global.session.directive({
            "op": "SELECT",
            "targetType": "CdmTasklet",
            "where": {"createdBy": {"$ne":"mms"}},
            "options": {"limit": 1000}
        },function(err,res) {
            if(err) common.exit(err.message);
            formatOutput(res.results,["taskletId","name","description"]);
            cb();
        });
    },
    externalSystem: function(name,cb) {

        common.global.session.directive({
            "op": "SELECT",
            "targetType": "CdmExternalSystem",
            "properties": attributes,
            "options": {"limit": 1000}
        },function(err,res) {
            if(err) common.exit(err.message);
            formatOutput(res.results,attributes);
            cb();
        });
    },
    model: function(name,cb) {
        if(name) {
            var operation = null;
            var s = name.split('.');
            if(s[1]) {
                name = s[0];
                operation = s[1];
            }

            if(operation) {
                common.global.session.directive({
                    "op": "SELECT",
                    "targetType": "CdmOperation",
                    "where":{ "objectType": name, "name": operation },
                    "properties": [],
                    "options": {"limit": 1000}
                },function(err,res) {
                    if(err) common.exit(err.message);
                    console.log(util.inspect(res.results,false,null));
                    cb();
                });
            } else {
                common.global.session.directive({
                    "op": "SELECT",
                    "targetType": "CdmProperty",
                    "where":{ "containingType": name },
                    "properties": attributes,
                    "options": {"limit": 1000}
                },function(err,res) {
                    if(err) common.exit(err.message);
                    formatOutput(res.results,attributes);

                    console.log(); // blank space between properties and operations

                    common.global.session.directive({
                        "op": "SELECT",
                        "targetType": "CdmOperation",
                        "where":{ "objectType": name },
                        "properties": attributes,
                        "options": {"limit": 1000}
                    },function(err,res) {
                        if(err) common.exit(err.message);
                        formatOutput(res.results,attributes);
                        cb();
                    });

                    cb();
                });
            }
        } else {
            // var props = ["name", "targetType", "version", "createdBy", "createdAt", "lastModifiedBy", "lastModifiedAt"];
            var props = attributes;
            common.global.session.directive({
                "op": "SELECT",
                "targetType": "CdmType",
                "properties": props,
                "options": {"limit": 1000}
            },function(err,res) {
                if(err) common.exit(err.message);
                formatOutput(res.results,props);
                cb();
            });

        }
    },
    proxy: function(name,cb) { 
    },
    resource: function(name,cb) {
        attributes.push("tenantId");
        var query = {
            "op": "SELECT",
            "targetType": "CdmResource",
            "properties": attributes,
            "where": {"name": {"$regex": "^(?!\\/tasklets\\/).+"}},
            "options": {"limit": 1000}
        };
        if(!common.global.argv.includeGlobal) {
            query.where.tenantId = {"$ne": 1};
        }
        common.global.session.directive(query,function(err,res) {
            if(err) common.exit(err.message);
            formatOutput(res.results,attributes);
            cb();
        });
    },
    sample: function(name,cb) {
        download.listSamples(cb);
    },
    template: function(name,cb) {
        create.listTemplates(cb); 
    }
};

var space60 = "                                                            ";
var dash60  = "------------------------------------------------------------";
var abbreviatedHeading = {
    "lastModifiedBy":"lastModifiedBy" 
};

function getHeading(column) {
    return (abbreviatedHeading[column] ? abbreviatedHeading[column] : column);
}

function formatOutput(list,columns) {
    var argv = common.global.argv;
    if(argv.separator) {
        var sep = argv.separator.replace(/\\t/g,'\t');
        list.forEach(function(row) {
            var line = [];
            columns.forEach(function(column) {
                line.push(renderValue(row[column],column));
            });
            console.log(line.join(sep));
        });

    } else {
        columnarOutput(list,columns);
    }
}


var standardFormat = {
    "createdAt": renderDate, 
    "lastModifiedAt": renderDate
};

function renderDate(val) {
    var date = new Date(val);
    return common.ISODateString(date);
}

function toString(val) {
    return (typeof val === 'undefined' ? '' : (val === null ? 'null' : val.toString()));
}

function renderValue(val,column) {
    var render = standardFormat[column];
    if(val && typeof render === 'function') {
        return render(val);
    } else {
        return toString(val);
    }
}        

function columnarOutput(list,columns) {
    var width = {};
    columns.forEach(function(column) {
        width[column] = getHeading(column).length;  
    });

    list.forEach(function(row) {
        columns.forEach(function(column) {
            if(standardFormat[column] === renderDate) {
                width[column] = 20;
            } else if(row[column] && row[column].length > width[column]) {
                width[column] = row[column].length;
            }
        });
    });

    console.log();            
    var line = [];
    for(var i=0 ; i<columns.length-1 ; i++) {
        var column = columns[i];
        line.push(padTo(getHeading(column),width[column]+2));
    }
    line.push(getHeading(columns[columns.length-1]));
    console.log(line.join(''));            

    line = [];
    columns.forEach(function(column) {
        line.push(dash60.substring(0,width[column]));
        line.push('  ');
    });
    console.log(line.join(''));            

    list.forEach(function(row) {
        var column;
        var val;

        line = [];
        for(var i=0 ; i<columns.length-1 ; i++) {
            column = columns[i];
            val = row[column];
            line.push(padTo(renderValue(val,column),width[column]+2));
        }
        column = columns[columns.length-1];
        val = row[column];
        line.push(toString(renderValue(val,column)));
        console.log(line.join(''));
    });

    console.log(list.length + ' rows.');

    function padTo(val,width) {
        if(val.length < width) {
            return val + space60.substring(0,width - val.length);
        } else {
            return val;
        }
    }
}

function buildAttributeList(arg) {
    if(!arg) arg = 'tnl';
    var retval = [];
    for(var i=0 ; i<arg.length ; i++) {
        switch(arg.charAt(i)) {
            case 't':   
                retval.push('targetType');
                break;
            case 'n': 
                retval.push('name');
                break;
            case 'v': 
                retval.push('version');
                break;
            case 'C': 
                retval.push('createdBy');
                break;
            case 'c': 
                retval.push('createdAt');
                break;
            case 'L': 
                retval.push('lastModifiedBy');
                break;
            case 'l': 
                retval.push('lastModifiedAt');
                break;

        }
    }
    return retval;
}

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
    attributes = buildAttributeList(common.global.argv.attributes);
    return listFunc(artifactName,callback);
}
