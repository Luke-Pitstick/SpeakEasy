---
title: Quick start
description: Write and speak your first message with a mouse - enter initials, review a suggestion, correct a word, and speak - plus exact spelling mode.
sidebar:
  order: 2
---

This walkthrough uses a mouse or trackpad, the default input. Try it this way first, then set up [webcam gaze or a dedicated eye tracker](../input-setup/).

:::note[Dwell is on by default]
**Dwell activation** starts on, so resting the pointer on a button selects it after one second. The button shows when a dwell is in progress; move off it to cancel. You can also click any button. To select only by clicking, open **Menu → Settings → General** and set **Dwell activation** to **Off**.
:::

## The screen

- The **message strip** at the top shows your initials or text. A microphone status appears beside it.
- **Show phrases** is the bar along the top edge. It switches between writing and phrase review.
- **Menu** is the bar along the bottom edge. It holds **Undo**, **Delete**, **Exact spelling**, **New message**, **Settings**, and more.
- The large area in the middle is Dasher, where you steer to letters.

## Write your first message

Steps 1 to 3 use phrase suggestions, which need [cloud credentials and Gemini turned on](../cloud-features/). Step 4 needs a Cartesia key. Without any accounts, skip to [Exact spelling](#exact-spelling) to write a full message.

1. **Enter initials.** Select **Start writing**. Letters scroll in from the right. Move the pointer right, toward the letter you want, and the view zooms toward it. Each letter you pass through becomes the first letter of one word. Move left to reverse and remove letters. Try `iwac` for a sentence such as "I want a coffee." To skip steering, choose **Menu → Load example initials**, which enters `iwac` for you.

   Click anywhere in Dasher to pause, or press Esc. To resume, select **Start writing**, or rest the pointer on the crosshair in the middle.

2. **Review a suggestion.** Select **Show phrases**. SpeakEasy requests up to six phrases that match your initials. Phrases appear one at a time as they arrive. Select one to review it. Nothing is accepted or spoken until you choose to.

   If none fit, choose **None of these**. You can then select one of your initials, spell that word in full with Dasher, choose **Lock word**, and select **Expand** to ask again. While you review a phrase, **Back** returns to the suggestions.

3. **Correct a word.** In the phrase you are reviewing, select the word you want to change. Then either:

   - choose **Find replacements** to see words that start with the same letter, and select one, or
   - choose **Spell word**, spell the replacement in Dasher, and select **Use word**. **Cancel word** keeps the original.

4. **Speak.** When the wording is right, select **Speak**. The **Delivery tone** control beside it sets how the voice sounds; it starts at the tone chosen in **Menu → Settings → Voice**, which is **Neutral** unless you change it. While speech plays, **Stop** ends it. Speaking a reviewed phrase also accepts it into your message.

   To add another sentence before speaking, select **Lock sentence & keep writing** at the top edge, and enter initials for the next sentence.

When you are done, choose **Menu → New message** to start over. **Menu → Undo** reverses the last change.

## Exact spelling

Exact spelling writes every character yourself, so it works with no accounts and no network connection.

1. Choose **Menu → Exact spelling**. The message strip label changes to **Message**.
2. Select **Start writing** and steer to each character. The alphabet includes lowercase and capital letters, digits, a space, and common punctuation. Move left to reverse.
3. Select **Show phrases** to review the message. If you have Gemini turned on, **Complete** asks for suggested completions; otherwise you can ignore the suggestion area.
4. Select **Speak** if you have set up Cartesia. **Lock sentence** keeps the current sentence and lets you write the next one.

To go back to initials, choose **Menu → Enter initials**.

:::note
Speech always uses Cartesia, including for messages written in exact spelling mode. Without a Cartesia key, the **Speak** button is unavailable and shows "Voice is unavailable. Set up Cartesia in Settings → Voice."
:::

## Next steps

- [Input setup](../input-setup/) for webcam gaze, head pointing, eye trackers, and dwell.
- [Cloud features](../cloud-features/) to turn on phrase suggestions and speech.
- [What leaves your device](../../privacy/data/) before you add credentials.
