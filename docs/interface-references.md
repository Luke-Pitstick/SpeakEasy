# Interface references and revised direction

October 23, 2026. This direction supersedes the decorative workspace mockup in the initial implementation plan.

The user requested no green, fewer gaze targets, a clean flat interface, and stronger fidelity to Dasher and SpeakFaster. The implementation uses neutral white/charcoal surfaces, a blue selection/focus accent, straight dividers, and square targets. There are no gradients, shadows, branding illustrations, numbered sections, metrics, or decorative badges in the communication view.

## Inspected pictures

### Dasher

[Original Dasher screenshot](https://commons.wikimedia.org/wiki/File:Dasher.png), showing the direct nested character stream and central crosshair:

![Dasher reference screenshot](https://upload.wikimedia.org/wikipedia/commons/c/cc/Dasher.png)

Retain the nested letter regions, readable character labels, continuous zooming/reversal, and plain crosshair. Remove the added seven-letter alphabet groups. The original screenshot's green colors are reference material only; they are deliberately not used in SpeakEasy.

### SpeakFaster

[Published Figure 1](https://www.nature.com/articles/s41467-024-53873-3/figures/1), inspected in the browser, showing initials input and two columns of phrase choices:

![SpeakFaster reference figure](https://media.springernature.com/lw1200/springer-static/image/art%3A10.1038%2Fs41467-024-53873-3/MediaObjects/41467_2024_53873_Fig1_HTML.png)

The [Google Research demonstration](https://research.google/blog/speakfaster-revolutionizing-communication-for-people-with-severe-motor-impairments/) also shows the abbreviated-entry and refinement flow.

Retain the simple text input and large phrase choices. Four choices use two columns so Dasher retains usable height in the smaller Electron window. Candidate selection accepts text; it does not reproduce the upstream direct speech action. Actual speech remains deferred.

## Control budget

- No bottom toolbar. Clicking the Dasher surface toggles pause/resume; Space or Enter does the same when focused. Escape pauses.
- One header Menu exposes Undo, Delete, and secondary controls.
- One input action: Expand, Complete, or Use word, depending on the current task.
- Up to four phrase choices, appearing only when available.
- Word correction appears in the same reserved choice area after selecting a word. It replaces the phrase choices rather than adding another toolbar.
- Mode selection, initials editing, previous phrase, New message, demo examples, and settings are in Menu. Experimental model/latency conditions never occupy the composition screen.

Both panels keep one authoritative composition state. Plain word targets in the message allow correction, and pending dwell is canceled on content changes, Escape, focus loss, and resize. No actual eye-tracker usability claim follows from mouse/synthetic tests.

## Skill guidance

The `ui-ux-pro-max` style search matched Minimalism & Swiss Style: essential elements, neutral high-contrast color, flat surfaces, no unnecessary decoration. The initial general design-system search returned a marketing-page pattern, which was rejected as unsuitable. The UX searches did not return a verified gaze-specific progressive-disclosure match; the control budget comes from the user's instruction and the PRD's gaze invariants, not from an invented database recommendation.

## Dasher geometry and pointer revision

The starting alphabet occupies 90% of the visible height inside one large, unlabeled parent box. The parent uses the shared blue/gray palette and the same camera transform as its children; it contributes no character. The first letters are nested along its right edge. A minimum visible allocation keeps all 26 initials on screen in a–z order before steering; the remaining space follows prediction weights, with a cap that keeps every starting letter ahead of the crosshair. Initials use a cached word-initial PPM over the authored demo sentences; exact spelling uses a separate character PPM. Uniform sizing remains an explicit comparison setting. Weights are fixed per branch, so likely letters get more space without targets changing underneath steering. Boxes adapt the pinned JS source's target-right piecewise height-to-leading-edge projection and extend to the full panel's right edge. The positive-side knots place small previews at 80-92% of panel width, narrowing the upcoming letter column on the right; large active boxes still expand through the crosshair normally. Continuations are drawn inside their parent boxes, with labels on a separate upper layer. The square-box projection and fitted-width cap were removed after comparison with the original screenshot. A single displacement-controlled camera transform keeps zoom continuous when children appear or a root changes; colors use the character path rather than relative root depth. Resizing scales the existing branch and recomputes its horizontal geometry instead of rebuilding from text. Pause/resume also keeps the camera.

The phrase panel is compact while entering text, giving Dasher the remaining height. Phrase/refinement choices expand only at paused boundaries; starting or resuming entry collapses them. No asynchronous response resizes an actively steered viewport.

Visible nesting follows the upstream JS size gates: `ControllerPointer._arrange_children` prepares on-screen children at 4 CSS pixels high, while `Viewer._render_rect` waits until a box is at least 10 pixels high before painting it. The local drawing cutoff scales down on short panels so all 26 starting letters remain visible with some space left for prediction sizing. The local renderer also hides the corresponding small label. Preparing a continuation does not make it visible. There is no fixed two-layer display cap; deeper continuations appear as they grow and disappear when reversing makes them small again. These separate thresholds replace the earlier 2-pixel spawn-and-draw cutoff that produced the dense right-edge strips.

The canvas itself receives clicks, including clicks over painted boxes and empty space. Each physical click supplies its own pointer sample before toggling steering; a prior pointer-enter/move event is not required. Layout measurements and engine state synchronize before paint so expanding or collapsing the phrase tools cannot leave a resumed engine waiting for another mouse move. The small pause hint is passive text, not a separate activation target.

An input ring shows the current mouse/sample position, with a vector from the center and a pixel-distance readout. Its coordinates share the same full-panel space as the letter viewport. The vector is dashed while paused, solid while steering, and hidden when input leaves the panel or focus is lost. This feedback represents the current input adapter; a hardware gaze tracker is still not connected.
