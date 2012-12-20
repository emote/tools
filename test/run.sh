if [ -z "$EMOTE_TESTS" ]
then
    echo "The EMOTE_TESTS environment variable must be set to the location of the install emotetests node module".
    echo "You can install that via 'npm install emotetests'"
    exit 1
fi

if [ ! -r "$EMOTE_TESTS"/bin/functions.sh ]
then
    echo "The EMOTE_TESTS environment variable does not appear to point to the emotetests node module."
    echo "You can install that via 'npm install emotetests'"
    exit 1
fi

testsdir="$EMOTE_TESTS"

. $testsdir/bin/functions.sh

echo "starting test"
jettypid=$(runJetty)
emote create weather
cd weather
emote getWsdl weather 'http://wsf.cdyne.com/WeatherWS/Weather.asmx?WSDL' Weather WeatherSoap
sed 's/false/true/' model/weather/wsdlOps.json > wsdlOps.json.new
mv wsdlOps.json.new model/weather/wsdlOps.json
emote generateFromWsdl weather
emote build
emote deploy
mkdir -p test/default
cp $testsdir/test/index.js test/default
emote test
kill -9 $jettypid
cd ..

emote create myproj
cd myproj
emote add all usgs --template _usgstest
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
cd ..

emote create sfproj
cd sfproj
emote add all sfdc --template _sftest
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
cd ..

