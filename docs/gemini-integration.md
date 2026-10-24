# Gemini expansion integration

Selected model: `google/gemini-3-flash-preview` through OpenRouter. Request up to six distinct complete suggestions, use approved conversational context, stream completed candidates, and disable reasoning. Dasher navigation remains on local PPM.

The development comparison on 60 public dialogue replies recovered the exact reference among six suggestions on 24/60 requests with context versus 6/60 without. Contextual first-valid latency was 0.97 s median / 1.38 s p95. These measurements inform the selection but do not establish production reliability or gaze usability. The benchmark harness, raw data and downloaded runtimes were removed at the user's request.

Implementation must keep the key and network requests in Electron's main process, validate requests and candidates, cancel superseded generations, reject stale revisions, and publish only at safe interaction boundaries. Model output cannot accept wording or trigger speech. Conversation is explicitly entered or added by the user, remains session-only, and must be clearable. Never send eye-tracking data.

Status: model selection accepted; product integration in progress.
