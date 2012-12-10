echo "starting test"
emote create myproj
cd myproj
emote add usgs
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
cd ..
emote create sfproj
cd sfproj
emote add _sftest
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
