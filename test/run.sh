echo "starting test"
emote create myproj --template usgs
cd myproj
emote deploy
emote test
