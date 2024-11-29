# Bluescreen.live

Simplest screen sharing for presentations and photos.

Optimized for presentations, where 1 frame / second is enough.  
(No real-time streaming, uses good quality screen captures instead.)

No cookies, no tracking, no registration, no ads.

No data storage: only in-memory data on server, 1 frame at a time, removed at disconnect or 5 minute timeout.


## Goals

Bluescreen.live is a very simple screen sharing service with the goal:
- optimize quality for presentations and text
- very very simple to use
- just plain http polling, so works on any network
- use very little bandwidth
- use very little cpu (battery on mobile)
- should work on old devices, especially older TVs

## Example use cases

1) Share on big screen (meeting room)
- open bluescreen.live in the smart tv browser
- anyone can share to the screen without hdmi/adapters/software etc.
- leave the TV on: has rotating random code on the screen

2) Share without big screen (cafés, bars, events)
- presenter on laptop shares QR / link to mobile users
- mobile users can see material on own phone during talk

3) Share on my behalf
- one person can connect to the meeting room screen and use bluescreen
- others can simply share to their screen
- no switching HDMI cables or broadcast adapters

4) Sharing without Teams or Meet
- share your screen to others when not on a call
- no need to setup Teams or Meet just for sharing

5) Sharing at home
- open bluescreen.live in the smart tv browser
- share to the tv from phone (*doesn't work yet*)


## Mobile screen sharing doesn't work yet

Waiting for this issue on Android Chromium:  
https://issues.chromium.org/issues/40418135

Hoping Apple someday implements screen sharing for mobile Safari  
(no issue tracker yet)


## TODOs

Things to improve:
- client: scale quality from JPG to PNG based on bandwidth
- client: don't update if sceen doesn't change
- client: improve robustness and error handling
- client: downgrade from ES6 (cmp. main.js with tv.js)
- client: always show qr code & use "share" button instead of tap screen
- tv client: screen saver of sorts if always on (?)
- server: remove all or most of node dependencies
- server: implement bandwidth and quota limits
- server: implement bad behaving ip banning
- server: move secrets to env variables
- both: reduce and simplify code size to 1/3
