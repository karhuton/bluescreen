
/* TODO
 
 - jwt tokenien expirointi ja fiksumpi sessiohallinta
 - refresh code -nappi + enter ja esc toimimaan code inputissa
 – presenter rooli
 – cookie: muista minut

 */

const express = require('express')
	,jwtParse = require('express-jwt')
	,jwtSign = require('jsonwebtoken')
	,template = require('express-es6-template-engine')
	,bodyParser = require('body-parser')
	,uuid = require('uuid/v4')
	,hex = require('random-hex')
	,moment = require('moment')

const ROOM_TIMEOUT = 60

const ROOMS = {}
const USERS = {}

const REGEX_UUID = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/
const REGEX_ID = /\/([0-9a-fA-F]+)$/

const JWT_SECRET = 'blue-in-the-face-is-the-best-band-ever'

const app = express()

app.engine('html', template);
app.set('views', 'views')
app.set('view engine', 'html')
app.use(express.static('static'))
app.use(jwtParse({ secret: JWT_SECRET, credentialsRequired: false }), function (req, res, next) {
	if ( !req.user ) {
		let user = { id: uuid() }
		let token = jwtSign.sign(user, JWT_SECRET, { expiresIn: '1h' })

		USERS[user.id] = user
		req.user = user
		req.token = token

	}
	next()
})
app.use(bodyParser.raw({ type: 'application/data-url', limit: '5mb' }))
app.use(bodyParser.json())

/***********
 * Routing *
 ***********/

app.get('/', index)
app.post('/upload', upload)
app.get('/download', download)
app.get('/stop', stop)
app.get('/heartbeat', heartbeat)
app.get('/[0-9a-fA-F]+$', index) // request specific roomId


app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port ' + (process.env.PORT || 3000))
})



/*************
 * Responses *
 *************/

function heartbeat(req, res, next) {
	let userId = req.user.id

	let roomId = USERS[userId] ? USERS[userId].roomId : null

	if ( !roomId ) {
		res.status(404).send("User does not have a room");

		return next();
	}

	let room = ROOMS[roomId] ? ROOMS[roomId] : null

	if ( room ) {
		room.participants[userId].timestamp = moment()

		// remove the image data from the reply
		let meta = Object.assign({}, room)
		delete meta.image

		res.status(200)
		.set('Content-Type', 'application/json')
		.set('X-MetaJSON', JSON.stringify(meta))
		.send()

		return next()

	} else {
//		console.warn("heartbeat: no room found for user: " + userId)
		res.status(419).send("Room expired");

		return next();
	}
}

function index(req, res, next) {

	// user wants a specific room OR return existing room
	let userId = req.user.id

	if ( !userId ) {
			res.status(500).send("No user token available")
			return next()
	}

	let pathId = getIdFromPath(req.path)

	if ( pathId ) {
		if ( !ROOMS[pathId] ) {
			res.status(404).send("Not found")
			return next()
		}

		addParticipant(pathId, userId)
	}

	let room

	if ( !USERS[userId].roomId) {
		room = makeRoom(userId)

		if ( room == null ) {
			console.error(`index: couldn't generate new room for user`)
			return res.status(503).render('busy')
		}

	} else {
		room = ROOMS[USERS[userId].roomId]
	}

	if ( moment().diff(moment(room.timestamp), 'minutes') > ROOM_TIMEOUT ) {
		res.status(419).send("Room expired");
		return next()
	}

	updateParticipantCount(room.roomId)

	return res.render('index', {locals: {jwt: req.token, roomId: room.roomId, userId: userId }});

}

function makeRoom(userId) {
	// create new room (try 100 times to find an unused or an expired room)
	for (let i = 0 ; i < 10000 ; i++) {
		let newRoomId = hex.generate().replace(/^#/, '')

		if ( ROOMS[newRoomId] ) {
			if ( moment().diff( ROOMS[newRoomId].timestamp, 'minutes' ) < ROOM_TIMEOUT ) {
				continue
			}
		}

		ROOMS[newRoomId] = {
			roomId: newRoomId
			,timestamp: moment()
			,image: null
			,width: null
			,height: null
			,mimetype: null
			,size: null
			,frame: 0
			,participants: { }
			,participantCount: 0
			,activeParticipants: 0
			,inactiveParticipants: 0
		}

		addParticipant(newRoomId, userId)

		return ROOMS[newRoomId]
	}

	return null
}


function addParticipant(roomId, userId) {
	if ( !userId ) {
		throw `addParticipant: missing usedId`
	}

	if ( !roomId ) {
		throw `addParticipant: missing roomId`
	}

	if ( !ROOMS[roomId] ) {
		throw `addParticipant: unknown roomId: ${ roomId }`
	}

	let room = ROOMS[roomId]
	if ( room.participants[userId] ) {
		console.error(`addParticipant: user already exists. roomId '${ roomId}', userId: ${ userId }`)
		return false
	}

	room.participants[userId] = {
		userId: userId,
		timestamp: moment()
	}

	USERS[userId].roomId = roomId

	updateParticipantCount(roomId)

	return true
}




function upload(req, res, next) {
	let response = getUserAndRoomAndCheckStuff(req, res)

	// we assume getUser... has sent error message to client
	if ( !response ) { return next() }

	let [userId, room, meta ] = response

	if ( !meta.mimetype || !meta.imageWidth || !meta.imageHeight ) {
		res.status(400).send("Missing some of required meta data: mimetype, width, height")
		return next()
	}

	room.mimetype = meta.mimetype
	room.width = meta.imageWidth
	room.height = meta.imageHeight

	if ( !req.body ) {
		res.status(400).send("Image data is missing")
		return next()
	}

	room.image = req.body
	room.imageReady = true
	room.size = req.body.length
	room.frame++

	room.timestamp = moment()

	room.participants[userId].timestamp = moment()

	let responseMeta = Object.assign({}, room)
	delete responseMeta.image

	res.status(200)
	.set('Content-Type', 'application/json')
	.set('X-MetaJSON', JSON.stringify(responseMeta))
	.send()

	return next()
}

function getUserAndRoomAndCheckStuff(req, res, ignoreExpire) {
	let userId = req.user.id

	if ( !userId ) {
		res.status(403).send("Forbidden: no user token found in headers");
		return null
	}

	if ( !USERS[userId] ) {
		res.status(404).send("Not found");
		return null
	}

	let roomId = USERS[userId].roomId
	let room = ROOMS[roomId]

	if ( !room ) {
		res.status(404).send("Not found");
		return null
	}

	if ( !ignoreExpire && moment().isAfter(moment(room.timestamp).add(30, 'minutes')) ) {
		res.status(419).send("Expired");
		return null
	}

	if ( !room.participants[userId] ) {
		room.participants[userId] = { id: userId }
		room.participantCount = Object.keys(room.participants).length
	}

	room.participants[userId].timestamp = moment()

	let meta = {}

	if ( req.header('X-MetaJSON') ) {
		meta = JSON.parse(req.header('X-MetaJSON'))
	}

	return [ userId, room, meta ]
}

function updateParticipantCount(roomId) {
	if ( !roomId) {
		throw `updateParticipantCount: missing roomId`
	}

	if ( !ROOMS[roomId] ) {
		throw `updateParticipantCount: room not found '${ roomId}'`
	}

	let room = ROOMS[roomId]

	let active = 0
	let inactive = 0

	for ( let participantId in room.participants ) {
		let p = room.participants[participantId]

		if ( moment().diff(p.timestamp, 'seconds') > 10 ) {
			inactive += 1
		} else {
			active += 1
		}
	}

	room.activeParticipants = active
	room.inactiveParticipants = inactive
	room.participantCount = active + inactive
}

function download(req, res, next) {
	try {
		let response = getUserAndRoomAndCheckStuff(req, res)

		// we assume getUser... has sent error message to client
		if ( !response ) { return next() }

		let [userId, room, meta ] = response

		// don't include the image data in the meta object
		let returnMeta = Object.assign({}, room)
		delete returnMeta.image

		if ( meta.frame && meta.frame >= returnMeta.frame ) {
			res.status(304)
			.set('X-MetaJSON', JSON.stringify(returnMeta))
			.send("Not modified");

			return next()
		}

		if ( !room.image ) {
			res.status(204)
			.set('X-MetaJSON', JSON.stringify(returnMeta))
			.send("No content");
			return next()
		}

		res.status(200)
		.set('Content-Type', room.mimetype)
		.set('X-MetaJSON', JSON.stringify(returnMeta))
		.end(room.image)
		return next()

	} catch (err) {
		console.error("Failed in download reponse", err)
		res.status(500).send("Fail")
		return next()
	}	
}

function stop(req, res, next) {
	let [userId, room, meta ] = getUserAndRoomAndCheckStuff(req, res, "ignoreExpire")

	let roomId = room.roomId

	ROOMS[roomId].timestamp = moment()
	ROOMS[roomId].mimetype = null
	ROOMS[roomId].width = null
	ROOMS[roomId].height = null
	ROOMS[roomId].frame = 0
	ROOMS[roomId].imageReady = null
	ROOMS[roomId].image = null
	ROOMS[roomId].size = null

	res.status(200).send("OK")
	return next()
}

/***********
 * Helpers *
 ***********/


function getIdFromPath(path) {
	if ( path && REGEX_ID.test(path) ) {
		return path.match(REGEX_ID)[1]
	}

	return null
}

setInterval(roomStatusCheck, 1*1000)

function roomStatusCheck() {
	let keys = Object.keys(ROOMS)

	if ( keys.length == 0 ) {
		console.log("No active rooms")
	} else {
//		console.log("Active rooms: " + keys.length)

		keys.forEach(function(roomId){
			let room = ROOMS[roomId]
			let expired = moment().isAfter(moment(room.timestamp).add(30, 'minutes'))

			if ( room.participants ) {

				updateParticipantCount(roomId)

//				console.log("roomId: " + roomId + " frame: " + room.frame + (room.image ? " " + room.width + "x" + room.height + " (" + Math.round(room.size/1024) + "kb)" : "") + " timestamp: " + moment(room.timestamp).format('YYYY-MM-DD HH:mm:ss') + ( expired ? " (expired)" : "" ) + " active: " + room.activeParticipants + " inactive: " + room.inactiveParticipants)
			}

			if (expired) {
				delete ROOMS[roomId]
			}
		})
	}
}

