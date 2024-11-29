# bluescreen

Bluescreen.live – simplest screen sharing for presentations

Optimized for presentations like powerpoint (no real-time streaming, uses good quality screencaptures)

No cookies, no tracking, no registration, no ads.

No stored data: only 1 frame in memory at a time, removed at disconnect or 5 minute timeout.


## Goals of the software

Bluescreen.live is a very simple screensharing service with the goal:
- optimize quality for presentations and text
- very very simple to use
- just plain http polling, so works on any network
- use very little resources
- should work on old devices, especially older TVs

## Example use cases:

1) Big screen in a meeting room
- direct your smart tv browser to the site
- it shows a rotating join code for anyone to share in the meeting

2) Share on my behalf
- one person can connect to the meeting room screen and use bluescreen
- others can simply share to their screen
- no switching HDMI cables or broadcast adapters

3) Screensharing without a Teams & al.
- share your screen to others from computer-to-computer
- no need to setup teams or other sharing system

4) Mobile screen sharing (doesn't work yet)
- when having an unofficial meeting outside company spaces
- use qr codes to share link


## Mobile screen sharing doesn't work yet

Waiting for this issue on Android Chromium:
https://issues.chromium.org/issues/40418135

Hoping Apple someday implements screen sharing for mobile Safari
(no issue tracker yet)

## TODOs

Things to improve:
- client: scale quality from JPG to PNG based on available bandwidth
- client: don't update if sceen doesn't change
- client: improve robustness and error handling
- client: downgrade from ES6 (cmp. main.js with tv.js)
- server: remove all or most of node dependencies
- server: implement bandwidth and quota limits
- server: implement bad behaving ip banning
- server: move secrets to env variables
- both: reduce and simplify code size to 1/3
