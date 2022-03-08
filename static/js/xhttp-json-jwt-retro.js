/**
 * Retro get/post with JWT sessions JSON as metadata
 * on asynchronous XMLHttpRequest
 *
 */



/**********************
 * Session management *
 **********************

/* Automated single token storage */
const __JWT_TOKEN = JWT_TOKEN_FROM_PAGE_LOAD


/***************************
 * XMLHttpRequest wrappers *
 ***************************/

const REGEX_BEARER = new RegExp("^Bearer\s(.+)$")
const REGEX_MIME_JSON = new RegExp("^application\/json;")


/**
 * @param { string } url
 * @param { object } meta (optional) JSON
 * @param { data } data (optional)
 */
function get(url, meta, data, callback) { return getWithToken(url, __JWT_TOKEN, meta, data, callback)}

function post(url, meta, data, callback) { return postWithToken(url, __JWT_TOKEN, meta, data, callback) }

function getWithToken(url, token, meta, data, callback) { return httpRequest('GET', url, token, meta, data, callback) }

function postWithToken(url, token, meta, data, callback) { return httpRequest('POST', url, token, meta, data, callback) }



/**
 * XMLHttpRequest with JWT token and MetaData
 *
 * @param { string } method "GET" or "POST"
 * @param { string } url
 * @param { string } token (optional) raw jwt token that goes into Authorization: Bearer xxxx
 * @param { object } meta (optional) for JSON.stringify() that does into MetaData
 * @param { object } data (optional) for content (type "application/data-url")
 * @param { function } callback (optional) successful callback
 */
function httpRequest(method, url, myToken, myMeta, myData, myCallback) {

	const XHR = new XMLHttpRequest();

	XHR.open(method, url, true);

	if ( myToken ) {
		XHR.setRequestHeader('Authorization', 'Bearer ' + myToken)
	}

	if ( myMeta ) {
		XHR.setRequestHeader("X-MetaJSON", JSON.stringify(myMeta) )
	}

	XHR.onreadystatechange = function() {
		try {
		    if (this.readyState !== XMLHttpRequest.DONE) { return }

		    if ( this.status == 419 ) {
		    	console.error("httpRequest: response status is 419: session expired")

		    	return myCallback(null)
		    }

		    if ( this.status == 404 ) {
		    	console.error("httpRequest: response status is 404: not found")
		    	console.error("myMeta:", myMeta)

		    	return myCallback(null)

		    }

		    if ( this.status != 200 && this.status != 304 ) {
		    	console.error("httpRequest: response status is not 200 nor 304 ")
		    	console.error("myMeta:", myMeta)

		    	return myCallback(null)
		    }

	    	var responseMeta, responseData

	    	if ( XHR.getResponseHeader('X-MetaJSON') ) {
	    		responseMeta = JSON.parse( XHR.getResponseHeader('X-MetaJSON') )
	    	}

	    	if ( this.status == 200 && this.response != null && this.response != "") {
	    		if ( REGEX_MIME_JSON.test(XHR.getResponseHeader('Content-Type')) ) {
	    			responseData = JSON.parse( this.response )
	    		} else {
	    			responseData = this.response
	    		}
	    	}

			return myCallback(responseMeta, responseData)

		} catch (err) {
			console.error("httpRequest (XMLHttpRequest) error:", err)

			return myCallback(null)
		}
	}

	if ( myData ) {
		XHR.setRequestHeader("Content-Type", "application/data-url");
		XHR.send(myData);
	} else {
		XHR.send()
	}
}	
