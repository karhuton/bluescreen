/**
 * Vanilla ES5 get/post with JWT sessions JSON as metadata
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

const REGEX_BEARER = /^Bearer\s(.+)$/
const REGEX_MIME_JSON = /^application\/json;/


/**
 * @param { string } url
 * @param { object } meta (optional) JSON
 * @param { data } data (optional)
 */
function get(url, meta, data) { return getWithToken(url, __JWT_TOKEN, meta, data)}

function post(url, meta, data) { return postWithToken(url, __JWT_TOKEN, meta, data) }

function getWithToken(url, token, meta, data) { return httpRequest('GET', url, token, meta, data) }

function postWithToken(url, token, meta, data) { return httpRequest('POST', url, token, meta, data) }



/**
 * XMLHttpRequest with JWT token and MetaData
 *
 * @param { string } method "GET" or "POST"
 * @param { string } url
 * @param { string } token (optional) raw jwt token that goes into Authorization: Bearer xxxx
 * @param { object } meta (optional) for JSON.stringify() that does into MetaData
 * @param { object } data (optional) for content (type "application/data-url")
 * @param { function } callback (optional) successful callback
 * @return Promise successful return: [ meta, data ]
 */
function httpRequest(method, url, myToken, myMeta, myData) {

	let promise = new Promise((resolve, reject) => {

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
			    	return reject()

			    }

			    if ( this.status == 404 ) {
			    	console.error("httpRequest: response status is 404: not found")
			    	console.error("myMeta:", myMeta)
			    	return reject()

			    }

			    if ( this.status != 200 && this.status != 304 ) {
			    	console.error("httpRequest: response status is not 200 nor 304 ")
			    	console.error("myMeta:", myMeta)
			    	return reject()
			    }

		    	let responseMeta, responseData

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

				return resolve([responseMeta, responseData])

			} catch (err) {
				console.error("httpRequest (XMLHttpRequest) error:", err)

				reject()
			}
		}

		if ( myData ) {
			XHR.setRequestHeader("Content-Type", "application/data-url");
			XHR.send(myData);
		} else {
			XHR.send()
		}

	})

	return promise
}	
