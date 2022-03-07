/**
 * Blue Screen Live
 *
 * Requires xhttp-json-jwt.js
 */


function init() {

	console.log("Bluescreen started ")

	mainLoop()

}

/**********************
 * Main loop          *
 **********************/

var STOP_EVERYTHING = false

async function mainLoop() {
		while ( STOP_EVERYTHING == false ) {

		try {
			switch (getState()) {

				case "empty":
				case "ready":
				case "connecting": // TODO: check timestamp and expire
				case "waiting":
					await heartbeat()
					break

				case "watching":
					await download()
					break

				case "recording":
					await upload()
					break

				case "error":
					return false

				default:
					throw `heartbeat: unknown state: ${getState()}`

			}
		} catch (err) {
			console.error("Main loop error: " + err)
			//setState('error')
		}

		await sleep(200)
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms || 1))
}


/**********************
 * Start "Threads"    *
 **********************/

var META = null

function updateMeta(meta) {
	if ( !meta instanceof Object ) {
		throw `updateMeta: argument 'meta' is not an object. got: ${meta}`
	}

	META = meta

	let others = META.activeParticipants - 1

	if ( others > 0 ) {
		document.querySelector('#participants')
			.innerText = `${ others } other person${ others > 1 ? 's' : ''} here!`
	} else {
		document.querySelector('#participants').innerText = 'No other persons here.'
	}

}



/******************
 * Heartbeat      *
 ******************/


var failCount = 0
var beatInProgress = false

async function heartbeat() {
	if ( beatInProgress ) { console.log("Skipping hearbeat because it's in progress."); return }

	beatInProgress = true

	if ( failCount > 5 ) {
		setState('error')
		return
	}

	try {
		// TODO reduce heartbeats when download & upload are working

		let [ meta, dataNotUsed ] = await get("/heartbeat")
		updateMeta(meta)

		failCount = 0


		switch ( getState() ) {

			/* viewer states */

			case "empty":
				if ( META.imageReady ) {
					setState('watching')
				}
				else if ( META.activeParticipants >= 2 ) {
					setState('ready')
				}
				await sleep(1000)
				break;

			case "ready":
				if ( META.imageReady ) {
					setState('watching')
				}
				else if ( META.activeParticipants < 2 ) {
					setState('empty')
				}
				await sleep(500)
				break;

			case "watching":
				if ( !META.imageReady ) {
					setState('ready')
				}
				break;

			/* recorder states */

			case "connecting": // TODO: check timestamp and expire
				if ( Object.keys(META).length > 0 ) {
					setState('waiting')
				}
				await sleep(500)
				break;

			case "waiting":
				if ( META.participantCount >= 2 ) { setState('recording') }
				break;

			case "recording":
				if ( META.participantCount < 2 ) { setState('waiting') }
				break;


			/* other states */

			case "error":
				console.log("hearbeat: error state")
				// clearInterval(INTERVALS.heartbeat)
				// clearInterval(INTERVALS.upload)
				// clearInterval(INTERVALS.download)
				break;

			default:
				throw `heartbeat: unknown state: ${getState()}`
		}

	} catch (err) {
		console.log("hearbeat failed. fail count: " + failCount)
		failCount++
	}

	beatInProgress = false
}



/******************
 * Screen capture *
 ******************/

async function startCapture() {
	try {

		if ( !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia ) {
			alert("Your browser doesn't support screen sharing with a web browser.\n\nAt the moment (last checked 6.3.2022) you'll likely need a computer to share your screen.")
			return false
		}

		let stream = await navigator.mediaDevices.getDisplayMedia({
			video: { cursor: "never" },
			frameRate: 1,
			audio: false
		});

		let video = document.querySelector('#video')
		video.srcObject = stream

		setState('connecting')
		// now wait for heartbeat to change state to 'recording' because
		// we know there's people watching

		// TODO don't wait for heartbeat() to deal with state change


		stream.getVideoTracks()[0].addEventListener('ended', () => {
			if ( stopCapturePushed ) {
				console.log('screensharing was ended by stopCapture() - not doing anything')
				return
			}

			console.log('screensharing was ended by event - calling stopCapture()')

			stopCapture()
		})

	} catch (err) {
		if ( err.name == "NotAllowedError" ) {
			console.log("Screen capture denied - going back to ready state")

			setState('ready')

			return false
		}

		console.error("Screen capture error:", err)

		setState('error')

		return false
	}

	return true
}

var stopCapturePushed = false

async function stopCapture() {
	stopCapturePushed = true

	let video = document.querySelector('#video')

	if ( video && video.srcObject ) {
		let tracks = video.srcObject.getTracks();
	  	tracks.forEach(track => track.stop());
	  	video.srcObject = null;
	}

  	setState('ready')

	stopUpload()
}


/****************************
 * Image upload from stream *
 ****************************/


async function upload() {
	if ( !getState('recording') ) { return }

	try {

		//console.log("Doing upload, state is " + getState())

		let videoElement = document.querySelector('#video')
		let canvasElement = captureImageFromVideo(videoElement)

		let data = canvasElement.toDataURL(ENCODER[QUALITY].type, ENCODER[QUALITY].quality)

		let meta = {
			imageWidth: canvasElement.width,
			imageHeight: canvasElement.height,
			mimetype: ENCODER[QUALITY].type
		}

		let [responseMeta, responseData] = await post('/upload', meta, data)

		updateMeta(responseMeta)

	} catch (err) {

		console.error("upload: failed: " + err)
	}

}


async function download() {
	if ( !getState('watching') ) { return }

	try {

		let display = document.querySelector('#display')

		// if display.src is empty, don't use oldFrame so we always
		// get a new frame (this happens when joining page during screen cap)
		let oldFrame = display.src ? META.frame || -1 : -1

		let [responseMeta, responseData] = await get('/download', { frame: oldFrame })

		updateMeta(responseMeta)

		if ( META.frame > oldFrame ) {



			if ( !responseData ) {
				console.error("download: new frame but no data")
			} else {
				display.src = responseData
			}
		}

		else if ( META.frame == oldFrame ) {

			console.debug("download: waiting for new content")

			await sleep(500)
		}

		else {

			console.log("download: source has stopped - going back to beginning")
			setState('ready')

		}

	} catch (err) {
		console.error("download: failed: " + err)
	}

}

async function stopUpload() {

	//  always try to close, hide failure from user

	console.log("stop upload. state is " + getState())

	try {

		let [meta, data] = await get('/stop')

	} catch ( err ) {

		console.warn("stopUpload: failed to stop: " + err)

	}

	return true
}


function captureImageFromVideo(video) {
	let canvas = document.createElement('canvas')
	let scale = (1920 / video.videoWidth)

	if ( video.videoHeight > video.videoWidth ) {
		scale = 1080 / video.videoHeight
	}

	if ( scale > 1 ) { scale = 1 }

	let width = Math.round(video.videoWidth * scale)
	let height = Math.round(video.videoHeight * scale)
	canvas.width = width
	canvas.height= height
	video.setAttribute('width', width)
	video.setAttribute('height', height)
	canvas.getContext('2d').drawImage(video, 0,0, width, height)

	return canvas
}



/****************
 * State maskin *
 ****************/


function setState(status) {
	let body = document.querySelector("body")

	if ( !STATE[status] ) { throw "Bad state: " + status }
	
	if ( body.classList.contains(status) ) { return status }

	body.classList.add(status);
	
	for ( let [state, notused] of Object.entries(STATE) ) {
		if ( state != status ) {
			body.classList.remove(state);
		}	
	}

	if (status == 'error') {
		ERROR_TIMER = setTimeout(function() { window.location.reload(true); }, ERROR_TIMEOUT)
	} else {
		clearTimeout(ERROR_TIMER)
	}
}

// getState() => current state
// getState('foo', 'bar') => 'foo' or 'bar' if current state, null otherwise
function getState() {
	let body = document.querySelector("body")

	if (arguments.length > 0 ) {
		for ( let i = 0 ; i < arguments.length ; i++ ) {
			if ( body.classList.contains(arguments[i]) ) { return arguments[i] }
		}

		return null

	} else {
		for ( let [state, notused] of Object.entries(STATE) ) {
			if ( body.classList.contains(state) ) { return state }
		}

		throw "Failed to get state from body"
	}
}

/***********
 * Quality *
 ***********/

var QUALITY = 1

const ENCODER = {
	0: { type: 'image/jpeg', quality: 0.5 }
	,1: { type: 'image/jpeg', quality: 0.7 }
	,2: { type: 'image/jpeg', quality: 0.92 }
	,3: { type: 'image/png', quality: 1.0 }
}

