
/* TODO
 

 - blue.js: recording automaattinen laadunsäätö 0,5 -> 1
 - mittaa aika jona yks blue.js upload() kestää -> jos alle 1 sekuntia, jaa aika timeSec/10 = x ja nosta laatua 0.x pykälää aina maximiin asti
 - jos yli sekunti, laske laatua timeSec/10 = x ja pudota 0.x pykälää
 - (tai sit vaan aina 0.1)


 - ohje-ikoni:
 - miten toimii?
 -> screensharing over phone
 -> super simple meeting room tv
 -> allow others to share things via your laptop on meeting room tv, when you're the only one connected
 -> tee näistä mainossivu: bluescreen.live/info

 - salasanasuojaus? ei ole. kiinnostaako? laita viestiä
 - yksityisyydensuoja: (EU:ssa, ei cookieta, ei seurantaa, ei tallenneta mihinkään - vain muistissa - tyhjennetään 5min poistumisen jälkeen )
 - tekijä + yhteystiedot: karhuton.com


 - minifoi staattinen js
 - kevennä metajsonin kokoa

-------

 -> nyt voi julkaista kavereille

-------

 - 6h refresh page jos ei aktiviteettia (huom jwt expires nyt 7h)

 - siivoa käyttämättömät templaattijutut html:stä

 - recording tilassa:
 - etähallinta (fill screen vs show all)
 - etähallinta js trigger browser full screen ?
 - etähallinta stop & share napit
 - etähallinta näytä vierailijoiden määrä -> älä upload jos ei ole vierailijoita

 - voiko kuvia helposti diffata nopeasti? screensharessa usein 1:1.. päivitä vain jos muuttunut?
 - > voisi vaikka itse katsoa mallia tästä: https://github.com/rsmbl/Resemble.js


 */

const express = require('express')
	,jwtSign = require('jsonwebtoken')
	,template = require('express-es6-template-engine')
	,bodyParser = require('body-parser')
	,hex = require('random-hex')
	,moment = require('moment')

const { expressjwt: jwtParse } = require('express-jwt')
const { v4: uuid } = require('uuid')

const ROOM_TIMEOUT = 60

const ROOMS = {}
const USERS = {}

const REGEX_UUID = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/
const REGEX_ID = /\/([\-0-9a-z]+)$/i

const JWT_SECRET = 'blue-in-the-face-is-the-best-band-ever'
const JWT_EXPIRE = '7h'


/*****************
 * Express setup *
 *****************/


const app = express()

if ( process.env.PRODUCTION ) {
	app.use(expressHerokuHttpsRedirect)
}

app.engine('html', template);
app.set('views', 'views')
app.set('view engine', 'html')
app.use(express.static('static'))
app.use(jwtParse({ secret: JWT_SECRET, credentialsRequired: false, algorithms: ["HS256"] }), expressJwtHandler)
app.use(bodyParser.raw({ type: 'application/data-url', limit: '5mb' }))
app.use(bodyParser.json())

app.post('/upload', upload)
app.get('/download', download)
app.get('/stop', stop)
app.get('/heartbeat', heartbeat)
app.get('/tv', indexTv)
app.get('/*', index) // request specific roomId

const reservedRoomNames = ['index', 'upload', 'download', 'tv']

app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port ' + (process.env.PORT || 3000))
})





/*************
 * Responses *
 *************/

function heartbeat(req, res, next) {

	let userId = req.auth.id
	let roomId = USERS[userId] ? USERS[userId].roomId : null

	if ( !roomId ) {
		res.status(404).send("User does not have a room");

		return
	}

	let room = ROOMS[roomId] ? ROOMS[roomId] : null

	if ( room ) {
		room.timestamp = moment()
		room.participants[userId].timestamp = moment()

		// remove the image data from the reply
		let meta = Object.assign({}, room)
		delete meta.image

		res.status(200)
		.set('Content-Type', 'application/json')
		.set('X-MetaJSON', JSON.stringify(meta))
		.send()

		return

	} else {
//		console.warn("heartbeat: no room found for user: " + userId)
		res.status(419).send("Room expired");

		return;
	}
}

function index(req, res, next) {

	// user wants a specific room OR return existing room
	let userId = req.auth.id

	if ( !userId ) {
			res.status(500).send("No user token available")
			return
	}

	let pathId = getIdFromPath(req.path)
	let room

	// this is the case when url has new room
	if ( pathId && !reservedRoomNames.includes(pathId) ) {
		if ( !ROOMS[pathId] ) {
			room = makeRoom(userId, pathId)
		}

		addParticipant(userId, pathId)
	}

	// this is the case where roomId is stored in session
	if ( !USERS[userId].roomId) {
		room = makeRoom(userId)

		if ( room == null ) {
			console.error(`index: couldn't generate new room for user`)
			return res.status(503).render('busy')
		}

	} else {
		room = ROOMS[USERS[userId].roomId]
	}


	updateParticipantCount(room.roomId)

	let initialState = ROOMS[room.roomId].activeParticipants > 1 ? 'ready' : 'empty'

	let fileName = pathId == "tv" ? 'tv' : 'index'

	return res.render( fileName, {
		locals: {
			jwt: req.token,
			initialState: initialState,
			roomId: room.roomId,
			userId: userId
		}
	});

}

function indexTv(req, res, next) {

	return index(req, res, next, 'tv')

}


function makeRoom(userId, roomId) {

	if ( reservedRoomNames.includes(roomId) ) {
		throw `makeRoom: illegal room name`
	}

	let newRoomId = roomId

	if ( !roomId ) {
		// create new room (try several times to find an unused or an expired room)
		let genId
		for (let i = 0 ; i < 10000 ; i++) {
			let tryId = hex.generate().replace(/^#/, '')

			if ( ROOMS[tryId] ) {
				if ( moment().diff( ROOMS[tryId].timestamp, 'minutes' ) < ROOM_TIMEOUT ) {
					continue
				}
			}

			genId = tryId
			break
		}

		if ( !genId ) { throw `makeRoom: can't generate new id` }

		newRoomId = genId
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

	addParticipant(userId, newRoomId)

	return ROOMS[newRoomId]
}


function addParticipant(userId, roomId) {
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

	// TODO maybe just use room.participants[userId] = moment()
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
	if ( !response ) { return  }

	let [userId, room, meta ] = response

	if ( !meta.mimetype || !meta.imageWidth || !meta.imageHeight ) {
		res.status(400).send("Missing some of required meta data: mimetype, width, height")
		return
	}


	room.timestamp = moment()
	room.mimetype = meta.mimetype
	room.width = meta.imageWidth
	room.height = meta.imageHeight
	room.imageReady = moment()

	if ( !req.body ) {
		res.status(400).send("Image data is missing")
		return
	}

	room.image = req.body
	room.size = req.body.length
	room.frame++

	room.participants[userId].timestamp = moment()

	let responseMeta = Object.assign({}, room)
	delete responseMeta.image

	res.status(200)
	.set('Content-Type', 'application/json')
	.set('X-MetaJSON', JSON.stringify(responseMeta))
	.send()

	return
}

function getUserAndRoomAndCheckStuff(req, res, ignoreExpire) {
	let userId = req.auth.id

	if ( !userId ) {
		res.status(403).send("Forbidden: no user token found in headers");
		return null
	}

	if ( !USERS[userId] ) {
		res.status(404).send("User not found");
		return null
	}

	let roomId = USERS[userId].roomId
	let room = ROOMS[roomId]

	if ( !room ) {
		res.status(404).send("Room not found");
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
		if ( !response ) { return }

		let [userId, room, meta ] = response

		// don't include the image data in the meta object
		let returnMeta = Object.assign({}, room)
		delete returnMeta.image

		if ( meta.frame && meta.frame >= returnMeta.frame ) {
			res.status(304)
			.set('X-MetaJSON', JSON.stringify(returnMeta))
			.send("Not modified");

			return
		}

		room.timestamp = moment()

		if ( !room.image ) {
			res.status(204)
			.set('X-MetaJSON', JSON.stringify(returnMeta))
			.send("No content");
			return
		}

		res.status(200)
		.set('Content-Type', room.mimetype)
		.set('X-MetaJSON', JSON.stringify(returnMeta))
		.end(room.image)
		return

	} catch (err) {
		console.error("Failed in download reponse", err)
		res.status(500).send("Fail")
		return
	}
}

function stop(req, res, next) {
	let [userId, room, meta ] = getUserAndRoomAndCheckStuff(req, res, "ignoreExpire")

	let roomId = room.roomId

	clearImage(roomId)

	res.status(200).send("OK")
	return
}

/***********
 * Helpers *
 ***********/



function clearImage(roomId) {
	ROOMS[roomId].mimetype = null
	ROOMS[roomId].width = null
	ROOMS[roomId].height = null
	ROOMS[roomId].frame = 0
	ROOMS[roomId].imageReady = null
	ROOMS[roomId].image = null
	ROOMS[roomId].size = null
}
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
		if ( !process.env.PRODUCTION ) {
//			console.log("No active rooms")
		}
	} else {
		if ( !process.env.PRODUCTION ) {
//			console.log("Active rooms: " + keys.length)
		}

		keys.forEach(function(roomId){
			let room = ROOMS[roomId]
			let expired = moment().isAfter(moment(room.timestamp).add(5, 'minutes'))

			if ( room.imageReady && moment().diff(room.imageReady, 'seconds') >= 5 ) {
				clearImage(room.roomId)
			}

			if ( room.participants ) {

				updateParticipantCount(roomId)

				if ( !process.env.PRODUCTION ) {
//					console.log("roomId: " + roomId + " frame: " + room.frame + (room.image ? " " + room.width + "x" + room.height + " (" + Math.round(room.size/1024) + "kb)" : "") + " timestamp: " + moment(room.timestamp).format('YYYY-MM-DD HH:mm:ss') + ( expired ? " (expired)" : "" ) + " active: " + room.activeParticipants + " inactive: " + room.inactiveParticipants)
				}
			}

			if (expired) {
				delete ROOMS[roomId]
			}
		})
	}
}

function expressHerokuHttpsRedirect(req, res, next) {

  if ( req.headers["x-forwarded-proto"] != "https" ) {
  	res.redirect(302, "https://" + req.hostname + req.originalUrl)
  	res.send()
  	return
  }

  // DO NOT CONTINUE WITH next()
 	next()
}

function expressJwtHandler(req, res, next) {
	if ( !req ) { console.warn("missing req! not doing anything"); return null }

	if ( !req.auth || !req.auth.id ) {
		let user = { id: uuid() }
		let token = jwtSign.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRE })

		USERS[user.id] = user
		req.auth = user
		req.token = token
	}

	next()
}

