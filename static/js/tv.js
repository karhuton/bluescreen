/**
 * Blue Screen Live
 *
 * Simplified Smart TV version of the view-only client
 *
 * Requires xhttp-json-jwt-retro.js
 *
 */


function init() {

	mainLoop()

}


/**********************
 * Main loop          *
 **********************/


var MAIN_LOOP = null
var LOOP_COUNTER = 0

function mainLoop() {

	if ( LOOP_COUNTER >= 10 ) {
		setState('error')
		clearTimeout(MAIN_LOOP)
		return
	}
	else if ( LOOP_COUNTER > 0) {

		MAIN_LOOP = setTimeout(mainLoop, 1000)
		LOOP_COUNTER++
		return
	}

	MAIN_LOOP = setTimeout(mainLoop, 1000)
	LOOP_COUNTER = 1

	try {
		switch (getState()) {

			case "empty":
			case "ready":
				heartbeat(function () {
					LOOP_COUNTER = 0
				})
				break

			case "watching":
				download(function () {
					LOOP_COUNTER = 0
				})
				break

			case "error":
				clearTimeout(MAIN_LOOP)
				return false

			default:
				throw "mainLoop: unknown state: " + getState()

		}

	} catch (err) {
		setState('error')
		alert("mainLoop: " + err)
	}
}




/******************
 * META           *
 ******************/


var META = null

function updateMeta(meta) {
	if ( !meta instanceof Object ) {
		throw "updateMeta: argument 'meta' is not an object. got: " + meta
	}

	META = meta

	var others = META.activeParticipants - 1

	if ( others > 0 ) {
		document.querySelector('#participants')
			.innerText = others + " other person" + (others > 1 ? 's' : '') + " here!"
	} else {
		document.querySelector('#participants').innerText = 'No other persons here.'
	}

}



/******************
 * Heartbeat      *
 ******************/


var HEARTBEAT_FAIL_COUNT = 0

function heartbeat(mainLoopCallback) {

	if ( HEARTBEAT_FAIL_COUNT > 5 ) {
		setState('error')
		return
	}

	get("/heartbeat", null, null, function(responseMeta, responseDataIgnored) {

		try {
			updateMeta(responseMeta)

			HEARTBEAT_FAIL_COUNT = 0

			switch ( getState() ) {

				/* viewer states */

				case "empty":
					if ( META.imageReady ) {
						setState('watching')
					}
					else if ( META.activeParticipants >= 2 ) {
						setState('ready')
					}
					break;

				case "ready":
					if ( META.imageReady ) {
						setState('watching')
					}
					else if ( META.activeParticipants < 2 ) {
						setState('empty')
					}
					break;

				case "watching":
					if ( !META.imageReady ) {
						setState('ready')
					}
					break;

				/* other states */

				case "error":
					console.log("hearbeat: error state")
					break;

				default:
					throw "heartbeat: unknown state: " + getState()
			}

		} catch (err) {
			console.log("hearbeat failed. fail count: " + HEARTBEAT_FAIL_COUNT)
			HEARTBEAT_FAIL_COUNT++
		}

		mainLoopCallback()

	})
}


/*******************
 * Image download  *
 *******************/


function download(mainLoopCallback) {

	var display = document.querySelector('#display')

	// if display.src is empty, don't use oldFrame so we always
	// get a new frame (this happens when joining page during screen cap)
	var oldFrame = display.src ? META.frame || -1 : -1


	get('/download', { frame: oldFrame }, null, function (responseMeta, responseData) {

		try {

			updateMeta(responseMeta)

			if ( META.frame > oldFrame ) {

				if ( !responseData ) {
					alert("download: new frame but no data")
				} else {
					display.src = responseData
				}
			}

			else if ( META.frame == oldFrame ) {

				console.debug("download: no new content, trying again")

			}

			else {

				console.log("download: source has stopped - going back to beginning")
				setState('ready')

			}

		} catch (err) {
			alert("download: failed: " + err)
		}

		mainLoopCallback()
	})
}



/****************
 * State maskin *
 ****************/

const STATE = {
	'empty': true
	,'ready': true
	,'watching': true
	,'notfound': true
	,'error': true
}

const ERROR_TIMEOUT = 10*1000
var ERROR_TIMER = null


function setState(status) {
	var body = document.querySelector("body")

	if ( !STATE[status] ) { throw "setState: unknown state: " + status }

	if ( body.classList.contains(status) ) { return status }

	body.classList.add(status);

	var stateNames = Object.keys(STATE)

	for ( var i = 0 ; i < stateNames.length ; i++ ) {
		var state = stateNames[i]

		if ( state != status ) {
			body.classList.remove(state);
		}
	}

	if (status == 'error') {

		ERROR_TIMER = setTimeout(function() {
			window.location.reload(true);
		}, ERROR_TIMEOUT)

	} else {

		clearTimeout(ERROR_TIMER)
	}
}

// getState() => current state
// getState('foo', 'bar') => 'foo' or 'bar' if current state, null otherwise
function getState() {
	var body = document.querySelector("body")

	if (arguments.length > 0 ) {
		for ( var i = 0 ; i < arguments.length ; i++ ) {
			if ( body.classList.contains(arguments[i]) ) {
				return arguments[i]
			}
		}

		return null

	} else {

		var stateNames = Object.keys(STATE)

		for ( var i = 0 ; i < stateNames.length ; i++ ) {
			var state = stateNames[i]

			if ( body.classList.contains(state) ) { return state }
		}

		throw "getState: Failed to get state from body element"
	}
}

