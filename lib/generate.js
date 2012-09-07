"use strict";
var util = require('util');

exports.fromTemplate = function applyTemplate(template,model) {
    template = processRemoves(template);
//console.log("PROCESSREMOVE" + template + "END");
    return processBlocks(template,enumerateBlocks(template),model,0,true,true,0,null);
}

function enumerateBlocks(template) {
    var blocks = {};
    var parts = template.split(/\/\*block:/);
//console.log(parts.length + ' blocks found.')
    for(var j=1;j<parts.length;++j) {
        var index = parts[j].search(/\W/);
//console.log('part=' + parts[j] + ' index='+index);
        var label = parts[j].substring(0,index);
        blocks[label] = true;
    }
    return blocks;
}

function processRemoves(template) {
    var rx = new RegExp('\\/\\*remove\\*\\/', 'g');
    var parts = template.split(rx);
//console.log('PART COUNT = '+parts.length);
    var newParts = [];
    for(var j=0;j<parts.length;j+=2) {
        newParts.push(parts[j]);
    }
    return newParts.join('');
}

function processBlocks(template,blocks,subject,index,isFirst,isLast,count,parent) {
    for(var blockLabel in blocks) {
        var str = '\\/\\*block:'+blockLabel+'\\s';
        var rx = new RegExp(str, 'g');
        var parts = template.split(rx);
//console.log('processing block '+str+' with '+parts.length+' parts');
        var newParts = [];
        for(var i=0;i<parts.length;++i) {
//console.log('part '+i+' is '+parts[i].substring(0,30));
            // note that because of split, the odd parts are "enclosed" by loop
            var eol = parts[i].indexOf('\n');
            var endOfComment = parts[i].indexOf('*/');
            if(endOfComment === -1 || endOfComment > eol) {
                endOfComment = parts[i].indexOf('*|');
            }
            var text = parts[i].substring(endOfComment+2);
            if(i===0) {
                newParts.push(parts[i]);
            } else if(i%2 == 0) {
                newParts.push(text);
            } else {
                var token = parts[i].substring(0,endOfComment).split(/\s/);
                var loopProperty;
                if(token[0] === 'loop') {
                    loopProperty = subject[token[1]];
                } else if(token[0] === 'properties' && !token[1]) {
                    loopProperty = subject;
                } else {
                    console.log("Cannot loop over property: " + token[0] + " " + token[1]);
                }
                var currentParent = subject;
                if(util.isArray(loopProperty)) {
                    for(var j=0;j<loopProperty.length;++j) {
                        (function(subject,index) {
                            newParts.push(processBlocks(text,blocks,subject,index,(index===0),(index===loopProperty.length-1),index,currentParent));
                        }(loopProperty[j],j));
                     }
                } else {
                    var keys = [];
                    for(var key in loopProperty) keys.push(key);
                    var first = keys[0];
                    var last = keys.pop();                   
                    var count=0;
                    for(key in loopProperty) {
                        (function(subject,index) {
                            newParts.push(processBlocks(text,blocks,subject,index,(index===first),(index===last),count,currentParent));
                        }(loopProperty[key],key));
                       count += 1;
                    }
                }
            }
        }
        template = newParts.join('');
    }
    template = evalSubstitutions('substitute\\d\\/\\*',template,subject,index,isFirst,isLast,count,parent);
    template = evalSubstitutions('\\/\\*insert:',template,subject,index,isFirst,isLast,count,parent);
    return template;
}

function evalSubstitutions(regex,template,model,index,isFirst,isLast,count,parent) {
    var rx = new RegExp(regex, 'g');
    var parts = template.split(rx);
    var newParts = [];
    newParts.push(parts[0]);
    for(var i=1;i<parts.length;++i) {
        var eol = parts[i].indexOf('\n');
        var offset = parts[i].indexOf('*/');
//console.log('offset > eol: '+offset +'>'+ eol);
        if(offset === -1 || (eol != -1 && offset > eol)) {
            offset = parts[i].indexOf('*|');
        }
        var expr = parts[i].substring(0,offset);
        var part = parts[i].substring(offset+2);
        var value;
//console.log('eval expr: '+expr);
        (function(subject,index,isFirst,isLast,count,parent) {
            try {
                value = eval(expr);
            } catch(err) {
                console.log('Error evaluating expression "' + expr + '" in template: ' + err);
                process.exit(1);
            }
        }(model,index,isFirst,isLast,count,parent));

        newParts.push(value);
        newParts.push(part);
    }
    return newParts.join('');
}

/*
function spliceArrays(theArray,newItemsArray,start) {
    var args = [start, newItemsArray.length].concat(newItemsArray);
    Array.prototype.splice.apply(theArray, args);
}

function basicUnitTestText(typeName) {
    return '"' + typeName + '";';
}

function hereDoc(f) {
  return f.toString().
      replace(/^[^\/]+\/\*!?/, '').
      replace(/\*\/[^\/]+$/, '');
}

function addParentProps(obj) {
    for(var key in obj) {
        if(key != 'parent') {
            var child = obj[key];
            if(emutil.type(child) === 'object') {
                child.parent = obj;
                addParentProps(child);
            }
        }
    }
}

*/