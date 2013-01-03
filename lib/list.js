

        if(command[1] === 'templates') {
            create.listTemplates(finished);
        } else if(command[1] === 'samples') {
            mmsLogin(function() {
                download.listSamples(finished);
            });
        } else {
            common.exit('Must list one of: samples, templates');
        }



var listMap = {
    app: function() { 
    },
    model: function() {
    },
    proxy: function() { 
    },
    resource: function() {
    },
    template: function() { 
    }
};

function doit(artifactType,artifactName) {
    
}