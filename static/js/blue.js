/**
 * Blue Screen Live
 *
 * Requires xhttp-json-jwt.js
 */


function init() {

	console.log("Bluescreen started ")

}

/**********************
 * Start "Threads"    *
 **********************/

const INTERVALS = {
	heartbeat: setInterval(heartbeat, 1000)
	, upload: setInterval(upload, 1000)
	, download: setInterval(download, 1000)
}

// initiate first heartbeat quickly, if setInterval is slow
setTimeout(heartbeat, 500)



/**********************
 * Start "Threads"    *
 **********************/

var META = null

function updateMeta(meta) {
	if ( !meta instanceof Object ) {
		throw `updateMeta: argument 'meta' is not an object. got: ${meta}`
	}

	META = meta

	document.querySelector('#participants').innerText = `${META.activeParticipants} user${ META.activeParticipants > 1 ? 's' : ''} here`
}



/******************
 * Heartbeat      *
 ******************/


var failCount = 0

async function heartbeat() {

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

			case "ready":
				if ( META.imageReady ) { // TODO: check timestamp and ignore old image?
					setState('watching')
				}
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
				break;

			case "waiting":
				if ( META.participantCount >= 2 ) { setState('recording') }
				break;

			case "recording":
				if ( META.participantCount < 2 ) { setState('waiting') }
				break;


			/* other states */

			case "error":
				console.log("hearbeat: error state – killing all interval threads")
				clearInterval(INTERVALS.heartbeat)
				clearInterval(INTERVALS.upload)
				clearInterval(INTERVALS.download)
				break;

			default:
				throw `heartbeat: unknown state: ${getState()}`
		}

	} catch (err) {
		console.log("hearbeat failed. fail count: " + failCount)
		failCount++
	}
}



/******************
 * Screen capture *
 ******************/

async function startCapture() {
	try {
		let stream = await navigator.mediaDevices.getDisplayMedia({ 
			video: { cursor: "never" },
			audio: false 
		});

		let video = document.querySelector('#video')
		video.srcObject = stream

		setState('connecting')
		// now wait for heartbeat to change state to 'recording' because
		// we know there's people watching

		// TODO don't wait for heartbeat() to deal with state change

	} catch (err) {
		console.error("Screen capture error:", err)

		setState('error')

		return false
	}

	return true
}

async function stopCapture() {
	let video = document.querySelector('#video')
	let tracks = video.srcObject.getTracks();
  	tracks.forEach(track => track.stop());
  	video.srcObject = null;

  	setState('ready')

	stopUpload()  	
}


/****************************
 * Image upload from stream *
 ****************************/


var UPLOADING = false

async function upload() {
	if ( !getState('recording') ) { return }

	if ( UPLOADING ) {
		console.debug("download: previous download still in progress - skipping interval")
	}

	try {

		console.log("Doing upload, state is " + getState())

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
		DOWNLOADING = false
	}

	DOWNLOADING = false
}



var DOWNLOADING = false

async function download() {
	if ( !getState('watching') ) { return }

	if ( DOWNLOADING ) {
		console.debug("download: previous download still in progress - skipping interval")
	}

	console.log("Doing download, state is " + getState())

	let oldFrame = META.frame || -1

	DOWNLOADING = true
	try {

		let [responseMeta, responseData] = await get('/download', { frame: oldFrame })

		updateMeta(responseMeta)

		if ( META.frame > oldFrame ) {

			let display = document.querySelector('#display')

			if ( !responseData ) {
				console.error("download: new frame but no data")
			} else {
				display.src = responseData
			}
		}

		else if ( META.frame == oldFrame ) {

			console.debug("download: waiting for new content")

		}

		else {

			console.log("download: source has stopped - going back to beginning")
			setState('ready')

		}

	} catch (err) {
		console.error("download: failed: " + err)
		DOWNLOADING = false
	}

	DOWNLOADING = false

}

async function stopUpload() {

	//  always try to close, hide failure from user

	console.log("Doing stopUpload, state is " + getState())

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

const STATE = {
	'ready': true
	,'connecting': true
	,'waiting': true
	,'watching': true
	,'recording': true
	,'notfound': true
	,'error': true
}

var ERROR_TIMEOUT = 10*1000
var ERROR_TIMER = null

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

