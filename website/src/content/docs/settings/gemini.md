---
title: Gemini settings
description: Cloud phrase generation, the phrase model picker, saved phrases, session conversation, correction memory, and saved facts on the Gemini tab.
sidebar:
  order: 4
---

The **Gemini** tab in **Menu → Settings → Gemini** controls cloud phrase suggestions and everything SpeakEasy remembers to personalize them. Gemini suggests up to six replies from your initials, your locked words, and the conversation. Requests go through OpenRouter. Nothing is spoken or accepted automatically; a suggestion only becomes part of your message when you choose it.

Exact spelling, saved phrases, and correction controls work without any cloud provider. For credentials, see [Cloud features](../../getting-started/cloud-features/). For what each provider receives, see [Your data](../../privacy/data/).

## Cloud generation and phrase model

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Enable Gemini** | Turns cloud phrase generation on. When on, the button reads **Disable Gemini**. Turning it on also turns on automatic learning of preferences from your confirmed messages (see below). | Off | On, Off |
| **Choose phrase model** | Opens the model picker. When open, the button reads **Close model picker**. | Closed | Action |
| **Find a model** | Filters the model list by name or ID. Only appears while the picker is open. | Empty | Free text |
| Model buttons | Each button is an OpenRouter text model, shown as name and ID. Choose one to use it for phrase suggestions. Six are shown at a time. | `google/gemini-3.8-flash` | Text models listed by OpenRouter |
| **Previous models** / **Next models** | Pages through the model list. | - | - |
| **Reload models** | Fetches the model list again. Only appears if loading failed. | - | Action |

A status line under **Enable Gemini** shows the current model and whether an API key is configured, or "Set OPENROUTER_TOKEN in the app .env and restart to connect Gemini." The line above the picker reads **Phrase model:** followed by the model in use. The Gemini on or off choice and the phrase model are remembered across restarts.

Changing the phrase model only affects phrase suggestions. Conversation summaries and memory processing keep using their existing model. Model pricing and response speed vary, so try a suggestion or two after switching.

## Saved phrases

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Clear saved phrases** | Deletes the saved phrase cache on this device. | - | Action |

SpeakEasy saves locked sentences and their initials on this device as soon as you lock them, before speech, including corrections. Saved phrases appear directly when there is no conversation context or Gemini is off. When Gemini is on, matching saved phrases are included in the request so suggestions do not repeat them. Saved phrases are kept across restarts until you clear them.

## Conversation

Moss searches the conversation and your approved memories on this device. If `MOSS_PROJECT_ID` and `MOSS_PROJECT_TOKEN` are not configured, the tab says so and memory search is not connected.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Forget earlier context** | Removes retained conversation turns older than the eight recent turns shown. Only appears when there are earlier turns. | - | Action |
| **Me · Turn N** / **Partner · Turn N** | Each of the eight most recent turns, editable as text. | - | Up to 1,000 characters |
| **Remove turn N** | Removes that turn. | - | Action |
| **Partner message** | A text box for typing or pasting what your conversation partner said. | Empty | Up to 1,000 characters |
| **Add partner message** | Adds the text from **Partner message** as a partner turn. | - | Action |
| **Add my accepted message** | Adds your current accepted message as your turn. | - | Action |
| **Add draft as partner message** | Adds your current accepted message as a partner turn. | - | Action |
| **Clear conversation** | Forgets the session conversation and its local search context. | - | Action |

The conversation is kept only for this session: up to 500 retained turns and 250,000 characters, with older turns discarded beyond either limit. **New message** keeps the conversation; **Clear conversation** forgets it. To add a turn with your eyes, compose it in Dasher first, then choose **Add my accepted message**.

## Personal memory (corrections)

This section learns exact words and expansions from corrections you commit with **Use phrase** or **Use word**. Previews, rejected suggestions, and partner speech are never saved. **Undo** retracts a learned correction. Up to 2,000 corrections are kept on this device until you forget them. The local database is not encrypted by the app, and there is no backup or sync.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Learn my corrections** | Turns correction learning on. When on, the button reads **Stop learning corrections**. | Off | On, Off |
| **Use memory in Gemini** | Sends relevant learned vocabulary and examples to Gemini with phrase requests. When on, the button reads **Stop using memory in Gemini**. | Off | On, Off |
| **Vocabulary (N)** / **Corrections (N)** | Switches between the learned word list and the list of saved corrections. | **Vocabulary** | **Vocabulary**, **Corrections** |
| **Forget all corrections** | Deletes every saved correction and the list of forgotten words. | - | Action |

Both switches are remembered across restarts.

In the **Vocabulary** view:

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Find a learned word** | Filters the word list. | Empty | Free text |
| **Clear word filter** | Clears the filter. | - | Action |
| **Forget** *word* | Stops using that word, and saved examples containing it, in memory context. Other learned words stay available. A new explicit correction can teach the word again. | - | Action |
| **Previous words** / **Next words** | Pages through the list, twelve words at a time. | - | - |

In the **Corrections** view, each saved correction shows the original text, the accepted text, and the words learned from it:

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Previous memory** / **Next memory** | Moves between saved corrections. | - | - |
| **Forget this correction** | Deletes this correction and the words derived from it. Other corrections may still contain the same words. | - | Action |
| **Replace with my accepted message** | Replaces the accepted text of this correction with your current accepted message. Compose the corrected text in Dasher first. | - | Action, up to 500 characters |

## Preferences and saved sentences

SpeakEasy saves your confirmed messages on this device when you choose a phrase, lock a sentence, or choose **Speak**. With Gemini enabled, clear personal preferences in those messages and relevant recent conversation are learned automatically through OpenRouter. Partner speech and unselected suggestions never teach your preferences. A line in this section says whether automatic learning is on; it follows **Enable Gemini** and needs `OPENROUTER_TOKEN`.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Use saved facts in suggestions** | Lets relevant saved facts go to the suggestion model. When on, the button reads **Stop using saved facts**. | On | On, Off |
| **Saved facts (N)** / **Saved sentences (N)** | Switches between saved facts and saved sentences. | **Saved facts** | **Saved facts**, **Saved sentences** |
| **Previous facts** / **Next facts**, or **Previous sentences** / **Next sentences** | Moves between entries in the current view. | - | - |
| **Forget all preference facts and sentences** | Deletes every saved fact and sentence, and clears the sentence suggestion cache. | - | Action |

**Use saved facts in suggestions** is remembered across restarts. Turn it off to keep saved facts on the device without sending them to the model.

For a saved fact, SpeakEasy shows the fact, its source message and initials, the evidence quote, and why it was linked to a context. You can edit each field:

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Relationship** | What the fact is about. Required. | From the learned fact | Up to 80 characters |
| **Value** | The fact itself. Required. | From the learned fact | Up to 160 characters |
| **Game** | Optional game the fact applies to. | From the learned fact | Up to 100 characters |
| **Topic** | Optional topic the fact applies to. | From the learned fact | Up to 100 characters |
| **Related terms (comma separated)** | Words that help find the fact. | From the learned fact | Up to 10 terms, 600 characters |
| **Use draft for** *field* | Fills the field with your current accepted message, so you can edit with your eyes. | - | Action |
| **Clear** *field* | Empties the field. | - | Action |
| **Save fact changes** | Saves your edits. | - | Action |
| **Forget this fact** | Deletes the fact and its search entry, and cancels any pending generation that could use it. Its source sentence stays until you forget it. | - | Action |

For a saved sentence, SpeakEasy shows the sentence and its initials:

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Retry learning from this sentence** | Runs preference learning on this sentence again. Only available while automatic learning is on. | - | Action |
| **Forget this sentence and its facts** | Deletes the sentence and every fact learned from it. | - | Action |

Forgotten facts are not relearned on their own. Only an explicit **Retry learning from this sentence** can save the preference again.
