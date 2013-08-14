//var mms = require('mms');
var util = require('util');
var fs = require('fs');
var path = require('path');

var appDirectoryPath = null;
var mmcWhitelabelDirectoryPath = null;
var mmcBrandingDirectoryPath = null;

var appThemeDirectoryPaths = null;
var appThemeDirectoryLib = null;
var appThemeDirectoryKids = null;
var appThemeDirectoryNumber = 0;
var themePhase = 0;

var tenantThemeCDFVersion = 0;

var appDirectoryPrefix = "appLibV";

var brandingSourceBody = null;
var brandingElementIsPublic = false;
var brandingElementNumber = -1;
var brandingElementResourceName = null;
var brandingContentType = null;
var brandingFlavor = null;
var brandingDirectory = null;
var brandingElements = null;
var session = null;
var emoteCallback = null;
var oldWorkingDir = null;
var deleteAll = false;
var markPublic = false;
var isLoginTheme = false;

exports.update = function update(mmsSession,dirname,cb,deleteFlag,publicFlag)
{
    session = mmsSession;
    emoteCallback = cb;
    deleteAll = deleteFlag;
    markPublic = publicFlag;
    oldWorkingDir = process.cwd();

    //
    //  If we are pointing at the theme directory with the special name "loginTheme" then we
    //  do things a little differently.
    //
    if (dirname == "loginTheme")
    {
        isLoginTheme = true;
    }
    else
    {
        isLoginTheme = false;
    }

    if (deleteFlag)
    {
        console.log("Undeploy the '" + dirname + "' theme");
    }
    else
    {
        console.log("Deploy the '" + dirname + "' theme");
    }

    var targetDirectory = path.normalize(process.cwd() + "/" + dirname);

    //
    //  testDirectoryPath() checks the supplied path; if the file exists and it's a directory then it returns
    //  the path; otherwise it returns null. (If it exists but is not a directory we abort.)
    //
    appDirectoryPath = testDirectoryPath(targetDirectory);

    if (appDirectoryPath)
    {
        process.chdir(appDirectoryPath);
        mmcWhitelabelDirectoryPath = testDirectoryPath(appDirectoryPath + '/mmc/wl');
        mmcBrandingDirectoryPath = testDirectoryPath(appDirectoryPath + '/mmc/gn');

        var kids = fs.readdirSync(appDirectoryPath);

        for (var i=0; i<kids.length; i++)
        {
            var f = kids[i];
            var fpath = appDirectoryPath + "/" + f;

            var stats = null;

            try
            {
                stats = fs.statSync(fpath);
            }
            catch (ex)
            {
            }

            if (stats)
            {
                //
                //  The file exists and is a directory
                //
                if (stats.isDirectory())
                {
                    var prefixLen = appDirectoryPrefix.length;

                    if (f.length > prefixLen)
                    {
                        if (f.substring(0,prefixLen) == appDirectoryPrefix)
                        {
                            var extra = f.substring(prefixLen);

                            //
                            //  We have parsed off the characters past the "appLibV"; they must
                            //  be a simple integer.
                            //
                            if (!isNaN(extra))
                            {
                                var candidatePath = testDirectoryPath(appDirectoryPath + '/' + f);

                                if (candidatePath)
                                {
                                    if (!appThemeDirectoryPaths)
                                    {
                                        appThemeDirectoryPaths = new Array();
                                        appThemeDirectoryLib = new Array();
                                        appThemeDirectoryKids = new Array();
                                    }

                                    //
                                    //  This is a valid path name to a "appLibV*" directory.
                                    //
                                    appThemeDirectoryPaths.push(candidatePath);

                                    //
                                    //  This is the CDF lib version number (e.g. 1,2,3) that this directory
                                    //  corresponds to.
                                    //
                                    appThemeDirectoryLib.push(extra);

                                    var elements = fs.readdirSync(candidatePath);

                                    //
                                    //  This is the number of children found in the "appLibV*" directory; "zero"
                                    //  means the directory is empty.
                                    //
                                    appThemeDirectoryKids.push(elements.length);
                                }
                            }
                        }
                    }
                }
            }
        }

        themePhase = 1;
        doBrandingPhase();
    }
    else
    {
        console.log('Directory ' + targetDirectory + ' does not exist');
        process.exit(1);
    }
}


//
//  We do the work in 3 phases for each of the 3 different branding directories.
//
function doBrandingPhase()
{
    var j,kids,parts;

    switch (themePhase)
    {
        case 1:
            //
            //  Skip this phase when we are dealing with loginThemes
            //
            if (isLoginTheme)
            {
                themePhase++;
                doBrandingPhase();
            }
            //
            //  The caller didn't ask for "--delete" *AND* the directory exists so we will be updating the branding elements
            //
            else if (!deleteAll && mmcWhitelabelDirectoryPath)
            {
                console.log("Update all MMC Whitelabel branding elements");

                brandingDirectory = mmcWhitelabelDirectoryPath;
                brandingElementNumber = 0;
                brandingElements = new Array();
                brandingFlavor = "wl";

                //
                //  Walk all the files in the directory; each is a resource to be updated
                //
                kids = fs.readdirSync(brandingDirectory);

                for (j = 0; j < kids.length; j++)
                {
                    brandingElements.push(kids[j]);
                }

                updateMMCBrandingElement();
            }
            //
            //  The caller asked for "--delete" *OR* the directory does not exist so we will be deleting the branding elements
            //
            else
            {
                console.log("Remove all MMC Whitelabel branding elements");

                parts =
                {
                    delete: true,
                    flavor: 'wl',
                    resourceFile: {filename: "none", contents: ""}
                };

                session.console("updateMMCBrandingElementNew",parts,function (err,resultObject)
                {
                    console.log(resultObject);
                    themePhase++;
                    doBrandingPhase();
                });
            }
            break;

        case 2:
            //
            //  Skip this phase when we are dealing with loginThemes
            //
            if (isLoginTheme)
            {
                themePhase++;
                doBrandingPhase();
            }
            //
            //  The caller didn't ask for "--delete" *AND* the directory exists so we will be updating the branding elements
            //
            else if (!deleteAll && mmcBrandingDirectoryPath)
            {
                console.log("Update all MMC Generic branding elements");

                brandingDirectory = mmcBrandingDirectoryPath;
                brandingElementNumber = 0;
                brandingElements = new Array();
                brandingFlavor = "gn";

                //
                //  Walk all the files in the directory; each is a resource to be updated
                //
                kids = fs.readdirSync(brandingDirectory);

                for (j = 0; j < kids.length; j++)
                {
                    brandingElements.push(kids[j]);
                }

                updateMMCBrandingElement();
            }
            //
            //  The caller asked for "--delete" *OR* the directory does not exist so we will be deleting the branding elements
            //
            else
            {
                console.log("Remove all MMC Generic branding elements");

                parts =
                {
                    delete: true,
                    flavor: 'gn',
                    resourceFile: {filename: "none", contents: ""}
                };

                session.console("updateMMCBrandingElementNew",parts,function (err,resultObject)
                {
                    console.log(resultObject);
                    themePhase++;
                    doBrandingPhase();
                });
            }
            break;

        case 3:
            //
            //  If there were no appLibV* directories then there is nothing to do in this phase
            //
            if (appThemeDirectoryPaths)
            {
                tenantThemeCDFVersion = appThemeDirectoryLib[appThemeDirectoryNumber];

                //
                //  The caller didn't ask for "--delete" *AND* the directory is not empty so we will be updating
                //  the branding elements
                //
                if (!deleteAll && (appThemeDirectoryKids[appThemeDirectoryNumber] > 0))
                {
                    if (isLoginTheme)
                    {
                        console.log("Update all Application loginTheme elements for CDF libV" + tenantThemeCDFVersion);
                    }
                    else
                    {
                        console.log("Update all Application theme elements for CDF libV" + tenantThemeCDFVersion);
                    }

                    brandingDirectory = appThemeDirectoryPaths[appThemeDirectoryNumber];

                    brandingElementNumber = 0;
                    brandingElements = new Array();

                    getAllFiles(brandingElements,brandingDirectory,"");

                    updateAppThemeElement();
                }
                //
                //  The caller asked for "--delete" *OR* the directory is empty so we will be deleting the branding
                //  elements for this libV version
                //
                else
                {
                    parts =
                    {
                        delete: true,
                        version: tenantThemeCDFVersion,
                        resourceFile: {filename: "none", contents: ""}
                    };

                    if (isLoginTheme)
                    {
                        parts.isLoginTheme = true;
                        console.log("Remove all Application loginTheme elements for CDF libV" + tenantThemeCDFVersion);
                    }
                    else
                    {
                        console.log("Remove all Application theme elements for CDF libV" + tenantThemeCDFVersion);
                    }

                    session.console("updateAppBrandingElement",parts,function (err,resultObject)
                    {
                        console.log(resultObject);

                        appThemeDirectoryNumber++;

                        if (appThemeDirectoryNumber >= appThemeDirectoryLib.length)
                        {
                            themePhase++;
                        }
                        doBrandingPhase();
                    });
                }
            }
            //
            //  Do nothing and skip to the next phase
            //
            else
            {
                themePhase++;
                doBrandingPhase();
            }
            break;

        case 4:
            //
            //  Skip this phase when we are dealing with loginThemes
            //
            if (isLoginTheme)
            {
                themePhase++;
                doBrandingPhase();
            }
            //
            //  If there were any tenant/application themes changed then we need to clear the CdmProcessedResources
            //
            else if (appThemeDirectoryPaths)
            {
                var obj = new Object();
                obj.op = "INVOKE";

                //
                //  Clear Processed Resources for this tenant
                //
                //obj.targetType = "CdmProcessedResource";
                //obj.name = "clearResourceCache";

                //
                //  Update all Tasklet versions *and* clear Processed Resources for this tenant
                //
                obj.targetType = "CdmTasklet";
                obj.name = "incrementTaskletVersions";

                obj.params = new Object();

                session.directive(obj,onClearResourceComplete);
            }
            //
            //  Do nothing and skip to the next phase
            //
            else
            {
                themePhase++;
                doBrandingPhase();
            }
            break;

        default:
            process.chdir(oldWorkingDir);
            emoteCallback();
            break;
    }
}

function onClearResourceComplete(err,restResponse)
{
    if (restResponse.status == "SUCCESS")
    {
        console.log("Application resource cache cleared");
    }

    themePhase++;
    doBrandingPhase();
}

//
//  Update an MMC branding element resource
//
function updateMMCBrandingElement()
{
    brandingElementResourceName = brandingElements[brandingElementNumber];

    var srcFile = brandingDirectory + "/" + brandingElementResourceName;

    var err = setBrandingContentType(brandingElementResourceName);

    if (err)
    {
        console.log(err);
        brandingElementNumber++;

        if (brandingElementNumber < brandingElements.length)
        {
            updateMMCBrandingElement();
        }
        else
        {
            themePhase++;
            doBrandingPhase();
        }
        return;
    }

    if (markPublic)
    {
        brandingElementIsPublic = true;
    }
    else
    {
        brandingElementIsPublic = false;
    }

    //console.log("brandingElementResourceName = " + brandingElementResourceName);
    //console.log("srcFile = " + srcFile);
    //console.log("brandingContentType = " + brandingContentType);
    //console.log("brandingElementIsPublic = " + brandingElementIsPublic);

    brandingSourceBody = fs.readFileSync(srcFile, null);
    sendMMCBrandingElementResource();
}


function sendMMCBrandingElementResource()
{
    var parts =
    {
        resourceName: brandingElementResourceName,
        contentType: brandingContentType,
        isPublic: brandingElementIsPublic,
        flavor: brandingFlavor,
        resourceFile: {filename: brandingElementResourceName, contents: brandingSourceBody}
    };

    session.console("updateMMCBrandingElementNew",parts,onSendMMCBrandingElementResourceComplete);
}

function onSendMMCBrandingElementResourceComplete(err,resultObject)
{
    if (brandingFlavor == "wl")
    {
        console.log("MMC Whitelabel branding element '/branding/" + brandingFlavor + "/" + brandingElementResourceName + "': " + resultObject + (brandingElementIsPublic ? " (public)":""));
    }
    else
    {
        console.log("MMC Generic branding element '/branding/" + brandingFlavor + "/" + brandingElementResourceName + "': " + resultObject + (brandingElementIsPublic ? " (public)":""));
    }

    brandingElementNumber++;

    if (brandingElementNumber < brandingElements.length)
    {
        updateMMCBrandingElement();
    }
    else
    {
        themePhase++;
        doBrandingPhase();
    }
}

function setBrandingContentType(filename)
{
    brandingContentType = null;

    var effFileName = filename;

    var index = effFileName.lastIndexOf('/');

    if (index >= 0)
    {
        effFileName = effFileName.substring(index+1);
    }

    index = effFileName.lastIndexOf('\\');

    if (index >= 0)
    {
        effFileName = effFileName.substring(index+1);
    }

    if (effFileName.charAt(0) == '.')
    {
        return "File " + filename + " will be ignored";
    }

    var suffix = filename.substring(filename.lastIndexOf(".")+1);

    switch (suffix)
    {
        case "css":
            brandingContentType = "text/css";
            break;
        case "gif":
            brandingContentType = "image/gif";
            break;
        case "png":
            brandingContentType = "image/png";
            break;
        case "jpeg":
        case "jpg":
            brandingContentType = "image/jpeg";
            break;
        case "json":
            brandingContentType = "application/json";
            break;
        case "html":
            brandingContentType = "text/html";
            break;
        case "txt":
            brandingContentType = "text/plain";
            break;
        case "otf":
        case "ttf":
            brandingContentType = "application/octet-stream";
            break;
    }

    if (brandingContentType == null)
    {
        return "File " + filename + " has an unrecognized suffix and will be ignored";
    }

    return null;
}

function updateAppThemeElement()
{
    brandingElementResourceName = brandingElements[brandingElementNumber];

    var srcFile = brandingDirectory + "/" + brandingElementResourceName;

    //console.log("brandingElementResourceName = " + brandingElementResourceName);
    //console.log("srcFile = " + srcFile);

    var err = setBrandingContentType(brandingElementResourceName);

    if (err)
    {
        console.log(err);

        brandingElementNumber++;

        if (brandingElementNumber < brandingElements.length)
        {
            updateAppThemeElement();
        }
        else
        {
            appThemeDirectoryNumber++;

            if (appThemeDirectoryNumber >= appThemeDirectoryLib.length)
            {
                themePhase++;
            }

            doBrandingPhase();
        }

        return;
    }

    brandingSourceBody = fs.readFileSync(srcFile, null);
    sendAppThemeElementResource();
}

function sendAppThemeElementResource()
{
    var parts =
    {
        version: tenantThemeCDFVersion,
        resourceName: "/" + brandingElementResourceName,
        resourceFile: {filename: brandingElementResourceName, contents: brandingSourceBody}
    };

    if (isLoginTheme)
    {
        parts.isLoginTheme = true;
    }

    session.console("updateAppBrandingElement",parts,onSendThemeElementResourceComplete);
}

function onSendThemeElementResourceComplete(err,resultObject)
{
    if (isLoginTheme)
    {
        console.log("Application loginTheme element '/libV" + appThemeDirectoryLib[appThemeDirectoryNumber] + "/loginTheme/" + brandingElementResourceName + "': " + resultObject);
    }
    else
    {
        console.log("Application theme element '/libV" + appThemeDirectoryLib[appThemeDirectoryNumber] + "/theme/" + brandingElementResourceName + "': " + resultObject);
    }

    brandingElementNumber++;

    if (brandingElementNumber < brandingElements.length)
    {
        updateAppThemeElement();
    }
    else
    {
        appThemeDirectoryNumber++;

        if (appThemeDirectoryNumber >= appThemeDirectoryLib.length)
        {
            themePhase++;
        }

        doBrandingPhase();
    }
}

//
//  Recursively descend through the filesystem and flatten it out, putting the results into the allFiles array.
//
exports.getAllFiles = getAllFiles;
function getAllFiles(allFiles,root,fpath)
{
    var stats = null;

    //console.log("Analyze root=" + root + " path=" + fpath);

    var fullPath;

    if (fpath.length > 0)
    {
        fullPath = root + "/" + fpath;
    }
    else
    {
        fullPath = root;
    }

    try
    {
        stats = fs.statSync(fullPath);
    }
    catch (ex)
    {
        //console.log(JSON.stringify(ex))
    }

    if (stats)
    {
        if (stats.isDirectory())
        {
            var kids = fs.readdirSync(fullPath);

            for (var i=0; i<kids.length; i++)
            {
                var f = kids[i];
                if (fpath.length > 0)
                {
                    f = fpath + "/" + f;
                }
                //console.log("kid " + f);
                getAllFiles(allFiles,root, f);
            }
        }
        else
        {
            allFiles.push(fpath);
        }
    }
}

exports.testDirectoryPath = testDirectoryPath;
function testDirectoryPath(f)
{
    var stats = null;

    try
    {
        stats = fs.statSync(f);
    }
    catch (ex)
    {
    }

    if (stats)
    {
        //
        //  The file exists and is a directory
        //
        if (stats.isDirectory())
        {
            return f;
        }
        //
        //  The file exists but is not a directory; that's a fatal error
        //
        else
        {
            console.log('File ' + e + ' exists but is not a directory');
            process.exit(1);
        }
    }
    else
    {
        f = null;
    }

    return f;
}


