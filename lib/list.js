var create = require('./create');
var common = require('./common');
var download = require('./download');
var util = require('util');

var attributes;

var listMap = {
    app: function(name,cb) {
        if(!common.global.argv.attributes) {
            // special defaults so taskletId is included
            attributes = ['targetType','taskletId','name','lastModifiedAt'];
        }        
        var query = {
            "op": "SELECT",
            "targetType": "CdmTasklet",
            "where": {},
            "properties": attributes,
            "options": {"limit": 1000, "sort":{"name":1} }
        };
        if(name) {
            var nameExpr = convertWildcardsToRegex(name);
            query.where.taskletId = {"$regex": nameExpr};
        }
        if(!common.global.argv.includeGlobal) {
            query.where.createdBy = {"$ne":"mms"};
        }
        common.global.session.directive(query,function(err,res) {
            if(err) common.exit(err.message);
            formatOutput(res.results,attributes);
            cb();
        });
    },
    externalSystem: function(name,cb) {

        common.global.session.directive({
            "op": "SELECT",
            "targetType": "CdmExternalSystem",
            "properties": attributes,
            "options": {"limit": 1000, "sort":{"name":1} }
        },function(err,res) {
            if(err) common.exit(err.message);
            formatOutput(res.results,attributes);
            cb();
        });
    },
    model: function(name,cb) {
        // Handle wildcards in name specially: since name is not completely specified,
        // don't get properties and operations
        var nameExpr;
        if(name && name.indexOf("*") != -1) {
            nameExpr = convertWildcardsToRegex(name);
            name = null;
        }

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
                    "options": {"limit": 1000, "sort":{"name":1} }
                },function(err,res) {
                    if(err) common.exit(err.message);
                    //console.log(util.inspect(res.results,false,null));
                    formatOutput(res.results,attributes);
                    cb();
                });
            } else {
                common.global.session.directive({
                    "op": "SELECT",
                    "targetType": "CdmProperty",
                    "where":{ "containingType": name },
                    "properties": attributes,
                    "options": {"limit": 1000, "sort":{"name":1} }
                },function(err,res) {
                    if(err) common.exit(err.message);
                    formatOutput(res.results,attributes);

                    console.log(); // blank space between properties and operations

                    common.global.session.directive({
                        "op": "SELECT",
                        "targetType": "CdmOperation",
                        "where":{ "objectType": name, "sort":{"name":1} },
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
            var query = {
                "op": "SELECT",
                "targetType": "CdmType",
                "where" : {},
                "properties": attributes,
                "options": {"limit": 1000, "sort":{"name":1} }
            };
            if(nameExpr) {
                query.where.name = {"$regex": nameExpr};
            }
            if(!common.global.argv.includeGlobal) {
                query.where.createdBy = {"$ne":"mms"};
            }
            common.global.session.directive(query,function(err,res) {
                if(err) common.exit(err.message);
                formatOutput(res.results,attributes);
                cb();
            });

        }
    },
    proxy: function(name,cb) {
        listResource("^(\\/integrationPackage\\/)","$",name,cb,function(name) {
            return name.substr(name.indexOf('/',2)+1);
        });
    },
    resource: function(name,cb) {
        listResource("^","$",name,cb);
    },
    sample: function(name,cb) {
        listResource("^(\\/samples\\/)","\.zip$",name,cb,function(name) {
            return name.substring(name.indexOf('/',2)+1,name.lastIndexOf('.zip'));
        });
    },
    template: function(name,cb) {
        console.log("\nname\n----------");
        create.listTemplates(cb); 
    }
};

function listResource(prefix,suffix,name,cb,nameFunc) {

    var query = {
        "op": "SELECT",
        "targetType": "CdmResource",
        "properties": attributes,
        "where": {},
        "options": {"limit": 1000, "sort":{"name":1}}
    };

    var nameExpr = convertWildcardsToRegex(name);
    var regex = prefix + nameExpr + suffix;

    if(regex) {
        query.where.name = {"$regex": regex};
    }

    if(!common.global.argv.includeGlobal) {
        query.where.createdBy = {"$ne":"mms"};
    }
    common.global.session.directive(query,function(err,res) {
        if(err) common.exit(err.message);

        if(typeof nameFunc === 'function') {
            if(res.results) res.results.forEach(function(row) {
                row.name = nameFunc(row.name);
            });
        }

        formatOutput(res.results,attributes);
        cb();
    });   
}


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
    console.log();
    // If there is a "name" field, use it to sort alphabetically
    if(list[0] && typeof list[0].name != "undefined") {
        list.sort(function(A, B) {
            var a = '';
            if(A.name) a = A.name.toLowerCase();
            var b = '';
            if(B.name) b = B.name.toLowerCase();
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        });
    }            
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
    if(!arg || typeof arg != 'string') arg = 'tnl';
    var retval = [];
    var attrs;
    var fullNamesOk = false;

    if(arg.indexOf('+') != -1) {
        attrs = arg.split('+');
        fullNamesOk = true;        
    } else {
        attrs = arg.split('');
    }

    for(var i=0 ; i<attrs.length ; i++) {
        switch(attrs[i]) {
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
            default:
                if(fullNamesOk) {
                    if(attrs[i].length > 0) {
                        retval.push(attrs[i]);
                    }
                } else {
                    common.exit("Unrecognized option for --attributes: " + attrs[i]);
                }
                break;

        }
    }

    // Note: the list function cannot work unless 'name' is in the column list, add
    // 'name' if not present

    if(retval.indexOf('name') === -1) {
        retval.unshift('name');
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

function convertWildcardsToRegex(expr) {
    if(!expr) return ".*";
    var arr = expr.split("*");
    var regex = arr.join(".*");
    return regex;
}