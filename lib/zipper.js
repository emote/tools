"use strict";

exports.ZipFile = ZipFile;
exports.zipDirToBuffer = zipDirToBuffer;

var crc32 = require('crc32');
var fs = require('fs');

var LOCAL_FILE_HEADER_SIG = 0x04034b50;
var ZIP_ACTUAL_VERSION = 0xa;
var ZIP_REQUIRED_VERSION = 0xa;
var EXTRA_DATA = 0x0000cafe;
var EXTRA_DATA_LENGTH = 4;
var CENTRAL_FILE_HEADER_SIG = 0x02014b50;
var END_CENTRAL_FILE_HEADER_SIG = 0x06054b50;

function zipDirToBuffer(dirName,ignoreFiles) {
    if(!fs.existsSync(dirName))
    {
        console.log('Cannot find app directory ' + dirName);
        process.exit(1);
    }
    var stats = fs.statSync(dirName);
    if(!stats.isDirectory()) {
        console.log(dirName + ' not a directory!');
        process.exit(1);
    }
    console.log('Zipping up directory: ' + dirName);
    var zip = new ZipFile();
    process.chdir(dirName);
    zip.addDir('.',ignoreFiles);
    process.chdir('..');
    return zip.createZip();
}

/**
 * Create a zipper object which will create a Zip file
 */
function ZipFile() {
    this.addDir = add_dir;
    this.addFile = add_file;
    this.addBuffer = add_buffer;
    this.createZip = create_zip;
    this.files=[];
}

function add_dir(dirName,ignoreFiles) {
    var ls = fs.readdirSync(dirName);
    for(var i=0; i<ls.length; i++) {
        var fn = ls[i];
        if(fn.charAt(0) != '.' && !ignoreFiles[fn]) {
            var qn;
            if(dirName === '.') {
                qn = fn;
            } else {
                qn = dirName + '/' + fn;
            }

            this.addFile(qn);

            var stats = fs.statSync(qn);
            if(stats.isDirectory()) {
                this.addDir(qn,ignoreFiles);
            }
        }
    }
}

function add_file(file) {
    var stats = fs.statSync(file);
    if (stats.isDirectory()) {
        var buf = new Buffer(0);
        if (!/.*\/$/.test(file)) {
            file += '/';
        }
    }
    else {
        var buf = fs.readFileSync(file);
    }
    this.files.push({name : file, bytes : buf, dateTime: get_dateTime(stats.mtime)});
}

function add_buffer(name, buffer) {
    this.files.push({name : name, bytes : buffer, dateTime : get_dateTime(new Date())});
}

function create_zip() {
    var buffers = [];
    var offset = 0;
    this.files.every(function(entry) {
        entry.headerOffset = offset;
        var header = {buffer : new Buffer(1024), offset : 0};

        write32(header, LOCAL_FILE_HEADER_SIG, offset);
        write16(header, ZIP_REQUIRED_VERSION, offset);
        write16(header, 0);// bit flag
        write16(header, 0); // compression method
        write16(header, entry.dateTime.time);
        write16(header, entry.dateTime.date);
        var crc = crc32.table(entry.bytes);
        if (crc < 0) {
            crc += 0x100000000;
        }
        entry.crc = crc;
        write32(header, entry.crc);
        write32(header, entry.bytes.length);
        write32(header, entry.bytes.length);
        write16(header, entry.name.length);
        write16(header, EXTRA_DATA_LENGTH);
        writeString(header, entry.name, "ascii");
        write32(header, EXTRA_DATA);
        offset += header.offset;
        buffers.push(header.buffer.slice(0, header.offset));
        buffers.push(entry.bytes);
        offset += entry.bytes.length;
        return true;
    });
    var start_central = offset;

    this.files.every(function(entry) {
        var header = {buffer : new Buffer(1024), offset : 0};

        write32(header, CENTRAL_FILE_HEADER_SIG);
        write16(header, ZIP_ACTUAL_VERSION, offset);
        write16(header, ZIP_REQUIRED_VERSION, offset);
        write16(header, 0);// bit flag
        write16(header, 0); // compression method
        write16(header, entry.dateTime.time);
        write16(header, entry.dateTime.date);
        write32(header, entry.crc);
        write32(header, entry.bytes.length);
        write32(header, entry.bytes.length);
        write16(header, entry.name.length);
        write16(header, EXTRA_DATA_LENGTH);
        write16(header, 0);// file comment length
        write16(header, 0);// disk number starth
        write16(header, 0);// internal attrs
        write32(header, 0); // external attrs
        write32(header, entry.headerOffset);
        writeString(header, entry.name, "ascii");
        write32(header, EXTRA_DATA);

        buffers.push(header.buffer.slice(0, header.offset));
        offset += header.offset;
        return true;
    });

    var trailer = {buffer : new Buffer(1024), offset : 0};

    write32(trailer, END_CENTRAL_FILE_HEADER_SIG);
    write16(trailer, 0);// relative disk #
    write16(trailer, 0);// relative disk #
    write16(trailer, this.files.length);
    write16(trailer, this.files.length);
    write32(trailer, offset - start_central);
    write32(trailer, start_central);
    write16(trailer, 0); // comment length

    buffers.push(trailer.buffer.slice(0, trailer.offset));

    return Buffer.concat(buffers);
}

function write32(buffer, val) {
    buffer.buffer.writeUInt32LE(val, buffer.offset);
    buffer.offset += 4;
}

function write16(buffer, val) {
    buffer.buffer.writeUInt16LE(val, buffer.offset);
    buffer.offset += 2;
}

function writeString(buffer, val, encoding) {
    var len = Buffer.byteLength(val, encoding);
    buffer.buffer.write(val, buffer.offset, 0, encoding);
    buffer.offset += len;
}

function get_dateTime(date) {
    var retval = {};

    retval.date =
        ((date.getFullYear() - 1980) << 9) +
        ((date.getMonth() + 1) << 5) +
        date.getDate();

    retval.time =
        (date.getHours() << 11) +
        (date.getMinutes() << 5) +
        (Math.floor(date.getSeconds() / 2));

    return retval;
}