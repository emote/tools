//PROLOG - This line forces the JavaScriptProlog to be inserted
"use strict";
if (!initScript("ec-ContactLookup-Get",1,"INFO"))
{
    throw "JavaScriptProlog was not installed!";
}

var obj,obj1;
var getExternalUser;
var com;

var allOpportunities = null;
var allAccounts = null;
var allContacts = null;

//
//  Get the external Salesforce User object that corresponds to this emotive user
//
var mySFUser = getExternalUser("SFDC");

if (!cdmError)
{
    //
    //  Get all the Opportunities for which we are the Creator or the Owner
    //
    obj = new Object();
    obj.op = "SELECT";

    obj.targetType = 'Opportunity';
    obj.properties = ["externalId","OwnerId","CreatedById","Name","AccountId"];
    obj.options = new Object();
    obj.options.limit = 1000;

    obj.where = new Object();
    obj.where.$or = new Array();
    obj.where.$or.push({OwnerId: mySFUser.externalId});
    obj.where.$or.push({CreatedById: mySFUser.externalId});

    allOpportunities = sendREST(obj);

    if (!cdmError)
    {
        log.trace(allOpportunities.length + " Opportunities");

        var relevantAccountsHash = new Object();
        var relevantAccounts = new Array();
        var allAccounts;

        for (var i=0; i<allOpportunities.length; i++)
        {
            var opp = allOpportunities[i];

            buildIdList(relevantAccountsHash,relevantAccounts,opp.AccountId);
        }

        //
        //  Get all the relevant Accounts (the ones I own or which are referenced by my Opportunities)
        //
        if (relevantAccounts.length > 0)
        {
            obj = new Object();
            obj.op = "SELECT";

            obj.targetType = 'Account';
            obj.properties = ["externalId","Name","OwnerId"];
            obj.options = new Object();
            obj.options.limit = 1000;

            obj.where = new Object();
            obj.where.$or = new Array();
            obj.where.$or.push({OwnerId: mySFUser.externalId});

            obj1 = new Object();
            obj1.externalId = new Object();
            obj1.externalId.$in = relevantAccounts;
            obj.where.$or.push(obj1);

            allAccounts = sendREST(obj);

            if (!cdmError)
            {
                log.trace(allAccounts.length + " Accounts");

                //
                //  Rebuild the list of relevant accounts from the previous result
                //
                relevantAccounts = new Array();
                for (var i=0; i<allAccounts.length; i++)
                {
                    var account = allAccounts[i];
                    relevantAccounts.push(account.externalId);
                }

                obj = new Object();
                obj.op = "SELECT";
                obj.targetType = 'Contact';
                obj.options = new Object();
                obj.options.limit = 1000;

                obj.where = new Object();
                obj.where.AccountId = new Object();
                obj.where.AccountId.$in = relevantAccounts;

                allContacts = sendREST(obj);

                if (!cdmError)
                {
                    log.trace(allContacts.length + " Contacts");
                }
            }
        }
        else
        {
            allAccounts = new Array();
            allContacts = new Array();
        }
    }
}

if (cdmError)
{
    log.error("ERROR: " +  cdmError.errorMessage);
    [cdmError];
}
else
{    
    //
    //  Now package all the arrays in a result set 
    //
    var resultSet = new Array();
    resultSet.push([mySFUser]);
    //resultSet.push(allOpportunities);
    resultSet.push(allAccounts);
    resultSet.push(allContacts);
     
    resultSet;
}

