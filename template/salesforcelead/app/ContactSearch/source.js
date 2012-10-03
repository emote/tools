"use strict";
//
//
//	This is standard jQuery idiom; it gets called after the DOM tree has been created
//
$(document).ready(CDF_Initialize);
function CDF_Ready()
{  
    //
    //  Declare whether or not this application would benefit from data caching
    //
    Emotive.App.Collections.allowCaching(true);
    
    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.footerInitialized","Boolean"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.account","Account"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.contact","Contact"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.contactRole","String"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.addressLine1","String"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.addressLine2","String"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.contactAccountName","String"));
    requestedQueries.push(new VirtualQueryRequestObject("ec-ContactLookup-Type",
            [
                 {targetType:"User",targetVariableName:"Emotive.Data.myUser",targetIsSingleObject:true},
                 //{targetType:"Opportunity",targetVariableName:"Emotive.Data.allOpportunities",targetHashName:"Emotive.Data.opportunityHash"},
                 {targetType:"Account",targetVariableName:"Emotive.Data.allAccounts",targetHashName:"Emotive.Data.accountHash"},
                 {targetType:"Contact",targetVariableName:"Emotive.Data.allContacts",targetHashName:"Emotive.Data.contactHash"}
            ]
            ));
    
    
    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
    Emotive.Service.submit(requestedQueries, onRequestDataReady);
    
    //
    // Declare an event handler to fire before the #AccountsAndOpportunities page is about to be shown.
    //
    $('#Loading').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Loading...");
        });
	
	//
	// Declare an event handler to fire before the #AccountsAndOpportunities page is about to be shown.
	//
    $('#ContactList').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Search for Contact");
            Emotive.Ui.Header.setBackButton(null);
        }
    );
    $('#ContactOnlyPage').bind('pagebeforeshow', function(event)
            {
                Emotive.Ui.Header.setTitle("Search Results");
                Emotive.Ui.Header.setBackButton("#ContactList");
            }
        );    
    //
    // Declare an event handler to fire before the #ContactDetail page is about to be shown.
    //     
    $('#ContactDetail').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle(Emotive.Data.contact.Name);
            Emotive.Ui.Header.setBackButton('#ContactOnlyPage');
         }
    );
    
    //
    // Declare an event handler to fire before the #SelectRelated page is about to be shown.
    //        
    $('#SelectRelated').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Accounts");
            Emotive.Ui.Header.setRightButton(null,null);
            Emotive.Ui.Header.setBackButton('#NewContact');
            
            $("#searchInput").val("");
            for (var i=0; i<Emotive.Data.allAccounts.length; i++)
            {
                var id = "#acc-rc-" + i;
                $(id).closest(".ui-radio").show();
            }        
        }
    );
}
function createNewContact()
{
    var contact = new Object();
    
    contact.AccountId = null;
    
    contact.FirstName = "";
    contact.LastName = "";
    contact.Name = "";
    contact.Title = "";
    contact.MailingStreet = "";
    contact.MailingCity = "";
    contact.MailingState = "";
    contact.MailingPostalCode = "";
    
    contact.Phone = "";
    contact.MobilePhone = "";
    contact.Fax = "";
    contact.Email = "";
    
    Emotive.Data.set("Emotive.Data.contact",contact);
    
    if (Emotive.Data.specificAccountSelected)
    {
        Emotive.Data.set("Emotive.Data.contact.AccountId",Emotive.Data.specificAccountSelectedId);
        Emotive.Data.set("Emotive.Data.contactAccountName", Emotive.Data.specificAccountSelectedName);
    }
    else
    {
        Emotive.Data.set("Emotive.Data.contactAccountName","Select an Account");
    }
    
    Emotive.App.changePage("#NewContact");
}
function selectContact(contactExternalId)
{
    var contact = Emotive.Data.contactHash[contactExternalId];
    
    if (contact)
    {
        var account = Emotive.Data.accountHash[contact.AccountId];
    
        Emotive.Data.set("Emotive.Data.contact",contact);
        Emotive.Data.set("Emotive.Data.account", account);
        var role;
        
        if (contact.Title && (contact.Title.length > 0) && account)
        {
            role = contact.Title + " at " + account.Name;
         }
        else if (account)
        {
            role = account.Name;
        }
        else
        {
            role = "Unknown";
        }
 
        
        $("#roleUL").empty();
        $("#roleUL").append("<li>" + role + "</li>");
        Emotive.$.refreshListview("#roleUL");
        
        var anybodyVisible = false;
  
        $("#phoneAndEmail").empty();
        
        if (contact.MobilePhone && (contact.MobilePhone.length > 0))
        {
            anybodyVisible = true;
            $("#phoneAndEmail").append('<li><a id="liMobile" href="tel:' + contact.MobilePhone + '">' + 
                    '<span  style="text-decoration:none; color:#0000ff; border-bottom:1px solid;" >' + contact.MobilePhone +  '</span>' + 
                    '<span class="ui-li-count">Mobile</span></a></li>');
        }
        
        if (contact.Phone && (contact.Phone.length > 0))
        {
            anybodyVisible = true;
            $("#phoneAndEmail").append('<li><a id="liWork" href="tel:' + contact.Phone + '">' + 
                                        '<span  style="text-decoration:none; color:#0000ff; border-bottom:1px solid;" >' + contact.Phone +  '</span>' +  
                                        '<span class="ui-li-count">Office</span></a></li>');
        }
        if (contact.Fax && (contact.Fax.length > 0))
        {
            anybodyVisible = true;
            $("#phoneAndEmail").append('<li><a id="liFax" href="tel:' + contact.Fax + '" >' + 
                                        '<span  style="text-decoration:none; color:#0000ff; border-bottom:1px solid;" >' + contact.Fax +  '</span>' +   
                                        '<span class="ui-li-count">Fax</span></a></li>');
        }
        if (contact.Email && (contact.Email.length > 0))
        {
            anybodyVisible = true;
            //
            //  "mailto" isn't quite working for iPhone yet
            //
            $("#phoneAndEmail").append('<li><a id="liEmail" href="mailto:' + contact.Email + '" >' +  
                    '<span  style="text-decoration:none; color:#0000ff; border-bottom:1px solid;" >' + contact.Email +  '</span>' +  
                '<span class="ui-li-count">Email</span></a></li>');
        }
        
                            
        if (anybodyVisible)
        {
            $("#phoneAndEmail").show();
        }
        else
        {
            $("#phoneAndEmail").hide();
        }
        
        Emotive.$.refreshListview("#phoneAndEmail");
 
        var line1 = "";
        var line2 = "";
        
        if (contact.MailingStreet)
        {
            line1 = contact.MailingStreet;
        }
        
        if (contact.MailingCity && (contact.MailingCity.length > 0))
        {
            line2 = contact.MailingCity;
            
            if (contact.MailingState && (contact.MailingState.length > 0))
            {
                line2 += ", " + contact.MailingState;
            }
            
            if (contact.MailingPostalCode && (contact.MailingPostalCode.length > 0))
            {
                line2 += " " + contact.MailingPostalCode;
            }
           
            if (contact.MailingCountry && (contact.MailingCountry.length > 0))
            {
                line2 += " " + contact.MailingCountry;
            }           
        }
        
        Emotive.Data.set("Emotive.Data.addressLine1", line1);
        Emotive.Data.set("Emotive.Data.addressLine2", line2);
        
        Emotive.App.changePage("#ContactDetail");
    }
}
//
//	This gets called when the MetaData and Query requests have completed; we have all our data
//	and we are ready to start.
//
function onRequestDataReady()
{
	Emotive.Data.footerInitialized = false;
	if (Emotive.Data.myUser)
    {
        Emotive.Data.myExternalId = Emotive.Data.myUser.externalId;
    }
    Emotive.App.changePage("#ContactList");
}
function regenerateMainList()
{
    $("#mainList").empty();
    if ($("#setSort").val() == "companyAndContacts")
    {
        for (var i=0; i<Emotive.Data.allAccounts.length; i++)
        {
            var account = Emotive.Data.allAccounts[i];
            
            if (account.contacts)
            {
                $("#mainList").append(   '<li data-role="list-divider" >' +
                                             account.Name +
                                         '</li>');
                
                for (var j=0; j<account.contacts.length; j++)
                {
                    var contact = account.contacts[j]; 
                    
                    $("#mainList").append(  '<li data-theme="c">' +
                                                '<a href="javascript:selectContact(\'' + contact.externalId + '\')">' + 
                                                    contact.Name +
                                                '</a>' +
                                            '</li>');
                }
            }
        } 
    } 
    else if ($("#setSort").val() == "company")
    {
        for (var i=0; i<Emotive.Data.allAccounts.length; i++)
        {
            var account = Emotive.Data.allAccounts[i];
            
            if (account.contacts)
            {
                $("#mainList").append(  '<li data-theme="c">' +
                        '<a href="javascript:selectCompany(\'' + account.externalId + '\')">' + 
                        account.Name +
                        '</a>' +
                    '</li>');
            }
        } 
    }           
    else if ($("#setSort").val() == "alpha")
    {
        var lastStart = null;
        
        for (var i=0; i<Emotive.Data.allContacts.length; i++)
        {
            var contact = Emotive.Data.allContacts[i]; 
            
            var name = contact.Name;
            var nameText = null;
            
            nameText = name;
            
            if (contact.AccountId)
            {
                var account = Emotive.Data.accountHash[contact.AccountId];
                
                if (account)
                {
                    if (nameText.length > 0)
                    {
                        nameText += " ";
                    }
                    nameText += "(" + account.Name + ")";
                }
            }
            
            var firstChar;
            
            if (name.length == 0)
            {
                firstChar = "NO-NAME";
            }
            else
            {
                firstChar = name.substr(0,1).toLowerCase();
            }                       
            
            if (firstChar != lastStart)
            {
                lastStart = firstChar;
                $("#mainList").append(   '<li data-role="list-divider" >' +
                        firstChar.toUpperCase() +
                    '</li>');
                
            }
            $("#mainList").append(  '<li  data-theme="c">' +
                                        '<a  href="javascript:selectContact(\'' + contact.externalId + '\')">' + 
                                        nameText +
                                        '</a>' +
                                    '</li>');
        }   
    }
    
    Emotive.$.refreshListview("#mainList");
    $("#mainList").show();
    
    Emotive.$.fixFooter();    
}
function searchForContact()
{
    var obj = new Object();
    obj.op = "SELECT";
    obj.targetType = "Contact";
    obj.where = new Object();
    obj.where.Name = Emotive.Data.searchQuery;
    obj.options = new Object();
    obj.options.noCache = true;
    Emotive.Service.submit([new QueryRequestObject(obj, "Emotive.Data.allSearchResults")],
        function(requestArray){
        showSearchResults();
    });
}
function showSearchResults()
{
    if (Emotive.Data.allSearchResults && Emotive.Data.allSearchResults.length > 0)
    {
        $("#search").val('');
        $("#contactOnlyList").empty();
        for (var j=0; j<Emotive.Data.allSearchResults.length; j++)
        {
            var contact = Emotive.Data.allSearchResults[j];
            if (Emotive.Data.contactHash[contact.externalId])
            {
                $("#contactOnlyList").append(  '<li data-theme="c">' +
                    '<a href="javascript:selectContact(\'' + contact.externalId + '\')">' +
                    '<h3 class="ui-li-heading">' + contact.Name + '</h3>' +
                    '<p class="ui-li-desc"><strong>'+ Emotive.Data.accountHash[contact.AccountId].Name +
                    '</strong></p>' +
                    '</a>' +
                    '</li>');
            }
        }
        Emotive.$.refreshListview("#contactOnlyList");
        Emotive.App.changePage("#ContactOnlyPage");
    }
    else
    {
        Emotive.Ui.Dialog.alert("There were no results found for: " + Emotive.Data.searchQuery + ".");
    }
}
