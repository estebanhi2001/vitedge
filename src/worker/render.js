import router from '__vitedge_router__'
import { isRedirect } from '../utils/response'
import { getSsrManifest } from './assets'
import { getCachedResponse, setCachedResponse } from './cache'
import { getPageProps } from './props'
import { createResponse, buildLinkHeader } from './utils'

export async function handleViewRendering(event, { http2ServerPush, skipSSR }) {
  const cacheKey = event.request.url
  const cachedResponse = await getCachedResponse(cacheKey)
  if (cachedResponse) {
    return cachedResponse
  }

  const [
    { response: propsResponse = {}, options: propsOptions = {} },
    manifest,
  ] = await Promise.all([getPageProps(event), getSsrManifest(event)])

  if (isRedirect(propsResponse)) {
    // Redirect
    return propsResponse
  }

  const initialState =
    (propsResponse.body && (await propsResponse.json())) || {}
  
  
  try {
    const { headers } = event.request
    const contentType = headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const request = event.request.clone()
      initialState.body = JSON.stringify(await request.json())
    }
    else if (contentType.includes("application/text")) {
      const request = event.request.clone()
      initialState.body = await request.text()
    }
    else if (contentType.includes("text/html")) {
      const request = event.request.clone()
      initialState.body = await request.text()
    }
    else if (contentType.includes("application/x-www-form-urlencoded")) {
      const request = event.request.clone()
      let input = await request.text();
      initialState.body = (require('qs')).parse(input);
    }
  } catch (error) {
    console.log(error)
  }

  const {
    html,
    status = propsResponse.status || 200,
    statusText = propsResponse.statusText,
    headers: renderingHeaders,
  } = await router.render(event.request.url, {
    initialState,
    propsStatusCode: propsResponse.status,
    request: event.request,
    manifest,
    preload: true,
    skip: skipSSR,
  })

  const headers = { ...propsOptions.headers, ...renderingHeaders }

  if (html) {
    headers['content-type'] = 'text/html;charset=UTF-8'

    if (http2ServerPush) {
      headers.link = buildLinkHeader(html, http2ServerPush)
    }
  }

  const response = createResponse(html, {
    status,
    statusText,
    headers,
  })

  setCachedResponse(event, response, cacheKey, (propsOptions.cache || {}).html)

  return response
}
